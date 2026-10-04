import { reviewAdmissionStatus, type ReviewAdmissionCode } from "../shared/review";

const reviewAdmissionMessages: Record<ReviewAdmissionCode, string> = {
  REVIEW_DOCUMENT_TOO_LONG: "本文を60,000文字以内に分割・短縮し、保存してからReviewしてください。",
  REVIEW_OBJECTIVES_LIMIT: "関連Nodeの学習目標は合計100件以内にしてください。Nodeで目標を整理するか、このノートの学習項目の関連を減らして再試行してください。",
  REVIEW_ALREADY_RUNNING: "同じRevision・種類のReviewが進行中です。ページを再読み込みしてReview履歴の進行中Reviewを確認し、完了を待ってください。",
  REVIEW_EXTERNAL_CONTENT_CHANGED: "Markdownが外部で変更されています。未保存の本文を退避してページを再読み込みし、内容を確認・保存してからReviewしてください。",
};

export class UnknownMutationOutcome extends Error {
  constructor() { super("更新結果を確認できませんでした。"); this.name = "UnknownMutationOutcome"; }
}

export async function request<T = unknown>(path: string, method = "GET", data?: unknown, options: { uncertainMutation?: boolean; uncertainServerError?: boolean; uncertainErrors?: ReadonlyArray<{ status: number; code: string }>; signal?: AbortSignal } = {}): Promise<T> {
  const uncertainMutation = options.uncertainMutation && !["GET", "HEAD"].includes(method.toUpperCase());
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), signal: options.signal });
  } catch {
    if (uncertainMutation) throw new UnknownMutationOutcome();
    throw new Error("通信できませんでした。接続を確認して再試行してください。");
  }
  // Server payloads can contain provider diagnostics, URLs or internal details.
  // Display only messages defined by the client, including for non-JSON errors.
  if (!response.ok) {
    if (uncertainMutation && options.uncertainServerError && response.status >= 500) throw new UnknownMutationOutcome();
    const uncertainCodes = uncertainMutation ? options.uncertainErrors?.filter((error) => error.status === response.status) : undefined;
    if (uncertainCodes?.length) {
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new UnknownMutationOutcome(); }
      const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
      if (typeof code === "string" && uncertainCodes.some((error) => error.code === code)) throw new UnknownMutationOutcome();
    }
    if (method === "POST" && /^\/documents\/[^/?#]+\/reviews(?:\?|$)/.test(path)) {
      let payload: unknown;
      try { payload = await response.json(); } catch { /* Keep the safe HTTP fallback. */ }
      const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
      if (typeof code === "string" && Object.hasOwn(reviewAdmissionMessages, code) && reviewAdmissionStatus[code as ReviewAdmissionCode] === response.status) {
        throw new Error(reviewAdmissionMessages[code as ReviewAdmissionCode]);
      }
    }
    const messages: Record<number, string> = {
      400: "入力内容を確認して再試行してください。",
      401: "認証を確認して再試行してください。",
      403: "この操作は許可されていません。接続先や権限を確認してください。",
      404: "対象が見つかりません。一覧を再読み込みしてください。",
      409: "別の変更と競合しました。最新の状態を確認してください。",
      413: "データが大きすぎます。内容を減らして再試行してください。",
      422: "処理できませんでした。入力内容や対象を確認して再試行してください。",
      429: "処理が混み合っています。少し待って再試行してください。",
    };
    throw new Error(messages[response.status] ?? "サーバーで処理できませんでした。少し待って再試行してください。");
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { if (uncertainMutation) throw new UnknownMutationOutcome(); throw new Error("応答を読み取れませんでした。再試行してください。"); }
}
