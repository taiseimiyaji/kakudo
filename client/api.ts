export async function request<T = unknown>(path: string, method = "GET", data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  } catch {
    throw new Error("通信できませんでした。接続を確認して再試行してください。");
  }
  // Server payloads can contain provider diagnostics, URLs or internal details.
  // Display only messages defined by the client, including for non-JSON errors.
  if (!response.ok) {
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
  catch { throw new Error("応答を読み取れませんでした。再試行してください。"); }
}
