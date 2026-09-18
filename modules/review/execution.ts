import { z } from "zod";
import type { ReviewProvider } from "./contracts";

export const executionConfig = z.object({
  REVIEW_MAX_PENDING: z.coerce.number().int().min(1).max(100).default(10),
  REVIEW_RUN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3600000).default(600000),
});

export function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(
      (value) => { signal.removeEventListener("abort", abort); if (signal.aborted) reject(signal.reason); else resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

export function boundedProvider(provider: ReviewProvider, signal: AbortSignal): ReviewProvider {
  return { name: provider.name,
    extractClaims: (markdown) => abortable(signal, () => provider.extractClaims(markdown)),
    verifyClaim: (claim, evidence) => abortable(signal, () => provider.verifyClaim(claim, evidence)),
    reviewLogic: (markdown) => abortable(signal, () => provider.reviewLogic(markdown)),
    reviewCoverage: (markdown, objectives) => abortable(signal, () => provider.reviewCoverage(markdown, objectives)),
  };
}
