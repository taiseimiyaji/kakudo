import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";

export async function requestCreation<T>(path: string, data: unknown, schema: z.ZodType<T>): Promise<T> {
  const payload = await request(path, "POST", data, { uncertainMutation: true, uncertainServerError: true });
  const result = schema.safeParse(payload);
  if (!result.success) throw new UnknownMutationOutcome();
  return result.data;
}
