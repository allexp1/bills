import { z } from "zod";
import { MODEL, SPLIT_MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";
import type { BillPage } from "./extract.js";

/**
 * Works out whether a set of dropped files is one bill or several.
 *
 * People drop everything they have. Before this, every file in an upload was
 * treated as another page of a single bill, so a phone bill and an electricity
 * bill dropped together were read as one document: one provider, one total,
 * line items from both. Nothing errored, which is the worst version of getting
 * it wrong.
 *
 * The cost is placed where the value is. A single file is a single bill by
 * definition and returns immediately without a model call, which is the
 * overwhelming majority of uploads. The call only happens when there is
 * genuinely something to decide.
 */

export interface BillGroup {
  /** Zero-based indices into the pages array, in reading order. */
  pageIndices: number[];
  /** What the model thought it was, for logs only. Never shown as fact. */
  providerHint: string | null;
}

export interface SplitResult {
  groups: BillGroup[];
  usage: LlmUsage;
  /** True when a model call was made. False for the trivial single-page case. */
  consulted: boolean;
}

const SplitSchema = z.object({
  bills: z
    .array(
      z.object({
        /** 1-based page numbers, as labelled in the prompt. */
        pages: z.array(z.number().int().positive()).min(1),
        providerName: z.string().nullable(),
      }),
    )
    .min(1),
});

const NO_USAGE: LlmUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function contentBlockFor(page: BillPage) {
  if (page.mimeType === "application/pdf") {
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: page.data.toString("base64"),
      },
    };
  }
  const mediaType = IMAGE_MEDIA_TYPES.has(page.mimeType) ? page.mimeType : "image/jpeg";
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: mediaType as "image/jpeg",
      data: page.data.toString("base64"),
    },
  };
}

const SYSTEM = `You sort pages into bills. You do not read bills in detail and you do not extract anything.

You are given pages in order, labelled Page 1 upward. They are either pages of one bill or several separate bills dropped together.

Two pages belong to the SAME bill when they share the account holder, the account number, the provider and the billing period, or when one is plainly a continuation of the other: a page 2 of 3, a detail annex, the reverse of a sheet.

They belong to DIFFERENT bills when the provider differs, the account number differs, or the billing period differs. A different month from the same provider is a different bill.

Rules you must follow:
- Every page number appears exactly once across all bills. Never drop a page, never repeat one.
- Keep pages within a bill in the order they were given.
- When you cannot tell, put them in ONE bill. Splitting a real multi-page bill loses half of it, which is worse than analysing two bills as one and being told so.`;

/**
 * Groups pages into bills. Never throws and never loses a page: on any doubt,
 * any malformed answer, or any API failure it returns a single group containing
 * everything, which is exactly the behaviour this function replaced.
 */
export async function splitBills(pages: BillPage[]): Promise<SplitResult> {
  const all = { pageIndices: pages.map((_, i) => i), providerHint: null };
  if (pages.length <= 1) return { groups: [all], usage: NO_USAGE, consulted: false };

  try {
    const jsonSchema = JSON.stringify(z.toJSONSchema(SplitSchema, { target: "draft-7" }));
    const response = await anthropic().messages.create({
      model: SPLIT_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            ...pages.flatMap((page, i) => [
              { type: "text" as const, text: `Page ${i + 1}:` },
              contentBlockFor(page),
            ]),
            {
              type: "text" as const,
              text: `There are ${pages.length} pages. Group them into bills.\n\nRespond with ONLY a JSON object (no prose, no code fences) validating against:\n${jsonSchema}`,
            },
          ],
        },
      ],
    });

    const usage = usageFrom(response.usage);
    const text = response.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return { groups: [all], usage, consulted: true };

    const parsed = SplitSchema.parse(JSON.parse(text.slice(start, end + 1)));
    const groups = parsed.bills.map((b) => ({
      pageIndices: b.pages.map((p) => p - 1).filter((i) => i >= 0 && i < pages.length),
      providerHint: b.providerName,
    }));

    /* The one invariant worth enforcing in code rather than trusting: every
       page present exactly once. A model that drops a page would silently
       delete half of somebody's bill, and a model that repeats one would bill
       them twice for the same charges. Either way, fall back to one bill. */
    const seen = groups.flatMap((g) => g.pageIndices);
    const complete =
      seen.length === pages.length && new Set(seen).size === pages.length;
    if (!complete) {
      console.warn(
        `[split] page coverage was wrong (${seen.length} of ${pages.length}, ${new Set(seen).size} distinct); treating as one bill`,
      );
      return { groups: [all], usage, consulted: true };
    }

    return { groups: groups.filter((g) => g.pageIndices.length > 0), usage, consulted: true };
  } catch (err) {
    /* Splitting is an improvement on the old behaviour, not a precondition for
       it. If it fails, the upload still gets analysed as one bill. */
    console.warn(
      "[split] falling back to a single bill:",
      err instanceof Error ? err.message.slice(0, 160) : "",
    );
    return { groups: [all], usage: NO_USAGE, consulted: true };
  }
}

/** Exposed so callers can log which model made the call. */
export const splitModel = SPLIT_MODEL;
export const splitFallbackModel = MODEL;
