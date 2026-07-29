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
  singleton ??= new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return singleton;
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
