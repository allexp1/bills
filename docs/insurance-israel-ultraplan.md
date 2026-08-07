# Insurance decoding — the Israel ultraplan

Fixplo today decodes utility bills. This plan adds the second product:
**decoding insurance and pension statements**, starting in Israel, in the
customer's own language, with their rights attached.

> **Scope decision (7 Aug 2026): EXPLANATION ONLY.** No comparison, no
> switching, no product recommendations — those phases stay in this document
> as background but are explicitly not being built now. The product is: by
> law everyone receives a periodic statement (monthly for policies, annual
> plus quarterly for pension); they upload it — or, later, forward it by
> email — and get a plain-language explanation of what they have, what it
> costs, what it covers, and their rights. Everything in Part 2 (the legal
> lines) applies with extra force: the decode never names a fund or insurer
> to move to.
>
> **Email-forward intake** is the one new channel this scope adds: a
> forward-to address (e.g. bills@fixplo.ai) feeding the same pipeline.
> Needs an inbound-email provider (Postmark / SendGrid inbound parse /
> Cloudflare Email Routing) plus DNS on the domain — provider choice is an
> account/cost decision, then a webhook route that extracts attachments and
> calls `runBillPipeline`.

Why Israel first is not just "home market". Israel is unusually good for this
product: every employee has a pension by law, every driver has mandatory
insurance, statements are famously unreadable, management fees are genuinely
negotiable, and the state runs two central registries (Har HaBituach, the
Pension Clearing House) that make "what do I actually have?" an answerable
question. And a large immigrant population receives Hebrew statements they
cannot read at all — translation is not a feature here, it is the product.

---

## Part 1 — How insurance works in Israel (the domain knowledge)

### 1.1 The regulator and the two registries

- **רשות שוק ההון, ביטוח וחיסכון** (Capital Market, Insurance and Savings
  Authority, CMISA) regulates all insurers, pension funds, provident funds and
  agents. Its public-complaints unit (פניות הציבור) takes consumer complaints
  against insurers **free of charge** and insurers must answer it. This is the
  escalation route we print on every insurance summary.
- **הר הביטוח (Har HaBituach)** — harb.cma.gov.il — a state registry where any
  citizen sees **every insurance policy held in their name across all
  companies**, free. Built exactly to find duplicate and forgotten coverage.
- **המסלקה הפנסיונית (the Pension Clearing House / Mislaka)** — the state
  pipe between all pension bodies. A personal report (~₪20) lists **every
  pension product in your name**; institutions must answer within 3 business
  days. Also the rail on which pension transfers (ניוד) run.

These two registries are our unfair advantage: for a utility bill we can only
see what the customer sends; for insurance we can tell the customer exactly
how to fetch their complete picture in ten minutes, then decode all of it.

### 1.2 Pension (the biggest one)

- **Mandatory since 2008** (expansion order). Roughly: employee ~6%, employer
  ~6.5%, plus severance component ~6–8.33% of salary, into a pension fund
  (קרן פנסיה), managers' insurance (ביטוח מנהלים) or provident fund (קופת גמל).
- **Management fees (דמי ניהול) are charged twice**: a % of deposits AND a % of
  accumulation. Legal maxima for a new comprehensive pension fund: 6% of
  deposits + 0.5% of accumulation. **State default funds (קרנות ברירת מחדל)**
  are capped around **1% of deposits + 0.22% of accumulation** and must accept
  anyone. The spread between what people pay and the default-fund price is the
  single largest recurring saving in this whole domain — and fees are
  individually negotiable.
- A pension fund is also **insurance**: it embeds disability cover (נכות) and
  survivors' cover (שארים). A single person paying for survivors' cover they
  cannot use is a classic, fixable waste (can waive for 2 years at a time).
- **קרן השתלמות (study fund)** — tax-free savings vehicle, liquid after
  6 years, same twice-charged fee structure, same negotiability.
- **ביטוח מנהלים vs קרן פנסיה**: managers' insurance has personal contracts
  and historically guaranteed annuity factors (מקדם) — pre-2013 policies with
  guaranteed factors are often worth KEEPING despite high fees. This is the
  case where "switch to the cheaper one" is wrong, and why the decode must
  explain rather than auto-recommend.
- **ניוד (transfer) is a regulated right**: moving accrual between funds is
  free, keeps seniority rights, and is **not a tax event**. Runs through the
  Mislaka on standard forms; the receiving fund does the work.
- **The annual/quarterly statement** (the document we decode) contains:
  contributions per month (against payslips — missing employer deposits are a
  real and common problem), both management fees, track (מסלול), return
  (תשואה), insurance components, projected pension, severance balance.

### 1.3 Health

Four layers, and the layering is exactly what confuses people:

1. **State basket** — National Health Insurance Law 1994, via the four health
   funds (קופות חולים). Not on any statement; funded by the health tax.
2. **שב"ן (supplementary, "Mushlam/Adif/Zahav" etc.)** — the health fund's
   paid add-on. Must accept every member regardless of health/age; uniform
   price per age band. Covers private surgery choice, off-basket drugs, etc.
3. **Private health insurance** — from insurance companies. Underwritten,
   priced individually, richer coverage.
4. **Group policies** — through employers, often forgotten.

**The classic waste is layers 2–4 overlapping**: paying privately for surgery
cover the שב"ן already provides, or holding both a group and a personal
policy. Since a 2016 reform, private surgery policies are more standardised,
"from the first shekel" vs "supplementary to שב"ן" matters, and the decode's
job is to name which kind the customer holds. Har HaBituach reveals the
duplicates.

### 1.4 Car

- **ביטוח חובה (mandatory)** — bodily injury only, no-fault, required by law
  to drive. Refused drivers are insured by **the Pool** (residual market all
  insurers share). The certificate must be paid to be valid.
- **צד ג׳ (third party)** — damage to others' property.
- **מקיף (comprehensive)** — includes own damage/theft.
- Cancellation mid-term is allowed with a pro-rata style refund (insurers
  apply short-rate tables); renewal is where prices jump, and the renewal
  notice is a document worth decoding on its own.

### 1.5 Home and mortgage

- A mortgage requires (by bank condition, not statute) **life insurance** on
  the borrowers with the bank as beneficiary, and **structure insurance**.
- **The bank sells both at the closing table, and the bank's price is usually
  beatable** — switching mortgage life insurance to a direct insurer while
  keeping the bank as beneficiary is legal, common, and one of the cleanest
  savings in Israeli personal finance. Premium falls as the outstanding
  principal falls; people keep paying the original premium for years.
- Home contents (תכולה) vs structure (מבנה) confusion is routine.

### 1.6 Travel

Per-trip policies, plus the gotcha that credit cards "include" travel
insurance whose real coverage is thin. Decode job: what is actually covered
(medical ceiling, baggage, cancellation, extreme sports exclusion, existing
conditions) rather than the price, which is small.

### 1.7 Rights that go on every summary

- Cancel any policy at any time in writing; the insurer must stop charging.
- 30-day free-look style protections on new policies; renewals must disclose
  price changes.
- Claim denied → internal appeal → CMISA public complaints unit (free) →
  small claims court (up to ~₪38k, no lawyer needed).
- An insurer must justify a denial in writing, citing the policy clause.
- Agents earn commission from insurers — asking "what do you earn on this?"
  is legitimate. Pension advice from banks (יועץ פנסיוני) is
  commission-independent by law; from agents (משווק פנסיוני) it is not.

---

## Part 2 — The legal lines WE must not cross

This section exists because the product itself is regulated territory.

1. **Explaining a document a customer holds = fine.** Plain-language
   explanation, translation, arithmetic on printed numbers, pointing at the
   state registries and complaint routes — consumer information, not a
   licensed activity.
2. **"Move to fund X" = ייעוץ/שיווק פנסיוני, a licensed activity** under the
   2005 Pension Advice Law. Personalized recommendations to buy, sell or
   switch a pension product require a license. Same for insurance brokering.
   Phase 1–2 therefore output **facts and questions, not instructions**:
   "the default funds' cap is 0.22%/1% and you pay 0.6%/3%; here is the
   Mislaka transfer page; here are the three questions to ask" — never
   "switch to Altshuler". The negotiation pitch asks the customer's OWN fund
   for a fee reduction, which is negotiation, not product advice.
3. **Phase 4 (actually moving people) needs either a licensed partner
   (agency/יועץ) or our own license.** Budget legal counsel before building
   it. This is also true of the Voxplo call: calling YOUR insurer to ask for
   a discount on an existing policy is negotiation; calling to replace the
   product is brokering.
4. **Privacy changes class.** CLAUDE.md rule 4 says "utility bills are not
   health data". Insurance statements ARE: health conditions, disability
   coverage, beneficiaries. Under the Privacy Protection Law (esp. Amendment
   13, in force since Aug 2025) this is sensitive data with heightened
   duties. Consequences, concrete:
   - Health/medical details never leave the decode context: the stored
     summary keeps coverage amounts and fees, never diagnoses or conditions.
     Extend `redactRestrictedData` with a medical-terms class before launch.
   - Retention stays opt-in and short; deletion must actually delete.
   - The anonymous `bill_stats` whitelist gets NO new medical fields.
   - DPO/registration duties likely apply as volume grows — legal review
     before marketing the feature, not after.

---

## Part 3 — Product design

### 3.1 Same page or dedicated page? Dedicated section, same spine.

**Intake stays unified** — one upload, one WhatsApp/Telegram bot. Extraction
already classifies; it learns to route statements. Nobody should have to know
which door their PDF belongs to.

**The portfolio splits into two tabs**: *Bills* (monthly rhythm: totals,
month-over-month, "what moved") and *Insurance* (annual rhythm: coverage,
fees, gaps, duplicates). Forcing a pension statement into a "monthly outflow"
card produces nonsense — there is no monthly total on it, and its questions
are "am I covered / what do I pay in fees / who gets it", not "why is this
month higher". Different questions, different template — but the same design
system, pipeline, guardrails, encryption, share tokens and translation.

**A dedicated summary template** for statements, coverage-first:
- **What you have** — product, company, track, in one sentence.
- **What it costs** — both fee rates, in shekels per year, next to the
  relevant benchmark (default-fund caps for pension; nothing invented).
- **What it covers** — amounts, beneficiaries, the exclusions that matter.
- **What to check** — contributions vs payslip, fee vs cap, duplicate
  coverage (with the Har HaBituach link), single-person survivors' cover.
- **Your rights** — cancellation, ניוד, complaint route. Localized.
- **Ask for a better price** — the existing pitch generator, pointed at fee
  reduction with the customer's own numbers.

### 3.2 Translation is the wedge

The olim story: a Russian-speaking 55-year-old holding a Hebrew pension
statement is the single clearest user of this product. We already have
bill-language-first rendering, 8 locales, LQA'd translation with numeric
invariance. Insurance adds locale-specific **rights text** (reviewed, static,
versioned — not model-generated per request) in he/ru/en/fr + the rest.
Static because rights text is legal-ish content: written once, checked once,
reused for everyone, updated when the law changes.

### 3.3 How it lands on the architecture

Reuses the utility-playbook machinery deliberately:

- **New categories**: `pension_statement` (pension fund / bituach menahalim /
  gemel / hishtalmut), `insurance_policy` (car, home, health, life, travel —
  a `policyKind` field, one schema). Two packs, not seven: the grammar-size
  ceiling on structured output is real, and statements share most fields.
- **Extraction fields (pension)**: company, product type, track, period,
  contributions by month {employee, employer, severance}, feeOnDeposits,
  feeOnAccrual, feesPaidNis, accrual, return, projectedPension,
  disabilityCover, survivorsCover, beneficiaries-present (boolean — names
  never stored), guaranteedAnnuityFactor (boolean, pre-2013 detector).
- **Extraction fields (policy)**: policyKind, insurer, premium + frequency,
  coverages[{label, amountNis}], deductible, exclusions[], startEnd, renewal
  date, "from first shekel vs supplementary" flag for health.
- **Playbooks**: the researched-market machinery extends with utility slugs
  `pension`, `health_insurance`, `car_insurance`, `home_insurance`,
  `travel_insurance` for `(IL, ...)` — same schema; benchmarks carry the
  default-fund caps and שב"ן facts with sources. Hand-seed IL rows from this
  document's facts, let re-research keep them current. Other countries get
  the same product later by the same research path — that is the point of
  the playbook system.
- **Guardrails unchanged in principle**: every shekel amount traces to the
  statement; fee benchmarks cite the regulator's published caps; "you could
  save X" only when X = (your fee − cap) × your accrual, which is arithmetic
  on printed numbers, clearly labeled as such.
- **New gotcha checks** (the Israeli greatest hits): fee above default cap;
  survivors' cover while single; employer deposits missing months; duplicate
  health layers; mortgage life premium not falling with principal; credit-card
  travel cover assumed sufficient; pre-2013 מקדם warning against switching.

### 3.4 Phases

- **Phase 1 — Pension decode (IL).** The statement everyone has and nobody
  reads. Extraction pack, summary template, fee-vs-cap arithmetic, pitch for
  fee reduction, rights text ×8 locales, Har HaBituach + Mislaka pointers.
  Privacy work (medical redaction class, no new stats fields) lands here.
- **Phase 2 — General policies (IL).** Car renewal, home/mortgage, health
  layer-mapping, travel. Duplicate detection across uploaded documents.
- **Phase 3 — Comparison.** Public price data (car insurance has a
  regulator comparison site; pension fees are published) shown as *market
  context with sources*, still no "switch to X".
- **Phase 4 — Switching.** Licensed partner or license. Legal counsel first.
  The Voxplo negotiation call stays within "your own provider" until then.

### 3.5 What stays true from the utility side

Every existing hard rule survives contact: never fabricate a number, AI
discloses itself, retention opt-in, RTL-first rendering, no em dashes in
customer text. The one rule that *changes* is the health-data assumption —
Part 2.4 — and that change is the first engineering task of Phase 1, not the
last.

---

## Sources

- CMISA / רשות שוק ההון: [thegfin.com compendium](http://www.thegfin.com/compendium/israel-capital-markets-insurance-savings-authority-cmisa), [Lexology — insurance regulation in Israel](https://www.lexology.com/library/detail.aspx?g=4fb5f66e-5f6a-4f7b-9b4d-20e8c8c44ce9)
- Har HaBituach: [harb.cma.gov.il](https://harb.cma.gov.il/), [Harel explainer](https://www.harel-group.co.il/insurance/information/har-habituah)
- Pension clearing house & transfers: [Semerenko — managing pension accounts](https://semerenkogroup.com/managing-pension-accounts-israel/), [Times of Israel on the Mislaka](https://www.timesofisrael.com/online-service-aims-to-clean-up-israels-pension-mess/), [Route 38 — check your pension is paid](https://blog.route38.co.il/2026/02/09/how-to-check-if-your-pension-is-being-paid/)
- Default funds and fee caps: [Semerenko — Israeli pension system](https://semerenkogroup.com/israeli-pension-system/), [CWS — freelancer pension 2026](https://www.cwsisrael.com/freelancer-pension-rights-israel-2026/), [neto.work — employee pension contributions](https://www.neto.work/en/employee-pension-contributions-in-israel/)
- Keren hishtalmut: [IsraelLaw.info guide](https://israellaw.info/articles/keren-hishtalmut-israel), [Blue & White Finance guide](https://bluewhitefinance.com/the-ultimate-guide-to-keren-hishtalmut/)
- Health / שב"ן: [Maccabi — supplementary insurance](https://www.maccabi4u.co.il/healthguide/administrative_terms/supplementary_insurance/), [Clal — private vs fund insurance](https://www.clalbit.co.il/healthins/faq/privateinsurance/), [Paamonim — health insurance](https://www.paamonim.org/he/health_insurance/)
- Car / the Pool: [4israel — car insurance types](https://blog.4israel.co.il/en/auto/car-insurance-in-israel-types-of-policies-and-cost/), [AIG Israel financial report (Pool description)](https://aig.co.il/wp-content/uploads/FS-package_2024-English.pdf), [Shivat Zion guide](https://shivat-zion.com/information-portal/transportation/understanding-car-insurance-in-israel/)
- Mortgage insurance: [Menora — is mortgage life insurance mandatory](https://www.menoramivt.co.il/article/mortgage-life-insurance), [Ayalon — mortgage building and life insurance](https://www.ayalon-ins.co.il/insurance/mortgage/good-to-know/building-insurance-and-life-insurance-mortgage/)
- Reading the annual pension report: [Migdal — the annual report](https://www.migdal.co.il/pensionary-savings/pension-funds/articles/annual-report), [Menora — how to read it](https://www.menoramivt.co.il/general/articles-fellow/pension_annual_report)
- Disputes and complaints: [Legal 500 — insurance disputes Israel](https://www.legal500.com/guides/chapter/israel-insurance-disputes/), [Lexology — insurance claims in Israel](https://www.lexology.com/library/detail.aspx?g=7a5eeb44-cf15-4376-9750-d295b6c8f40f)
