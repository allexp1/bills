import { z } from "zod";
import {
  mergedExtractionSchema,
  type CategoryPack,
  type MergedExtraction,
} from "@bills/category-packs";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";
import { EXTRACTION_PROMPT_VERSION, extractionSystemPrompt } from "./prompts/extraction.js";

export interface BillPage {
  data: Buffer;
  mimeType: string; // image/jpeg, image/png, application/pdf
}

export interface ExtractionResult {
  extraction: MergedExtraction;
  usage: LlmUsage;
  model: string;
  promptVersion: string;
}

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function contentBlockFor(page: BillPage) {
  if (page.mimeType === "application/pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: page.data.toString("base64") },
    };
  }
  const mediaType = IMAGE_MEDIA_TYPES.has(page.mimeType) ? page.mimeType : "image/jpeg";
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType as "image/jpeg", data: page.data.toString("base64") },
  };
}

/** Pull the first JSON object out of a text response (tolerates code fences/preamble). */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Single-pass vision extraction: all pages in one call, category auto-detected.
 *
 * Deliberately NOT structured outputs: the merged all-packs schema exceeds the
 * API's grammar-size and union-parameter limits, and grows with every category
 * pack. Instead the JSON Schema rides in the prompt and the result is Zod-
 * validated in code, with one corrective retry on validation failure.
 */
export async function extractBill(pages: BillPage[], packs?: CategoryPack<any>[]): Promise<ExtractionResult> {
  if (pages.length === 0) throw new Error("extractBill: no pages");
  const schema = packs ? mergedExtractionSchema(packs) : mergedExtractionSchema();
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));

  const usageTotal: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const instruction =
      attempt === 1
        ? `Extract this bill following your rules. All pages above belong to one bill.\n\nRespond with ONLY a JSON object (no prose, no code fences) that validates against this JSON Schema:\n${jsonSchema}`
        : `Your previous JSON did not validate: ${lastError}\n\nRespond again with ONLY a corrected JSON object validating against the same schema.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: extractionSystemPrompt(),
          cache_control: { type: "ephemeral" }, // static across all extractions
        },
      ],
      messages: [
        {
          role: "user",
          content: [...pages.map(contentBlockFor), { type: "text", text: instruction }],
        },
      ],
    });

    const u = usageFrom(response.usage);
    usageTotal.inputTokens += u.inputTokens;
    usageTotal.outputTokens += u.outputTokens;
    usageTotal.cacheReadInputTokens += u.cacheReadInputTokens;
    usageTotal.cacheCreationInputTokens += u.cacheCreationInputTokens;

    const text = response.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    try {
      const parsed = schema.parse(extractJsonObject(text));
      return {
        extraction: parsed as MergedExtraction,
        usage: usageTotal,
        model: MODEL,
        promptVersion: EXTRACTION_PROMPT_VERSION,
      };
    } catch (err) {
      lastError = (err instanceof Error ? err.message : String(err)).slice(0, 1500);
    }
  }
  throw new Error(`extraction JSON failed validation after retry: ${lastError.slice(0, 300)}`);
}
