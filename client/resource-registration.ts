import type { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { resourceInput, resourceSchema } from "../shared/resource";
import { confirmedResource } from "../modules/resource/confirmation";

type Input = z.infer<typeof resourceInput>;
export const RESOURCE_REGISTRATION_TIMEOUT_MS = 20_000;
export const RESOURCE_CONFIRMATION_TIMEOUT_MS = 20_000;
export async function registerResource(path: string, workspaceId: string, input: Input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOURCE_REGISTRATION_TIMEOUT_MS);
  try {
    const payload = await request<{ resource?: unknown }>(path, "POST", input, { uncertainMutation: true, signal: controller.signal });
    const result = resourceSchema.safeParse(payload?.resource);
    if (!result.success || result.data.workspaceId !== workspaceId || result.data.url !== input.url) throw new UnknownMutationOutcome();
    return result.data;
  } finally { clearTimeout(timer); }
}
export async function checkResourceRegistration(path: string, workspaceId: string, input: Input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOURCE_CONFIRMATION_TIMEOUT_MS);
  try {
    const payload = await request<{ resources?: unknown }>(path, "GET", undefined, { signal: controller.signal });
    return confirmedResource(payload?.resources, workspaceId, input);
  } finally { clearTimeout(timer); }
}
