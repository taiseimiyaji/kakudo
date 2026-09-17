import { z } from "zod";
export const sourceUrlSchema = z.string().trim().url().max(4096).refine((value) => {
  const url = URL.parse(value); return !!url && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Source URL must be HTTP(S) without credentials").transform((value) => new URL(value).toString());
export const quoteInput = z.object({
  text: z.string().min(1).max(100_000), sourceUrl: sourceUrlSchema, sourceTitle: z.string().trim().max(500).optional(),
  content: z.string().max(2_000_000), title: z.string().trim().min(1).max(200), baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  from: z.number().int().nonnegative(), to: z.number().int().nonnegative(),
}).strict().refine((v) => v.from <= v.to && v.to <= v.content.length, { message: "Invalid quote selection" });
export function quoteMarkdown(text: string, url: string, title?: string) {
  const label = (title || url).replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&");
  return `\n\n${text.split(/\r\n|\r|\n/).map((line) => `> ${line}`).join("\n")}\n>\n> Source: [${label}](<${url}>)\n\n`;
}
