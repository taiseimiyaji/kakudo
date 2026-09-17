import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createResourceFetcher } from "../../modules/resource/fetcher";
const addresses = [{ address: "93.184.216.34", family: 4 }];
function response(body: string, status = 200, headers = {}) { const stream = new IncomingMessage(new Socket()); stream.statusCode = status; stream.headers = { "content-type": "text/html", ...headers }; stream.push(body); stream.push(null); return stream; }
describe("safe retrieval pipeline", () => {
  it("resolves once, validates every answer and passes only the pinned IP", async () => {
    const resolve = vi.fn().mockResolvedValueOnce(addresses).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const transport = vi.fn(async () => response("<p>Evidence</p>"));
    const result = await createResourceFetcher({ resolve, transport }).fetch("https://example.com");
    expect(result.text).toBe("Evidence"); expect(resolve).toHaveBeenCalledTimes(1); expect(transport.mock.calls[0]).toHaveLength(3);
    expect((transport.mock.calls as unknown[][])[0][1]).toEqual(addresses[0]);
    const mixed = createResourceFetcher({ resolve: async () => [...addresses, { address: "::1", family: 6 }], transport });
    await expect(mixed.fetch("https://example.com")).rejects.toThrow("非公開"); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("revalidates redirects and DNS, rejecting private targets and rebinding", async () => {
    const transport = vi.fn(async () => response("", 302, { location: "http://169.254.169.254/latest" }));
    await expect(createResourceFetcher({ resolve: async () => addresses, transport }).fetch("https://example.com")).rejects.toThrow("非公開"); expect(transport).toHaveBeenCalledTimes(1);
    const resolve = vi.fn().mockResolvedValueOnce(addresses).mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    await expect(createResourceFetcher({ resolve, transport: async () => response("", 302, { location: "/redirect" }) }).fetch("https://example.com")).rejects.toThrow("非公開");
  });
  it("caps redirects, stream bytes, content length and rejects compressed bodies", async () => {
    const resolve = async () => addresses;
    await expect(createResourceFetcher({ resolve, maxRedirects: 1, transport: async () => response("", 302, { location: "/loop" }) }).fetch("https://example.com")).rejects.toThrow("リダイレクト");
    for (const headers of [{}, { "content-length": "1000" }]) await expect(createResourceFetcher({ resolve, maxBytes: 3, transport: async () => response("large", 200, headers) }).fetch("https://example.com")).rejects.toThrow("サイズ");
    await expect(createResourceFetcher({ resolve, transport: async () => response("gzip", 200, { "content-encoding": "gzip" }) }).fetch("https://example.com")).rejects.toThrow("圧縮");
  });
  it("times out DNS and stalled bodies and destroys the response", async () => {
    await expect(createResourceFetcher({ timeoutMs: 20, resolve: () => new Promise(() => {}) }).fetch("https://example.com")).rejects.toThrow("タイムアウト");
    const stream = new IncomingMessage(new Socket()); stream.statusCode = 200; stream.headers = { "content-type": "text/plain" };
    await expect(createResourceFetcher({ timeoutMs: 20, resolve: async () => addresses, transport: async () => stream }).fetch("https://example.com")).rejects.toThrow("タイムアウト");
    expect(stream.destroyed).toBe(true);
  });
});
