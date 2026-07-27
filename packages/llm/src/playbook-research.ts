import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { UtilityPlaybookSchema, type UtilityPlaybook } from "@bills/category-packs";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const PLAYBOOK_PROMPT_VERSION = "playbook-v1";

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
 */

export interface PlaybookResearchResult {
  playbook: UtilityPlaybook;
  usage: LlmUsage;
  promptVersion: string;
}

const SYSTEM = `You are a utilities market analyst. You research how ONE kind of consumer utility bill works in ONE specific country, so that an AI bill-decoder can explain those bills and find real savings.

Work like a professional data analyst, not a summariser:
1. SEARCH IN THE COUNTRY'S OWN LANGUAGE FIRST. English queries miss national regulators, local tariff pages and local consumer guidance. Search the local terms for the utility, the regulator, the tariff, and the social/discount schemes. Then cross-check in English if useful.
2. Prefer primary sources in this order: the national regulator, government or municipal pages, the providers' own tariff pages, then established consumer organisations. Avoid blogs and content farms.
3. Every substantive claim you report must carry the URL you actually read it on. If you could not verify something, leave it out rather than filling the gap from memory.

Answer these questions specifically:
- CAN A CONSUMER CHANGE SUPPLIER for this utility in this country? This is the decisive question. Many utilities are regional or municipal monopolies. Be explicit and be right; say switchable=false unless you found evidence that consumers genuinely choose their supplier.
- How is a bill of this kind actually built up? Fixed vs consumption charges, the unit used, whether tariffs are tiered/blocked, whether estimated readings are common.
- What line items appear on a typical bill, what does each one mean in plain words, and which are negotiable versus statutory pass-through?
- What discounts, social tariffs, rebates or exemptions exist, who qualifies, and how does someone claim them? These are where unclaimed money sits.
- What billing errors and overcharges are common in THIS market, and how does a consumer spot them on their own bill?
- What published benchmarks exist for normal consumption (per person, per household, per period)? These let us tell a customer their usage is high.
- What is the escalation route when a provider refuses — regulator, ombudsman, municipal complaint?

Then define the SAVINGS LEVERS that genuinely apply in this market, as structured data:
- Set requiresSwitching=true only for levers that need changing supplier. If the market is not switchable, do not invent switching levers at all.
- Set quantifiable=true ONLY when the saving can be computed from numbers printed on a customer's own bill (removing a priced add-on, a tariff change with a published price). Behaviour advice — reducing consumption, fixing a leak — is valuable but NOT quantifiable from a bill; mark it false so the product never attaches an invented number to it.
- Write each promptFragment as an instruction to a downstream model: when this lever applies and how to explain it.
- Titles: \`title\` in the country's main language, \`titleEn\` in English.

Be concrete and local. "Check for discounts" is worthless; "Israeli households are entitled to a 3.5 m³/person recognised consumption allowance — check your bill lists every occupant" is what we need.`;

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
}): Promise<PlaybookResearchResult | null> {
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

  try {
    const stream = anthropic().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${context}\n\nResearch this market and return the playbook.` }],
      output_config: { format: zodOutputFormat(UtilityPlaybookSchema) },
    });
    const message = await stream.finalMessage();

    const parsed = (message as { parsed_output?: unknown }).parsed_output as UtilityPlaybook | null | undefined;
    if (!parsed) return null;

    return {
      playbook: sanitize(parsed),
      usage: usageFrom(message.usage),
      promptVersion: PLAYBOOK_PROMPT_VERSION,
    };
  } catch (err) {
    console.warn(
      `[playbook] research failed for ${country}/${utility}:`,
      err instanceof Error ? err.message.slice(0, 200) : "",
    );
    return null;
  }
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
      regulatorUrl: pb.marketStructure.regulatorUrl && httpOnly(pb.marketStructure.regulatorUrl)
        ? pb.marketStructure.regulatorUrl
        : null,
    },
  };
}
