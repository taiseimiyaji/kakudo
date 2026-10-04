/** Japanese presentation labels. API values and saved learning content stay unchanged. */
const labels: Record<string, string> = {
  NOT_STARTED: "未着手", LEARNING: "学習中", REVIEWING: "確認中", LEARNED: "学習済み",
  PREREQUISITE: "先に学ぶ", PARENT: "親子関係", RELATED: "関連",
  WEB: "Webページ", OFFICIAL_DOC: "公式ドキュメント", RFC: "RFC（技術仕様）", PAPER: "論文", OTHER: "その他",
  FULL: "全体を確認", FACT_CHECK: "事実を確認", SOURCE: "出典", LOGIC: "論理", COVERAGE: "学習目標",
  QUEUED: "順番待ち", RUNNING: "確認中", COMPLETED: "完了", FAILED: "失敗", STARTING: "準備中", INTERRUPTED: "中断",
  CLAIM_EXTRACTION_AND_CLASSIFICATION: "主張を整理中", EVIDENCE_RETRIEVAL_AND_VERIFICATION: "根拠を確認中",
  SOURCE_VERIFICATION: "出典を照合中", LOGIC_REVIEW: "論理を確認中", COVERAGE_REVIEW: "学習目標と照合中",
  FACT: "事実", FRESHNESS: "情報の鮮度", CLARITY: "説明の明確さ",
  INFO: "参考", WARNING: "要確認", IMPORTANT: "重要", OPEN: "未対応", RESOLVED: "解決済み", DISMISSED: "見送り",
  SUPPORTED: "根拠と一致", CONTRADICTED: "根拠と矛盾", PARTIALLY_SUPPORTED: "一部に根拠あり",
  INSUFFICIENT_EVIDENCE: "根拠が不足", TIME_SENSITIVE: "最新情報の確認が必要",
  USER_RESOURCE: "登録資料", OFFICIAL: "公式資料", PRIMARY: "一次資料", SECONDARY: "二次資料",
  VERIFIED: "引用を確認済み", PARTIAL_MATCH: "一部が一致", NOT_FOUND: "引用が見つかりません", UNAVAILABLE: "取得できません",
  codex: "Codex", openai: "OpenAI", mock: "デモ",
};
export function label(value: string): string { return labels[value] ?? value; }
