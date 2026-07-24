# Bills — WhatsApp bill decoder & saver

Send a photo or PDF of any recurring bill (energy, broadband, mobile — more categories are pluggable) to a WhatsApp number and get back:

1. a jargon-free, line-by-line explanation of what you're actually paying for,
2. the real numbers on a clean, mobile-first web summary (signed link, no login, light/dark),
3. concrete, category-aware steps to lower the bill — every claimed saving verified in code against the extracted data.

Phase 2 (designed, gated — see `packages/missions`): on the customer's written authorization, help them act on the bill via the **co-pilot relay**: the LLM drafts each negotiation message, the customer sends it from *their own* WhatsApp to the provider with a one-tap prefilled `wa.me` link, forwards the reply back, and the model computes the next move. This keeps the sender identity on the contract (provider bots key on the customer's number), needs no business-to-business WhatsApp messaging (unsupported by Meta's platform), and stays inside Meta's 2026 AI-chatbot policy. Card numbers / national IDs are redacted from every draft; steps that truly require them fall back to explicit "do this yourself" instructions.

## Architecture

```
WhatsApp (Meta Cloud API)
   │ webhook (HMAC-verified)
   ▼
apps/web (Next.js on Vercel)
   ├─ /api/whatsapp/webhook   → intake state machine (multi-page collection, debounce)
   ├─ /api/jobs/*             → QStash-invoked: media ingest, bill processing
   └─ /s/[token]              → signed summary page (7-day JWT, revocable)

packages/
   shared          money (integer minor units), locales (en/es/fr/pt/de), redaction, ULIDs
   db              Drizzle schema + envelope encryption (per-row AES-256-GCM DEKs under a KEK)
   channel         ChannelAdapter interface + WhatsApp Cloud API implementation
   category-packs  pluggable packs: extraction schema + decode hints + savings levers with
                   code validators — the pack contract is `src/pack.ts`
   llm             claude-opus-4-8: vision extraction + decode/savings (structured outputs)
   pipeline        intake machine, guardrails (no-fabricated-numbers pass), WA rendering, tokens
   missions        Phase 2: mission lifecycle, co-pilot relay (wa.me drafting, transcript
                   fencing, draft guards), disclosure enforcement, OTP store
```

**Pipeline:** pages → single-pass Opus vision extraction (merged schema of all packs, category auto-detected, every leaf nullable — the model must return null rather than guess) → decode + savings call (customer's language) → **guardrail pass** (pure code: every savings claim re-validated by its lever, every currency amount in prose must be derivable from extracted data; fabricated numbers are stripped and reported) → WhatsApp summary + buttons + signed link.

## Getting started

```sh
pnpm install
docker compose up -d            # postgres + redis + minio (local parity)
cp .env.example .env            # fill in Meta + Anthropic credentials
pnpm db:generate && pnpm db:migrate
pnpm dev                        # Next.js on :3000
ngrok http 3000                 # public URL for the Meta webhook
```

Point the Meta app's webhook at `https://<ngrok>/api/whatsapp/webhook` with your `WHATSAPP_VERIFY_TOKEN`. Message the test number; you should get the greeting, and a bill photo/PDF should come back decoded (requires `ANTHROPIC_API_KEY`).

Without `QSTASH_TOKEN`, jobs run in-process (fine under `next dev`). In production, provision Upstash QStash and set the signing keys — job routes verify every callback.

## Tests

```sh
pnpm typecheck && pnpm test     # unit suites, no network
pnpm test:golden                # real Opus extraction over fixtures/golden-bills (needs ANTHROPIC_API_KEY)
node scripts/generate-golden-bills.mjs   # regenerate synthetic fixture PDFs
```

## Deployment (Vercel)

- Deploy `apps/web`; provision Supabase Postgres, Upstash QStash (+ Redis for Phase 2), Vercel Blob.
- Bill processing runs 30–60 s of model calls: job routes declare `maxDuration = 300`, which requires Fluid compute (paid plan). If unavailable, run the same handlers in a small container elsewhere — the package layout keeps transport and pipeline separate.
- Set every variable from `.env.example`. Generate `ENVELOPE_KEK_BASE64` per environment; production should hold it in a KMS.
- WhatsApp templates in `packages/channel/src/whatsapp/templates.ts` must be submitted for Meta approval (per locale) before any messaging outside the 24-hour service window.

## Privacy model

- Extracted data, decodes, message bodies, and media bytes are envelope-encrypted before they reach Postgres/Blob storage.
- Logs never contain phone numbers, message bodies, or account numbers (`redactForLog`); correlation uses HMAC phone hashes.
- Customers can type "delete" at any time: media, extractions, decodes and messages are hard-deleted, summary links revoked, the customer row anonymized.
- OTPs (Phase 2) live only in a 5-minute transient store and are relayed read-once; transcripts record `[OTP redacted]`. Card numbers and national IDs are redacted before persistence or any LLM call, in both directions.

## Adding a category

Create `packages/category-packs/src/packs/<id>/` exporting a `CategoryPack` (extraction Zod schema with nullable leaves, extraction hints, decode glossary + gotcha checks, savings levers with `validate()` guardrails), register it in `registry.ts`, and add fixtures. Core code does not change.
