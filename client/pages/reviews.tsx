import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { request } from "../api";
type ReviewRow = { id: string; documentId: string; documentTitle: string; type: string; status: string; provider: string; createdAt: string };
export default function ReviewsPage() {
  const { workspaceId = "default" } = useParams({ strict: false }); const [reviews, setReviews] = useState<ReviewRow[]>([]); const [error, setError] = useState("");
  useEffect(() => { let active = true; request<{ reviews: ReviewRow[] }>(`/reviews?workspaceId=${encodeURIComponent(workspaceId)}`).then((data) => { if (active) setReviews(data.reviews); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [workspaceId]);
  return <main className="workspace"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← Knowledge Map</Link><h1>Reviews</h1>{error && <p role="alert">{error}</p>}{!reviews.length && <p>レビュー履歴はありません。DocumentからReviewを起動できます。</p>}<ul>{reviews.map((review) => <li key={review.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: review.documentId }} search={{ reviewId: review.id }}>{review.documentTitle}</Link> · {review.type} · {review.status} · {review.provider} · {new Date(review.createdAt).toLocaleString()}</li>)}</ul></main>;
}
