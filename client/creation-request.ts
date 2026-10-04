import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { DOCUMENT_CREATE_OUTCOME_UNKNOWN } from "../shared/document";

export async function requestCreation<T>(path: string, data: unknown, schema: z.ZodType<T>): Promise<T> {
  const payload = await request(path, "POST", data, { uncertainMutation: true, uncertainServerError: true,
    uncertainErrors: /^\/documents(?:\?|$)/.test(path) ? [{ status: 409, code: DOCUMENT_CREATE_OUTCOME_UNKNOWN }] : undefined,
  });
  const result = schema.safeParse(payload);
  if (!result.success) throw new UnknownMutationOutcome();
  return result.data;
}
