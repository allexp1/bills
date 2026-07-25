import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  mergedWireExtractionSchema,
  normalizeExtraction,
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

/**
 * Single-pass vision extraction: all pages in one call, structured output
 * against the merged schema of every enabled pack (category auto-detected).
 * Pass `packs` to narrow to a single pack for the re-extract escape hatch.
 */
export async function extractBill(pages: BillPage[], packs?: CategoryPack<any>[]): Promise<ExtractionResult> {
  if (pages.length === 0) throw new Error("extractBill: no pages");
  // Wire schema: sentinel values instead of nullables (API union-parameter
  // limit); normalized back to nulls below.
  const schema = packs ? mergedWireExtractionSchema(packs) : mergedWireExtractionSchema();

  const response = await anthropic().messages.parse({
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
        content: [
          ...pages.map(contentBlockFor),
          { type: "text", text: "Extract this bill following your rules. All pages above belong to one bill." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
  });

  const wire = response.parsed_output;
  if (!wire) {
    throw new Error(`extraction parse failed (stop_reason=${response.stop_reason})`);
  }
  const extraction: MergedExtraction = packs ? normalizeExtraction(wire, packs) : normalizeExtraction(wire);
  return {
    extraction,
    usage: usageFrom(response.usage),
    model: MODEL,
    promptVersion: EXTRACTION_PROMPT_VERSION,
  };
}
