import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { reviewTypes } from "../shared/review";

export const reviewHistoryItemSchema = z.object({ id: z.string().min(1), revisionId: z.string().min(1), type: z.enum(reviewTypes), status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]), createdAt: z.string().datetime() });
export type ReviewHistoryItem = z.infer<typeof reviewHistoryItemSchema>;
export type ReviewAdmissionTarget = { documentId: string; workspaceId: string; revisionId: string; type: typeof reviewTypes[number] };
export async function requestReviewAdmission(target: ReviewAdmissionTarget) {
  const payload = await request(`/documents/${encodeURIComponent(target.documentId)}/reviews?workspaceId=${encodeURIComponent(target.workspaceId)}`, "POST", { revisionId: target.revisionId, type: target.type }, { uncertainMutation: true, uncertainServerError: true });
  const parsed = z.object({ run: z.object({ id: z.string().min(1), documentId: z.literal(target.documentId), revisionId: z.literal(target.revisionId), type: z.literal(target.type), status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]) }) }).safeParse(payload);
  if (!parsed.success) throw new UnknownMutationOutcome();
  return parsed.data.run;
}
