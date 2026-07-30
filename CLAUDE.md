# Fixplo.ai (repo: `bills`)

AI bill decoder and price negotiator. Upload a utility bill, get every line item
explained, then have an AI phone the provider and negotiate a better rate.

Live at **fixplo.ai**. Vercel project `bills-web`, deploys from `main`.

---

## Layout

pnpm + turbo monorepo. Node 22, Next.js 15 App Router, React 19, TypeScript.

```
apps/web              Next.js app: landing, upload, portfolio, API routes, webhooks
packages/pipeline     Bill processing orchestration
packages/llm          Claude calls: extraction, decode, comparison search, negotiate
packages/db           Drizzle schema, migrations, envelope encryption, tenancy
packages/channel      WhatsApp + Telegram adapters
packages/category-packs  Per-utility knowledge
packages/missions     Negotiation lifecycle, disclosure templates, OTP relay
packages/voice        Voxplo outbound call adapter
packages/shared       Types, locales, redaction, ulid
```

## The one thing to understand first

**Bills arrive from WhatsApp and Telegram, not from the website.** A customer
sends a photo to a bot and gets a link back. The web app is a later addition.

Consequences that bite if forgotten:

- Webhooks, crons and `/s/[token]` must stay unauthenticated. Putting auth in
  front of them breaks the product's main path.
- A `customers` row exists long before anyone visits the site. Web login links
  onto that row, it does not create a new identity.
- Anything that assumes "a request has a session" is wrong for most traffic.

## Hard product rules

1. **Never fabricate a number.** `decode.ts` calls this the one unforgivable
   failure. Every saving cites `extractionPaths` or a `comparisonOfferId`. If a
   figure cannot be grounded, describe the opportunity without one.
2. **No invented marketing claims either.** Landing page statistics are real and
   sourced (Citizens Advice 2018 and September 2025), each shown with its
   source. Mock UI is labelled as illustration.
3. **The AI always identifies itself on calls.** `packages/missions/disclosure.ts`
   renders the opening line from fixed templates before the model gets a turn,
   plus impersonation guards on model output.
4. **No HIPAA claims.** Utility bills are not health data. GDPR and encryption
   only.
5. **No em dashes in customer-facing text.** `decode.ts` has an explicit
   punctuation rule. Legacy strings still violate this, worst in
   `apps/web/src/app/s/[token]/summary-view.tsx` and
   `packages/channel/src/whatsapp/templates.ts`.
6. **Retention is opt-in.** Decoded data is deleted after 7 days unless
   `retentionConsentAt` is set. Having an account does not imply consent; the
   portfolio asks. The privacy copy on the landing page depends on this staying
   true.

## Design system

Dark neumorphism, from Figma file `ZhznTdXCbCdAwtFEF9bgMd`. Frames:
`landing-dark-neumorphism` (34:5), `neumorph-*` product screens (33:605 to
33:989), `fixplo-brand-board` (39:5).

- Brand `#7C5CFC`, savings `#10B981`. Geist for UI, Geist Mono for money.
- Depth comes from dual shadows, never borders. Utilities: `neu-raised`,
  `neu-inset`, `neu-raised-sm`, `neu-press`.
- **Tailwind v4 is loaded without preflight** and `globals.css` is imported into
  a `legacy` cascade layer by `tailwind.css`. Unlayered element selectors in
  `globals.css` otherwise beat Tailwind utilities and uppercase every heading.
  Do not "simplify" this by importing `globals.css` directly again.
- Fixplo styling is scoped to `.fx`. Legacy screens (`/try`, `/s/[token]`) still
  depend on `globals.css` and must keep working.
- **The `--fx-*` tokens live on `:root`, the appearance stays on `.fx`.** Clerk
  portals its modals and popovers to the end of `<body>`, outside every `.fx`
  subtree, so tokens declared on `.fx` resolve to nothing there. That is what
  made the account dialog unreadable. Custom properties are inert until read,
  so a root declaration costs the legacy pages nothing. Do not move them back.

## Tenancy

Two layers, deliberately.

1. `packages/db/src/tenant.ts` — `withTenant(db, customerId, fn)` opens a
   transaction, runs `SET LOCAL ROLE bills_tenant`, then sets
   `app.customer_id`. Repository functions in `packages/db/src/repo/` take a
   `customerId` and filter on it explicitly.
   `packages/db/test/tenant-guard.test.ts` fails the build if a repo function
   skips the scope or drops the filter.
2. Migration `0006_tenant_rls.sql` — RLS policies keyed to
   `current_setting('app.customer_id', true)`, granted **to the `bills_tenant`
   role only**.

**The app connects as `bills_app`, not as the table owner.** RLS was already
enabled on all eight tables before this work, with a permissive ALL policy for
`bills_app` so the pipeline, crons and share page can read and write without a
session. That has to stay true: bills arrive from WhatsApp long before anyone
visits the site.

So account traffic does not get a second connection. `withTenant` switches role
inside its transaction, which drops the permissive `bills_app` policy for the
rest of that transaction and leaves only the tenant policies. Both the role
switch and the setting are transaction-local, so they unwind on commit and
cannot leak across a pooled connection. There is no `DATABASE_URL_TENANT`.

**Migration 0006 was applied on 28 Jul 2026** and verified against live data:
`bills_app` saw all 30 invoices, `bills_tenant` scoped to a customer saw only
theirs, and with no `app.customer_id` set it saw zero.

**Migrations are applied by hand.** `drizzle-kit migrate` only runs entries in
`src/migrations/meta/_journal.json`, which lists `0000` alone. 0004 onward are
not journaled, so `pnpm db:migrate` silently skips them. **0008 was applied on
29 Jul 2026** and both partial indexes verified present.

**`/s/[token]` takes the signed JWT, never `summaryTokenId`.** That column is
the id of the row holding sha256(jti), and the token itself is deliberately not
stored, so a link cannot be rebuilt from the database. The portfolio linked to
`/s/{summaryTokenId}` and every "Open" answered "This link has expired. Message
us on WhatsApp again" to a signed-in person looking at their own dashboard.
Owners now go through `/portfolio/open/[invoiceId]`, which proves ownership
tenant-scoped and mints a fresh token. `/s/[token]` stays unauthenticated,
because the link arrives in a chat thread.

## The request cannot hold many bills

A real bill takes two to four minutes: extraction, market research, a live web
search, the decode. The route asks for `maxDuration = 800`, but the platform's
own function ceiling is lower and is what applies, so a two-bill upload was
killed mid-stream and the customer got `connection_dropped` after five minutes
with bill 1's finished analysis stranded in the database.

Three defences, all in `run-bill-upload.ts` and `upload-form.tsx`:

- `BILL_BUDGET_MS` (240s), checked *before* starting each bill. What does not fit
  is reported as `not_attempted`, which is true and actionable.
- A `billDone` progress event per finished bill. The client keeps them, so a
  stream that dies later still shows the bills that completed instead of an
  error over the top of finished work.
- Progress percentages are scaled into the current bill's slice. Unscaled, bill 1
  of 2 climbed to 99% and sat there while bill 2 worked, then jumped *backwards*
  to 32%. Plus a visible elapsed clock, because a moving bar cannot distinguish a
  long real wait from a hang.

**Only `delivered` invoices reach the portfolio.** Failed rows were listed as
"Unnamed provider / Requires review" and counted in the provider total; they die
during extraction so they have no provider, no total and no summary, and nothing
about them can be reviewed or opened.

**`browserLocale()` must not be called during render.** It returns "en" on the
server and the real language on the client, so a Hebrew browser threw React #418
and threw away the server HTML. Use `useBrowserLocale()`.

## Overload (429 / 529)

A 529 `overloaded_error` killed a multi-bill upload and surfaced the raw JSON
body to the customer. Three things changed.

The SDK client now uses `maxRetries: 5` (default is 2, which covered about a
second and a half) and a 10 minute timeout, since a decode legitimately takes
minutes. The SDK already backs off exponentially with jitter and honours
`retry-after`; it just was not given enough attempts.

`isOverloaded()` in `packages/llm/src/client.ts` matches on both the status and
the stringified body, because by the time the pipeline sees the error only the
message may have survived. It must stay false for real failures: telling someone
to wait when their bill will never work is its own kind of wrong.

Overload gets its own `PipelineError` code, its own `invoices.error_code`, and a
retry button rather than an error string. A multi-bill upload stops at the first
overload instead of burning tokens on bills that will fail the same way, and
reports the rest as not attempted.

## Several bills in one upload

`packages/llm/src/split-bills.ts` sorts dropped pages into bills before the
pipeline runs. Everything in an upload used to be treated as pages of one bill,
so a phone bill and an electricity bill dropped together were read as one
document: one provider, one total, line items from both, and no error.

- A single page returns immediately with no model call, so the ordinary upload
  costs nothing extra. The call only happens when there is something to decide.
- `SPLIT_MODEL` (env, defaults to `MODEL`) picks the model. The job is easy and
  the cost is in the images, so point it at something cheaper once you have
  confirmed the id. A wrong id fails soft.
- **Every failure path returns one group containing every page**, which is
  exactly the old behaviour. The one invariant enforced in code is that each
  page appears exactly once: a dropped page would delete part of a bill, a
  repeated one would double a charge.
- `apps/web/src/server/run-bill-upload.ts` runs `runBillPipeline` once per
  group, sequentially. Sequential because the daily cap and per-customer quota
  are checked per bill, so concurrency would let one upload slip past a limit.
- `runBillPipeline` still means one bill. The WhatsApp path and the dev harness
  are unchanged.
- `/api/upload` keeps the old single-bill response shape when there is one bill,
  so anything reading `summaryUrl` still works. Several bills return
  `{billCount, bills[], failures[]}`.

Chat (WhatsApp, Telegram) does not split yet: pages arrive over minutes into one
pre-created invoice, so it needs the intake machine to create siblings.

## The provider page

`/portfolio/service/[key]` is everything from one provider: every bill, what they
add up to, highest and lowest, the month-by-month chart for that service alone,
its own alerts, and the full bill list with per-bill open and delete.

"Open" on a service card used to go straight to the latest bill, so a card reading
"5 bills" opened one month's statistics. Cards with more than one bill now go here;
a single-bill card still goes straight to the bill, because the hop would be empty.

It calls `getDashboard` and filters, rather than adding a per-service query. One
service is a filter over the same grouping, and a second code path could disagree
about the typical month or which bill is latest.

The key is `provider|category|country` base64url-encoded, because it carries a
pipe and, for most of the world, non-Latin text. `decodeServiceKey` round-trips to
reject a mangled parameter rather than looking up a service that cannot exist.
Deleting the last bill of a service makes the page's subject vanish, so it
redirects to the dashboard rather than erroring: nothing is wrong.

## Deleting

`packages/db/src/repo/delete-bill.ts` is the one routine, used by the portfolio's
per-bill Delete and by the WhatsApp delete-everything flow. There were two
implementations and they had drifted: the chat one left the provider, totals and
dates on the invoice row while telling people it "permanently deletes your bills".

What deleted means:

- **Gone:** the decode, the extraction, the stored pages, every share link
  revoked, and the identifying columns on the invoice row itself (provider,
  totals, dates, country, both duplicate fingerprints).
- **Kept:** the row, holding an id, a customer id, `status = 'deleted'` and
  timestamps. That is what makes a deletion auditable instead of
  indistinguishable from a bug. Also a `deletion_requests` row per bill.
- **Kept:** `bill_stats`. No customer or invoice linkage, month-level time,
  unlinkable to a person by construction, which is what lets it outlive the bill.
  **Never add a linking column to that table.**

It refuses rather than half-deleting when a mission is open on the bill: a call
has been placed quoting its figures and the walk-away ceiling lives in the decode.

The fingerprints are cleared on purpose. Keeping them would let a re-upload be
answered with "you already have this" and a link to something that no longer
exists.

`/s/[token]` already handles both a revoked token and `status = 'deleted'`, and
`/portfolio/open/[invoiceId]` bounces a deleted bill back to the dashboard.

## Duplicate bills

People re-send bills constantly, usually because the first reply was missed.
`packages/pipeline/src/duplicate.ts` catches it two ways, at two costs.

- `hashPages` — sha256 over the per-page sha256s. The same file re-sent, caught
  before any model call and before an invoice row exists.
- `billFingerprint` — sha256 over provider, account number, billing period and
  total. The same bill photographed again, caught one extraction later, before
  the expensive market research and decode.

Both lookups are scoped to the customer, always. Two tenants of one building get
byte-identical bills, and matching across customers would be wrong and would
disclose that someone else's bill exists.

The fingerprint deliberately excludes issue and due dates (a re-issued bill
changes them) and line items (OCR mangles them on a poor photo). It deliberately
includes the total, so a **corrected** bill for the same period is treated as
new. It returns null when extraction recovered too little, and null means decode
normally: a wrong "you already sent this" hides a real bill, which is worse than
paying for one repeat.

Duplicate uploads get status `duplicate` plus `duplicate_of_invoice_id`, are
excluded from `getPortfolio`, and are answered with a **freshly minted** token
for the original (the first token is stored hashed and may have expired).
`force: true` skips both checks, and only the "Analyse it again" action sets it.

Bills delivered before 29 Jul 2026 have no hash and no fingerprint, so they
cannot be matched. Backfilling the fingerprint from the plain invoice columns
would produce a different hash from the live path, because the account number
lives only in the encrypted extraction.

## Auth

Clerk, gated on **both** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` via `apps/web/src/lib/clerk-enabled.ts`.

Gating on the publishable key alone took the whole site down on 27 Jul 2026:
`ClerkProvider` rendered, called `auth()`, Clerk could not initialise without a
secret, and every route returned 500. Half-configured auth reads as off. If you
touch this, test the build with the public key set and the secret unset.

`clerk-enabled.ts` is server and middleware only. `CLERK_SECRET_KEY` does not
exist in a browser bundle, so a client import tears hydration.

**Development and production are different Clerk instances with different keys.**
A `pk_test_` pair only works on localhost: it relies on a dev-browser handshake
that never happens on a real domain, so on fixplo.ai Clerk loads, reports every
visitor as signed out, and the form never becomes usable. The symptom in the
response headers is `x-clerk-auth-reason: dev-browser-missing`. Production needs
a `pk_live_` / `sk_live_` pair plus the `clerk` and `accounts` CNAMEs on the
domain. Google and other social connections also need your own OAuth
credentials on production; Clerk's shared ones are development only.

**Env changes do not redeploy.** `NEXT_PUBLIC_` values are compiled into the
bundle, so a key added in Vercel reaches nothing until the next build.

**Clerk v7 renamed the appearance variables.** `colorText`,
`colorTextSecondary`, `colorInputBackground` and `colorInputText` are now
`colorForeground`, `colorMutedForeground`, `colorInput` and
`colorInputForeground`. Unknown keys are dropped without a warning, so a stale
name looks like a design choice rather than a bug: the account dialog rendered
Clerk's default near-black text on our near-black card for days. The values are
`var(--fx-*)` references so the dialog follows the theme toggle, except
`colorPrimary`, `colorDanger`, `colorSuccess` and `colorWarning`, which Clerk
parses to build a scale and which therefore must stay literal.

Sign-in links onto the existing customer row by **verified phone only**
(`apps/web/src/server/auth/resolve-customer.ts`). Clerk proves the number,
`wa_hash` is the same peppered hash. An unverified phone links nothing,
otherwise anyone could claim a stranger's bills.

A Google or email sign-up therefore gets a placeholder row (`wa_id` of
`clerk:<userId>`). If that person later verifies a phone that matches an
unclaimed row, `resolveCustomer` moves the Clerk link onto it, but only while
the placeholder owns zero invoices. Past that they have two real histories and
merging them is their decision, not a side effect of logging in.

**`/api/upload` resolves the session customer**, falling back to the per-IP
pseudonym when signed out. It did not until 29 Jul: every web upload went to the
IP identity, so signing in and uploading produced an empty portfolio. Both paths
write a valid row, so nothing ever errored.

## Voice

`packages/voice` wraps **Voxplo**, the in-house agent. No third party voice
vendor. Disclosure is rendered before the model speaks, the walk-away ceiling is
re-checked in code by `readOutcome`, credentials may never be read out, and the
tool allowlist is keypad entry, human detection and hanging up.

REST paths (`/v1/calls`) are a guess and still need confirming against the live
Voxplo API. Config: `VOXPLO_BASE_URL`, `VOXPLO_API_KEY`, `VOXPLO_CALLER_ID`.

## Environment

Set: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `WA_HASH_PEPPER`, blob and QStash
tokens, and both Clerk keys on Production.

**Production is still serving the development Clerk instance.** Checked again on
29 Jul 2026: `https://fixplo.ai/` answers with `x-clerk-auth-reason:
dev-browser-missing`, and Clerk's own orange "Development mode" badge appears at
the foot of the account dialog. So `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` on
Production is still a `pk_test_` key despite the live pair having been added.
Until that is a `pk_live_` key, sessions on the real domain are unreliable by
design, and any auth symptom should be checked against this before the code is
blamed.

Missing or unset:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, QStash trio,
  `BLOB_READ_WRITE_TOKEN` were flagged unset earlier.

## Commands

```
pnpm dev                      # apps/web
pnpm build                    # turbo, all packages
pnpm typecheck
pnpm test                     # turbo; includes the tenant guard
pnpm --filter @bills/db db:migrate
```

## Open work

- Product screens still unbuilt: bill summary, authorisation, live call,
  outcome. They need a `negotiations` table first; building them as static
  mockups would mean inventing numbers, which rule 1 forbids.
- Mobile bottom tab navigation.
- Em dash cleanup in legacy strings.
- Playbook queue: 90 market playbooks, self-draining via cron.
  `/api/admin/playbook?action=list`.

## Working notes

- Commit messages here explain **why**, including what was tried and rejected.
  Keep that.
- Verify against the failure shape rather than assuming. Three deploys went out
  believing Clerk worked because nobody built with one key present and the other
  absent.
- Prefer editing in place over rewriting: `globals.css` and the legacy screens
  carry a lot of accumulated RTL, locale and formatting fixes.
