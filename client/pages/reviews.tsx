import { label } from "../labels";
import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { request } from "../api";
type ReviewRow = { id: string; documentId: string; documentTitle: string; type: string; status: string; provider: string; createdAt: string };
export default function ReviewsPage() {
  const { workspaceId = "default" } = useParams({ strict: false });
  return <ReviewsList key={workspaceId} workspaceId={workspaceId} />;
}
function ReviewsList({ workspaceId }: { workspaceId: string }) { const [reviews, setReviews] = useState<ReviewRow[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true;  request<{ reviews: ReviewRow[] }>(`/reviews?workspaceId=${encodeURIComponent(workspaceId)}`).then((data) => { if (active) setReviews(data.reviews); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [workspaceId]);
  return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><h1>レビュー履歴</h1><p className="intro">指摘と根拠を振り返り、理解の変化を確かめましょう。</p>{error && <p role="alert">{error}</p>}{loading && <p role="status">レビュー履歴を読み込んでいます…</p>}{!loading && !error && !reviews.length && <p>レビュー履歴はありません。ノートからレビューを始められます。</p>}<ul>{reviews.map((review) => <li key={review.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: review.documentId }} search={{ reviewId: review.id }}>{review.documentTitle}</Link> · {label(review.type)} · {label(review.status)} · {label(review.provider)} · {new Date(review.createdAt).toLocaleString()}</li>)}</ul></main>;
}
