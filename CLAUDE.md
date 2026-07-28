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

## Tenancy

Two layers, deliberately.

1. `packages/db/src/tenant.ts` — `withTenant(db, customerId, fn)` opens a
   transaction and sets `app.customer_id`. Repository functions in
   `packages/db/src/repo/` take a `customerId` and filter on it explicitly.
   `packages/db/test/tenant-guard.test.ts` fails the build if a repo function
   skips the scope or drops the filter.
2. Migration `0006_tenant_rls.sql` — RLS policies keyed to
   `current_setting('app.customer_id', true)`, granted **to the `bills_tenant`
   role only**, not FORCEd.

**Why not FORCE:** ten server files run the pipeline, crons and share page with
no session. FORCE applies policies to the table owner too, and RLS filters
silently rather than erroring, so forcing it would stop the WhatsApp bot with
nothing in the logs. The pipeline connects as owner and is exempt; account
traffic uses `tenantDb()` as `bills_tenant`.

**Migration 0006 has NOT been applied to the database yet.** It is safe to run.

## Auth

Clerk, gated on **both** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` via `apps/web/src/lib/clerk-enabled.ts`.

Gating on the publishable key alone took the whole site down on 27 Jul 2026:
`ClerkProvider` rendered, called `auth()`, Clerk could not initialise without a
secret, and every route returned 500. Half-configured auth reads as off. If you
touch this, test the build with the public key set and the secret unset.

`clerk-enabled.ts` is server and middleware only. `CLERK_SECRET_KEY` does not
exist in a browser bundle, so a client import tears hydration.

Sign-in links onto the existing customer row by **verified phone only**
(`apps/web/src/server/auth/resolve-customer.ts`). Clerk proves the number,
`wa_hash` is the same peppered hash. An unverified phone links nothing,
otherwise anyone could claim a stranger's bills.

## Voice

`packages/voice` wraps **Voxplo**, the in-house agent. No third party voice
vendor. Disclosure is rendered before the model speaks, the walk-away ceiling is
re-checked in code by `readOutcome`, credentials may never be read out, and the
tool allowlist is keypad entry, human detection and hanging up.

REST paths (`/v1/calls`) are a guess and still need confirming against the live
Voxplo API. Config: `VOXPLO_BASE_URL`, `VOXPLO_API_KEY`, `VOXPLO_CALLER_ID`.

## Environment

Set: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `WA_HASH_PEPPER`, blob and QStash
tokens, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Missing or unset:
- `CLERK_SECRET_KEY` — not reaching production. Sign-in stays off until it does.
- `DATABASE_URL_TENANT` — optional. Without it `tenantDb()` falls back to the
  owner connection and warns once; repository scoping still applies but RLS
  does not.
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

- Apply migration 0006.
- Set `CLERK_SECRET_KEY` in Vercel with Production ticked.
- Product screens still unbuilt: bill summary, authorisation, live call,
  outcome. They need a `negotiations` table first; building them as static
  mockups would mean inventing numbers, which rule 1 forbids.
- Mobile bottom tab navigation.
- Em dash cleanup in legacy strings.
- Stat numbers on the landing page use Geist Mono, which spaces the decimal
  oddly at display size. Should be sans; keep mono for real bill figures.
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
