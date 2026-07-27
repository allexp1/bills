import { Money, NeuBadge, NeuCard } from "../ui/neu.js";

/* Illustration of the live call screen. Labelled as such on purpose: every
   number Fixplo shows a customer comes from their own decoded bill, so a
   marketing mock must never be mistaken for a real result. */
const transcript = [
  {
    speaker: "Fixplo",
    role: "ai" as const,
    line: "Good morning. This is an automated assistant calling on behalf of the account holder, with their authorisation. This call is being recorded.",
  },
  {
    speaker: "Provider",
    role: "them" as const,
    line: "Understood. How can I help today?",
  },
  {
    speaker: "Fixplo",
    role: "ai" as const,
    line: "The account has been out of contract since March and is paying the standard rate. Your published rate for the same speed is lower. We would like the account moved onto it.",
  },
  {
    speaker: "Provider",
    role: "them" as const,
    line: "I can offer a twelve month term at a reduced monthly rate.",
  },
  {
    speaker: "Fixplo",
    role: "ai" as const,
    line: "That is inside the limit the account holder set. Please confirm there is no setup fee and no mid contract price rise.",
  },
];

export function CallShowcase() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <NeuCard className="p-0">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-alert opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-alert" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">
              Live voice negotiation
            </span>
          </div>
          <NeuBadge tone="savings">AI disclosed</NeuBadge>
        </div>

        <ul className="space-y-3 px-6 py-6">
          {transcript.map((turn, i) => (
            <li
              key={i}
              className={`rounded-card px-4 py-3 ${
                turn.role === "ai" ? "bg-card neu-raised-sm" : "bg-card neu-inset"
              }`}
            >
              <p
                className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                  turn.role === "ai" ? "text-brand-soft" : "text-dim"
                }`}
              >
                {turn.speaker}
              </p>
              <p className="text-sm leading-relaxed text-muted">{turn.line}</p>
            </li>
          ))}
        </ul>
      </NeuCard>

      <div className="flex flex-col gap-6">
        <NeuCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Deal state</p>
          <dl className="mt-5 space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">Paying now</dt>
              <dd className="text-lg text-muted line-through">
                <Money>£62.00</Money>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">Walk away above</dt>
              <dd className="text-lg text-ink">
                <Money>£45.00</Money>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 rounded-button bg-card px-4 py-3 neu-inset">
              <dt className="text-sm font-semibold text-ink">On the table</dt>
              <dd className="text-2xl font-bold text-savings">
                <Money>£38.00</Money>
              </dd>
            </div>
          </dl>
        </NeuCard>

        <NeuCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
            You stay in control
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            <li>Accept the offer on the table</li>
            <li>Take the call over on your own phone</li>
            <li>End the call at any moment</li>
          </ul>
        </NeuCard>
      </div>
    </div>
  );
}
