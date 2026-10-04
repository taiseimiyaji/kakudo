import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";

export const findingStatusSchema = z.enum(["OPEN", "RESOLVED", "DISMISSED"]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;
export type FindingDecisionTarget = { documentId: string; workspaceId: string; runId: string; revisionId: string; findingId: string; status: FindingStatus };
export async function requestFindingDecision(target: FindingDecisionTarget) {
  const payload = await request(`/findings/${encodeURIComponent(target.findingId)}?workspaceId=${encodeURIComponent(target.workspaceId)}`, "PATCH", { status: target.status }, { uncertainMutation: true, uncertainServerError: true });
  const parsed = z.object({ finding: z.object({ id: z.literal(target.findingId), reviewRunId: z.literal(target.runId), status: z.literal(target.status) }) }).safeParse(payload);
  if (!parsed.success) throw new UnknownMutationOutcome();
  return parsed.data.finding.status;
}
export async function readFindingDecision(target: FindingDecisionTarget) {
  const payload = await request(`/reviews/${encodeURIComponent(target.runId)}?workspaceId=${encodeURIComponent(target.workspaceId)}`);
  const detail = z.object({ run: z.object({ id: z.literal(target.runId), documentId: z.literal(target.documentId), revisionId: z.literal(target.revisionId) }), findings: z.array(z.object({ id: z.string(), status: findingStatusSchema })) }).parse(payload);
  const matches = detail.findings.filter((finding) => finding.id === target.findingId);
  if (matches.length !== 1) throw new Error("Finding unavailable");
  return matches[0].status;
}
