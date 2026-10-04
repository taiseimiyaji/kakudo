import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { createResourceFetcher, ResourceUnavailable } from "../../modules/resource/fetcher";
import { matchQuote } from "../../modules/review/source-check";

// Encoded independently with Python cp932/euc_jp; no encoder dependency in production.
const quote = "認証と認可の違いを、自分の言葉で説明する。";
const fixtures = [{"charset": "Shift_JIS", "body": "PGh0bWw+PHRpdGxlPpP6lnuM6oLMjpGXvzwvdGl0bGU+PGJvZHk+PHA+lEaP2ILGlEaJwoLMiOGCooLwgUGOqZWqgsyMvpd0gsWQ4Ja+greC6YFCPC9wPjwvYm9keT48L2h0bWw+"}, {"charset": "EUC-JP", "body": "PGh0bWw+PHRpdGxlPsb8y9y47KTOu/HOwTwvdGl0bGU+PGJvZHk+PHA+x6e+2qTIx6eyxKTOsOOkpKTyoaK8q8qspM64wM3VpMfA4szApLmk66GjPC9wPjwvYm9keT48L2h0bWw+"}];
function response(bytes: Buffer, type: string, split = false) {
  const stream = new IncomingMessage(new Socket()); stream.statusCode = 200; stream.headers = { "content-type": type };
  if (split) for (const byte of bytes) stream.push(Buffer.from([byte])); else stream.push(bytes);
  stream.push(null); return stream;
}
function fetch(bytes: Buffer, type: string, maxBytes?: number, split = false) {
  const stream = response(bytes, type, split);
  return { stream, result: createResourceFetcher({ resolve: async () => [{ address: "93.184.216.34", family: 4 }], transport: async () => stream, maxBytes }).fetch("https://example.com/japanese-source") };
}

describe("declared resource charset", () => {
  it.each(fixtures)("preserves $charset Japanese source, title and exact quote match across chunk boundaries", async ({ charset, body }) => {
    const { result } = fetch(Buffer.from(body, "base64"), `text/html; charset=${charset}`, undefined, true);
    const document = await result; expect(document.title).toBe("日本語の資料"); expect(document.text).toContain(quote); expect(document.text).not.toContain("\ufffd"); expect(matchQuote(quote, document.text)).toBe("VERIFIED");
  });
  it("parses quoted case-insensitive charset parameters and MIME type without bypassing sanitization", async () => {
    const bytes = Buffer.concat([Buffer.from(fixtures[0].body, "base64"), Buffer.from('<script>secret()</script><iframe>hidden</iframe><img src="http://127.0.0.1">')]);
    const document = await fetch(bytes, 'TEXT/HTML; other="value;inside"; CHARSET="sJiS"').result;
    expect(document.text).toContain(quote); expect(document.text).not.toMatch(/secret|hidden|127/); expect(matchQuote(quote, document.text)).toBe("VERIFIED");
  });
  it.each(["text/plain", "text/markdown; charset=utf8", 'text/plain; charset="UTF-8"'])("preserves UTF8 fallback and declared %s including split multibyte sequences", async (type) => {
    const document = await fetch(Buffer.from(quote), type, undefined, true).result; expect(document.title).toBe(""); expect(document.text).toBe(quote);
  });
  it.each(["UTF-7", "ISO-8859-16", ""])("rejects unsupported or empty declared encoding %s and destroys the response", async (charset) => {
    const { result, stream } = fetch(Buffer.from("source"), `text/plain; charset="${charset}"`); await expect(result).rejects.toBeInstanceOf(ResourceUnavailable); expect(stream.destroyed).toBe(true);
  });
  it.each([["UTF-8", 0xc3], ["Shift_JIS", 0x82], ["EUC-JP", 0xa4]] as const)("rejects invalid trailing bytes in %s rather than returning corrupted evidence", async (charset, byte) => {
    const { result, stream } = fetch(Buffer.from([byte]), `text/plain; charset=${charset}`); await expect(result).rejects.toBeInstanceOf(ResourceUnavailable); expect(stream.destroyed).toBe(true);
  });
  it("does not guess an absent charset for invalid UTF8 legacy bytes", async () => {
    await expect(fetch(Buffer.from(fixtures[0].body, "base64"), "text/html").result).rejects.toBeInstanceOf(ResourceUnavailable);
  });
  it("enforces raw byte limits before decoding Japanese source", async () => {
    const bytes = Buffer.from(fixtures[0].body, "base64"); const { result, stream } = fetch(bytes, "text/html; charset=Shift_JIS", bytes.length - 1);
    await expect(result).rejects.toThrow("サイズ"); expect(stream.destroyed).toBe(true);
  });
});
