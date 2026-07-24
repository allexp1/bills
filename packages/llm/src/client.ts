import Anthropic from "@anthropic-ai/sdk";

/** All calls use the same model; recorded on every extraction/decode row. */
export const MODEL = "claude-opus-4-8";

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
