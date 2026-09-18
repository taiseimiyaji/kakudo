import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";
import { sourceUrlSchema } from "../../shared/quote";

export class ResourceUnavailable extends Error { constructor(message = "資料を取得できませんでした。") { super(message); } }
export type Address = { address: string; family: number };
export type ResourceDocument = { url: string; title: string; text: string; accessedAt: string };
export interface ResourceFetcher { fetch(url: string): Promise<ResourceDocument> }
export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
export function checkedUrl(raw: string): URL {
  const parsed = sourceUrlSchema.safeParse(raw);
  if (!parsed.success) throw new ResourceUnavailable("HTTP(S)の公開URLを指定してください。");
  const url = new URL(parsed.data); const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || !host.includes(":") && !host.includes(".") || isIP(host) && !publicAddress(host)) throw new ResourceUnavailable("非公開アドレスは取得できません。");
  if (url.port && !["80", "443"].includes(url.port)) throw new ResourceUnavailable("資料取得はHTTP/HTTPSの標準ポートのみ対応しています。");
  return url;
}
export function pinnedOptions(url: URL, address: Address, signal: AbortSignal): RequestOptions {
  return { method: "GET", agent: false, signal, maxHeaderSize: 16384, family: address.family,
    headers: { Accept: "text/html, text/plain, text/markdown", "Accept-Encoding": "identity", "User-Agent": "Kakudo-PoC/0.1" },
    lookup: (_host, options, callback) => { if (options.all) callback(null, [address]); else callback(null, address.address, address.family); },
  };
}
export type Transport = (url: URL, address: Address, signal: AbortSignal) => Promise<IncomingMessage>;
export const pinnedTransport: Transport = (url, address, signal) => new Promise((resolve, reject) => {
  const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, pinnedOptions(url, address, signal), resolve);
  req.on("error", reject); req.end();
});
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ResourceUnavailable("資料取得がタイムアウトしました。"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function htmlText(html: string) {
  const safe = sanitizeHtml(html, { allowedTags: ["p", "div", "h1", "h2", "h3", "h4", "li", "ul", "ol", "pre", "code", "blockquote", "br", "table", "tr", "td", "th", "span", "title"], allowedAttributes: {}, nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "svg", "math"] });
  const title = convert(safe.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "", { wordwrap: false }).trim().slice(0, 500);
  return { title, text: convert(safe, { wordwrap: false }).trim() };
}
export function createResourceFetcher({ resolve = (host: string) => lookup(host, { all: true, verbatim: true }), transport = pinnedTransport, timeoutMs = 10000, maxBytes = 2_000_000, maxRedirects = 5, signal: parentSignal }: { resolve?: (host: string) => Promise<Address[]>; transport?: Transport; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; signal?: AbortSignal } = {}): ResourceFetcher {
  return { async fetch(raw) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal;
    let response: IncomingMessage | undefined;
    try {
      signal.throwIfAborted();
      let url = checkedUrl(raw);
      for (let redirects = 0; ; redirects++) {
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await abortable(resolve(host), signal);
        if (!addresses.length || addresses.some((a) => !publicAddress(a.address) || isIP(a.address) !== a.family)) throw new ResourceUnavailable("DNSが非公開アドレスを返しました。");
        response = await abortable(transport(url, addresses[0], signal), signal);
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location; response.destroy(); response = undefined;
          if (!location || redirects >= maxRedirects) throw new ResourceUnavailable("リダイレクト上限または不正な転送先です。");
          url = checkedUrl(new URL(location, url).toString()); continue;
        }
        if (response.statusCode !== 200) throw new ResourceUnavailable("資料サーバーが正常な応答を返しませんでした。");
        const type = (response.headers["content-type"] ?? "").split(";")[0].trim();
        if (!["text/html", "application/xhtml+xml", "text/plain", "text/markdown"].includes(type)) throw new ResourceUnavailable("この資料形式は取得に対応していません。");
        if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") throw new ResourceUnavailable("圧縮応答には対応していません。");
        if (Number(response.headers["content-length"]) > maxBytes) throw new ResourceUnavailable("資料サイズが上限を超えています。");
        const stream = response;
        const body = await abortable((async () => { const chunks: Buffer[] = []; let size = 0; for await (const chunk of stream) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > maxBytes) throw new ResourceUnavailable("資料サイズが上限を超えています。"); chunks.push(bytes); } return Buffer.concat(chunks).toString("utf8"); })(), signal);
        const parsed = type.includes("html") ? htmlText(body) : { title: "", text: body };
        return { url: url.toString(), ...parsed, accessedAt: new Date().toISOString() };
      }
    } catch (error) { if (error instanceof ResourceUnavailable) throw error; throw new ResourceUnavailable(); }
    finally { clearTimeout(timer); controller.abort(); response?.destroy(); }
  } };
}
