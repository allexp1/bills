import Anthropic from "@anthropic-ai/sdk";

/** All calls use the same model; recorded on every extraction/decode row. */
export const MODEL = "claude-opus-4-8";

/**
 * Model for deciding how many bills are in an upload.
 *
 * Sorting pages into bills is a much easier job than reading one, and its cost
 * is dominated by the images going in rather than the few words coming out, so
 * a smaller model is the right shape for it. Defaults to MODEL so nothing
 * breaks on a deployment that has not set it: point SPLIT_MODEL at a cheaper
 * model once you have confirmed the id you want, and it applies with no code
 * change. If the id is wrong the splitter fails soft and the upload is analysed
 * as a single bill, which is what it did before this existed.
 */
export const SPLIT_MODEL = process.env.SPLIT_MODEL || MODEL;

let singleton: Anthropic | undefined;

export function anthropic(): Anthropic {
  /**
   * maxRetries is raised from the SDK default of 2.
   *
   * A 529 overloaded_error took down a multi-bill upload in production. The SDK
   * does retry 429 and every 5xx with exponential backoff and jitter, and it
   * honours retry-after, so the mechanism was already right; two attempts just
   * covered about a second and a half of it, and an overload lasts longer than
   * that. Five covers roughly half a minute.
   *
   * Retrying is the correct response to a 529 rather than a nicety. The work is
   * expensive and partly done by the time a later call fails, so giving up
   * throws away an extraction that was already paid for.
   *
   * The timeout is generous because a bill decode legitimately takes minutes,
   * and a timeout that fires mid-decode looks exactly like a failure while
   * still costing full price.
   */
  singleton ??= new Anthropic({ maxRetries: 5, timeout: 10 * 60 * 1000 }); // key from env
  return singleton;
}

/**
 * Whether a failure is the service being busy rather than anything wrong with
 * the request.
 *
 * 529 overloaded_error and 429 rate limits both mean "come back shortly", and
 * they are worth telling apart from a real error because the honest advice is
 * completely different: wait and retry, versus this will never work.
 *
 * Matched on the message as well as the status, because these arrive wrapped in
 * several layers by the time the pipeline sees them.
 */
export function isOverloaded(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 529 || status === 429 || status === 503) return true;
  const text = err instanceof Error ? err.message : String(err ?? "");
  return /\b(529|overloaded_error|rate_limit_error)\b/i.test(text);
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export function usageFrom(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): LlmUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
  };
}
