import type { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { resourceInput, resourceSchema } from "../shared/resource";
import { confirmedResource } from "../modules/resource/confirmation";

type Input = z.infer<typeof resourceInput>;
export async function registerResource(path: string, workspaceId: string, input: Input) {
  const payload = await request<{ resource?: unknown }>(path, "POST", input, { uncertainMutation: true });
  const result = resourceSchema.safeParse(payload?.resource);
  if (!result.success || result.data.workspaceId !== workspaceId || result.data.url !== input.url) throw new UnknownMutationOutcome();
  return result.data;
}
export async function checkResourceRegistration(path: string, workspaceId: string, input: Input) {
  const payload = await request<{ resources?: unknown }>(path);
  return confirmedResource(payload?.resources, workspaceId, input);
}
