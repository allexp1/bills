# Provider WhatsApp directory

Curated official WhatsApp customer-service numbers, keyed by ISO country code
(`ES.json`, `PT.json`, …). Used by `lookupProviderWa()` to render wa.me deep
links with a preloaded message in savings next-steps.

## Verification policy — non-negotiable

**A number ships only if it is confirmed on the provider's own web domain**
(official help page, official community/KB subdomain, or the provider's own
press release). Every entry records that URL in `source`. Third-party
listicles and comparison sites are never sufficient — fake "provider
WhatsApp" numbers are a known fraud vector (CFE in Mexico publishes explicit
warnings about them). A wrong number points customers at a stranger or a
scammer; an empty market beats a wrong entry.

When editing: re-verify the `source` URL still shows the number. If a
provider moves to widget-only chat (no stable public number), remove the
entry — see o2 Germany below.

## Checked and deliberately excluded (as of 2026-07)

- **FR — all majors** (Orange, SFR, Bouygues, Free, EDF, Engie,
  TotalEnergies): no public WhatsApp support numbers. French providers use
  their own web chat, Messenger, or expose WhatsApp only via logged-in
  click-to-chat widgets / accessibility channels with no stable public number.
- **DE — o2**: WhatsApp service discontinued (o2online.de/kontakt); the old
  number must not be shipped. **1&1, E.ON, Vattenfall DE, EnBW**: no WhatsApp.
- **ES — Repsol**: WhatsApp mentioned in legal terms but no number published
  on repsol.es.
- **PT — MEO, NOS, DIGI PT, Galp**: no WhatsApp support (confirmed on their
  official forums/contact pages). **Endesa PT**: WhatsApp referenced but the
  number could not be verified on endesa.pt.
- **GB — EE, Vodafone UK, Sky, Octopus, British Gas, OVO**: no WhatsApp.
  **BT**: number traceable only to a 2020 tweet, not bt.com. **Three**:
  business-only click-to-chat, no public number. **O2 UK**: published number
  serves the accessibility ("Access for You") team only — not general support.
- **BR — Light**: official page was unreachable during verification, digits
  unconfirmed.
- **MX — Telcel, Telmex, Totalplay, Megacable**: numbers not published (or
  ambiguous) on official domains; access is in-app/QR only. **CFE**: no
  WhatsApp at all — CFE itself warns circulating "CFE WhatsApp" numbers are
  fraudulent.
- **US — everyone**: US providers don't use WhatsApp for support. They use
  web/in-app chat (chatbot-first), a few SMS short codes (Xfinity 266278,
  AT&T Prepaid 75421), and Apple Messages for Business (T-Mobile). Supporting
  US bills means a different channel type (sms:/web-chat links), not entries
  in this directory.
