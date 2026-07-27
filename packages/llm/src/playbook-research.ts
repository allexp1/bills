import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { UtilityPlaybookSchema, type UtilityPlaybook } from "@bills/category-packs";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const PLAYBOOK_PROMPT_VERSION = "playbook-v2";

/**
 * Deep market research for one (country, utility) pair, run once and cached.
 *
 * This is the expensive, slow call that makes every later bill of the same
 * kind fast and smart: an analyst pass over how this utility is billed,
 * regulated and discounted in this specific country, in the local language,
 * with a source URL behind every substantive claim.
 *
 * The single most important output is `marketStructure.switchable`. Most
 * saving advice in this product assumes a competitive market; water, sewerage
 * and waste are usually regional or municipal monopolies where "switch
 * supplier" is not merely unhelpful but impossible. Getting that one boolean
 * right is what stops the product giving confident, useless advice.
 *
 * The shape is requested in the prompt and validated with zod afterwards,
 * rather than enforced by structured output. A playbook is a large nested
 * document and the API refused to compile a grammar that size ("the compiled
 * grammar is too large"); the same prompt-and-parse approach is what
 * comparison-search uses for its web-search call.
 */

export interface PlaybookResearchResult {
  playbook: UtilityPlaybook;
  usage: LlmUsage;
  promptVersion: string;
}

/** Returned instead of throwing, so callers can report WHY research failed. */
export interface PlaybookResearchFailure {
  error: string;
  detail?: string;
}

const SHAPE = `{
  "localNames": [string],                      // up to 6: what this utility is called locally
  "marketStructure": {
    "switchable": boolean,                     // CAN a consumer choose their supplier?
    "model": "competitive" | "regional_monopoly" | "national_monopoly" | "municipal" | "unknown",
    "regulator": string | null,
    "regulatorUrl": string | null,
    "complaintRoute": string | null
  },
  "billing": {
    "unit": string | null,                     // m³, kWh, GB…
    "structure": string,                       // how a bill of this kind is built up
    "tieredPricing": boolean | null,
    "estimatedReadsCommon": boolean | null,
    "typicalLineItems": [{ "label": string, "meaning": string, "negotiable": boolean }]
  },
  "benchmarks": [{ "label": string, "value": string, "unit": string | null, "source": string }],
  "schemes": [{ "name": string, "whoQualifies": string, "howToApply": string, "source": string }],
  "commonErrors": [{ "label": string, "howToSpot": string }],
  "levers": [{
    "id": string,                              // lowercase a-z0-9_ only
    "kind": "optimize_current" | "switch_provider",
    "title": string,                           // in the country's main language
    "titleEn": string,
    "promptFragment": string,
    "quantifiable": boolean,
    "requiresSwitching": boolean
  }],
  "glossary": [{ "term": string, "plain": string }],
  "sources": [{ "claim": string, "source": string }],
  "confidence": number                         // 0–1
}`;

const SYSTEM = `You are a utilities market analyst. You research how ONE kind of consumer utility bill works in ONE specific country, so that an AI bill-decoder can explain those bills and find real savings.

Work like a professional data analyst, not a summariser:
1. SEARCH IN THE COUNTRY'S OWN LANGUAGE FIRST. English queries miss national regulators, local tariff pages and local consumer guidance. Search the local terms for the utility, the regulator, the tariff, and the social/discount schemes. Then cross-check in English if useful.
2. Prefer primary sources in this order: the national regulator, government or municipal pages, the providers' own tariff pages, then established consumer organisations. Avoid blogs and content farms.
3. Every substantive claim must carry the URL you actually read it on. If you could not verify something, leave it out rather than filling the gap from memory.

Answer these specifically:
- CAN A CONSUMER CHANGE SUPPLIER for this utility in this country? This is the decisive question. Many utilities are regional or municipal monopolies. Be explicit and be right; say switchable=false unless you found evidence that consumers genuinely choose their supplier.
- How is a bill of this kind actually built up? Fixed vs consumption charges, the unit used, whether tariffs are tiered, whether estimated readings are common.
- What line items appear on a typical bill, what does each mean in plain words, and which are negotiable versus statutory pass-through?
- What discounts, social tariffs, rebates or exemptions exist, who qualifies, and how does someone claim them? This is where unclaimed money sits.
- What billing errors and overcharges are common in THIS market, and how does a consumer spot them on their own bill?
- What published benchmarks exist for normal consumption? These let us tell a customer their usage is high.
- What is the escalation route when a provider refuses?

Then define the SAVINGS LEVERS that genuinely apply in this market:
- requiresSwitching=true ONLY for levers that need changing supplier. If the market is not switchable, do not invent switching levers at all.
- quantifiable=true ONLY when the saving can be computed from numbers printed on a customer's own bill. Behaviour advice — reducing consumption, fixing a leak — is valuable but NOT quantifiable from a bill; mark it false so the product never attaches an invented number to it.
- promptFragment is an instruction to a downstream model: when this lever applies and how to explain it.

Be concrete and local. "Check for discounts" is worthless; "Israeli households get a recognised consumption allowance per registered occupant — check every occupant is registered" is what we need.

OUTPUT: after searching, reply with ONLY a JSON object matching this shape. No prose, no markdown fence, no commentary.
${SHAPE}`;

export async function researchUtilityPlaybook(args: {
  country: string;
  utility: string;
  /** Language to research and write local-language fields in (BCP-47 base). */
  language?: string | null;
  /** Provider names already seen in this market, to ground the research. */
  providers?: string[];
  /**
   * Anonymised line-item labels observed across MULTIPLE bills of this kind.
   * They tell the researcher what really appears on these bills, which is how
   * the playbook gets sharper with volume. Never contains customer values.
   */
  observedTerms?: string[];
}): Promise<PlaybookResearchResult | PlaybookResearchFailure> {
  const { country, utility, language, providers = [], observedTerms = [] } = args;

  const context = [
    `Country: ${country}`,
    `Utility: ${utility}`,
    language ? `Local language: ${language}` : null,
    providers.length > 0 ? `Providers seen in this market: ${providers.slice(0, 10).join(", ")}` : null,
    observedTerms.length > 0
      ? `Line-item wording observed on real bills of this kind (anonymised, no amounts) — explain these specifically in the glossary:\n${observedTerms
          .slice(0, 25)
          .map((t) => `- ${t}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: MessageParam[] = [
    { role: "user", content: `${context}\n\nResearch this market and return the playbook JSON.` },
  ];

  const call = async () => {
    // Streaming: a dozen web searches can outrun the SDK's 10-minute ceiling
    // for non-streaming requests.
    const stream = anthropic().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const message = await stream.finalMessage();
    const text = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { text, usage: message.usage };
  };

  try {
    let { text, usage } = await call();
    let parsed = parsePlaybook(text);

    if (!parsed.ok) {
      // Continue the same conversation rather than restarting: the search
      // results are already in context, so the repair costs a few hundred
      // tokens instead of another twelve searches.
      messages.push({ role: "assistant", content: text || "(no output)" });
      messages.push({
        role: "user",
        content: `That did not validate: ${parsed.error}\n\nReply with ONLY the corrected JSON object, matching the shape exactly. No prose, no markdown fence.`,
      });
      ({ text, usage } = await call());
      parsed = parsePlaybook(text);
    }

    if (!parsed.ok) {
      console.warn(`[playbook] ${country}/${utility} invalid after retry: ${parsed.error}`);
      return { error: "invalid_playbook", detail: parsed.error };
    }

    return {
      playbook: sanitize(parsed.value),
      usage: usageFrom(usage),
      promptVersion: PLAYBOOK_PROMPT_VERSION,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    console.warn(`[playbook] research failed for ${country}/${utility}: ${detail}`);
    return { error: "research_call_failed", detail };
  }
}

export function isPlaybookFailure(
  r: PlaybookResearchResult | PlaybookResearchFailure,
): r is PlaybookResearchFailure {
  return "error" in r;
}

type ParseResult = { ok: true; value: UtilityPlaybook } | { ok: false; error: string };

/** Pull the JSON object out of the reply and validate it against the schema. */
function parsePlaybook(text: string): ParseResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "no JSON object in the reply" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : "unknown"}` };
  }
  const result = UtilityPlaybookSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: issues };
  }
  return { ok: true, value: result.data };
}

/**
 * Drop anything unsourced or self-contradictory before it becomes cached
 * knowledge that many customers will be advised from. A playbook is read far
 * more often than it is written, so a bad one is expensive.
 */
function sanitize(pb: UtilityPlaybook): UtilityPlaybook {
  const httpOnly = (u: string) => /^https?:\/\//i.test(u);
  return {
    ...pb,
    // Benchmarks and schemes drive real advice — unsourced ones are dropped.
    benchmarks: pb.benchmarks.filter((b) => httpOnly(b.source)),
    schemes: pb.schemes.filter((s) => httpOnly(s.source)),
    sources: pb.sources.filter((s) => httpOnly(s.source)),
    levers: pb.levers.filter(
      // A switching lever in a market the researcher itself called
      // non-switchable is a contradiction; trust the market structure.
      (l) => !(l.requiresSwitching && !pb.marketStructure.switchable),
    ),
    marketStructure: {
      ...pb.marketStructure,
      regulatorUrl:
        pb.marketStructure.regulatorUrl && httpOnly(pb.marketStructure.regulatorUrl)
          ? pb.marketStructure.regulatorUrl
          : null,
    },
  };
}
