import { describe, expect, it } from "vitest";
import { checkedUrl, publicAddress, htmlText, pinnedOptions } from "../../modules/resource/fetcher";
describe("resource security", () => {
  it.each(["127.0.0.1", "10.1.1.1", "172.16.1.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "192.0.2.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1", "64:ff9b::a00:1"])("blocks nonpublic %s", (ip) => expect(publicAddress(ip)).toBe(false));
  it.each(["file:///etc/passwd", "http://localhost/", "http://foo.localhost/", "http://127.1", "http://2130706433", "http://[::ffff:127.0.0.1]/", "https://user:pass@example.com", "http://example.com:5432"])("rejects unsafe URL %s", (url) => expect(() => checkedUrl(url)).toThrow());
  it("pins the DNS callback to the validated address and preserves TLS/Host defaults", () => {
    const url = checkedUrl("https://example.com/source");
    const options = pinnedOptions(url, { address: "93.184.216.34", family: 4 }, new AbortController().signal);
    expect(options.agent).toBe(false); expect(options.family).toBe(4); expect(options.hostname).toBeUndefined();
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
    const callback = (...values: unknown[]) => expect(values).toEqual([null, "93.184.216.34", 4]);
    // Invoke the actual lookup supplied to Node, without another DNS lookup.
    options.lookup!("example.com", { family: 4 }, callback);
  });
  it("drops executable content and attributes before extracting source text", () => {
    const result = htmlText('<title>Source &amp; title</title><script>attack()</script><svg>hidden</svg><p onclick="bad()">Useful <b>text</b></p><img src="http://127.0.0.1">');
    expect(result.title).toBe("Source & title"); expect(result.text).toContain("Useful text"); expect(result.text).not.toMatch(/attack|hidden|127|onclick/);
  });
});
