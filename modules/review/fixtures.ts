import { ResourceUnavailable, type ResourceFetcher } from "../resource/fetcher";
// Explicit offline demo fixtures. Never presented as fetched live evidence.
export const mockReviewFetcher: ResourceFetcher = { async fetch(url) {
  if (!/^https:\/\/www\.rfc-editor\.org\/rfc\/rfc(6749|7636)$/.test(url)) throw new ResourceUnavailable();
  return { url, title: `[Mock] RFC ${url.endsWith("6749") ? "6749" : "7636"}`, text: url.endsWith("6749") ? "The OAuth 2.0 authorization framework enables a third-party application to obtain limited access to an HTTP service." : "Proof Key for Code Exchange by OAuth Public Clients", accessedAt: new Date().toISOString() };
} };
