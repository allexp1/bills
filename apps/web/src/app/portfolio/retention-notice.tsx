"use client";

import { useState, useTransition } from "react";
import { NeuButton, NeuCard } from "../../components/ui/neu.js";

/**
 * Retention, and the two confirmations around changing it.
 *
 * Having an account does not by itself mean we keep anyone's bills. The decoded
 * summary is deleted after seven days unless the customer opts in, which is what
 * the privacy section on the landing page promises, so the portfolio asks rather
 * than assumes.
 *
 * Both directions now confirm, because both are consequential and neither is
 * obviously so from a single button:
 *
 * Turning it OFF destroys the decoded detail of every bill. It used to happen on
 * one click of a small quiet button, with no statement of what would go and no
 * way back. That is the worst shape a destructive control can have.
 *
 * Turning it ON changes what is stored about somebody indefinitely. That
 * deserves a sentence saying exactly what is kept and what is not, rather than
 * being a one-click yes.
 *
 * The copy describes what the code does, which is narrower than "erase
 * everything whenever you like" claimed. Switching off clears the consent flag;
 * the purge cron then deletes the decode and extraction rows for bills whose
 * share link has expired. Bills inside their window survive until it lapses, and
 * the invoice record itself, meaning dates and totals, is never deleted by this.
 * Saying otherwise would be a promise the product does not keep.
 */
export function RetentionNotice({ consented, billCount = 0 }: { consented: boolean; billCount?: number }) {
  const [isOn, setIsOn] = useState(consented);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* null is the resting state. "explain" is the first warning, "confirm" the
     second, which restates the part that cannot be undone. */
  const [step, setStep] = useState<null | "explain" | "confirm">(null);
  const [askingOn, setAskingOn] = useState(false);

  function update(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consented: next }),
      });
      if (!res.ok) {
        setError("That did not save. Nothing has changed. Try again in a moment.");
        return;
      }
      setIsOn(next);
      setStep(null);
      setAskingOn(false);
    });
  }

  const bills =
    billCount === 0 ? "your decoded bills" : billCount === 1 ? "your 1 decoded bill" : `all ${billCount} of your decoded bills`;

  if (isOn) {
    /* Second warning. Short, and only about the part that is irreversible. */
    if (step === "confirm") {
      return (
        <NeuCard className="mt-6">
          <h2 className="text-base font-bold text-alert">This cannot be undone</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            The decoded detail cannot be rebuilt. Getting it back would mean uploading each bill again
            and paying for the analysis again. Your month to month comparisons go with it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <NeuButton tone="danger" onClick={() => update(false)} disabled={pending}>
              {pending ? "Stopping" : "Stop keeping them and delete"}
            </NeuButton>
            <NeuButton tone="quiet" onClick={() => setStep(null)} disabled={pending}>
              Keep them after all
            </NeuButton>
          </div>
          {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
        </NeuCard>
      );
    }

    /* First warning: what actually happens, in the order it happens. */
    if (step === "explain") {
      return (
        <NeuCard className="mt-6">
          <h2 className="text-base font-bold text-ink">Stop keeping your bills?</h2>
          <ul className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed text-muted">
            <li>
              <b className="text-ink">What stops:</b> nothing new is kept past seven days.
            </li>
            <li>
              <b className="text-ink">What is deleted:</b> the decoded detail of {bills}, each one once
              its share link expires. Bills whose link is still live go when it lapses.
            </li>
            <li>
              <b className="text-ink">What stays:</b> the bill record itself, meaning the provider,
              dates and total, plus anonymous statistics that point back to nobody. This page keeps
              working; the explanations behind it do not.
            </li>
            <li>
              <b className="text-ink">What you lose:</b> comparing next month against this one, so a
              quiet price rise stops being visible.
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <NeuButton tone="danger" onClick={() => setStep("confirm")} disabled={pending}>
              Continue
            </NeuButton>
            <NeuButton tone="quiet" onClick={() => setStep(null)} disabled={pending}>
              Cancel
            </NeuButton>
          </div>
        </NeuCard>
      );
    }

    return (
      <NeuCard className="mt-6" elevation="inset">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm leading-relaxed text-muted">
            Your decoded bills are kept, encrypted, so you can compare month to month. The images
            themselves were never stored. You can stop this whenever you like.
          </p>
          <NeuButton tone="quiet" size="sm" onClick={() => setStep("explain")}>
            Stop keeping them
          </NeuButton>
        </div>
        {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
      </NeuCard>
    );
  }

  /* The opposite direction. One confirmation rather than two: it is reversible
     and it destroys nothing, but it does change what is stored about somebody
     indefinitely, which should not be a single unlabelled click. */
  if (askingOn) {
    return (
      <NeuCard className="mt-6">
        <h2 className="text-base font-bold text-ink">Keep your decoded bills?</h2>
        <ul className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed text-muted">
          <li>
            <b className="text-ink">What is kept:</b> the decoded summary of each bill, encrypted.
            Provider, charges, line items and the savings found.
          </li>
          <li>
            <b className="text-ink">What is never kept:</b> the photo or PDF you uploaded. It is read
            and discarded, before and after this setting.
          </li>
          <li>
            <b className="text-ink">For how long:</b> until you turn this off. There is no expiry
            while it is on.
          </li>
          <li>
            <b className="text-ink">What it buys you:</b> next month&rsquo;s bill compared against
            this one, so a rise you did not agree to shows up.
          </li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <NeuButton onClick={() => update(true)} disabled={pending}>
            {pending ? "Saving" : "Yes, keep them"}
          </NeuButton>
          <NeuButton tone="quiet" onClick={() => setAskingOn(false)} disabled={pending}>
            Cancel
          </NeuButton>
        </div>
        {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
      </NeuCard>
    );
  }

  return (
    <NeuCard className="mt-6">
      <h2 className="text-base font-bold text-ink">Keep your bills so you can compare them</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Right now each decoded bill is deleted after seven days, and the images are discarded as soon
        as they are read. Turn this on and the decoded summaries are kept encrypted instead, so next
        month&rsquo;s bill can be compared against this one and a quiet price rise shows up.
      </p>
      <div className="mt-5">
        <NeuButton onClick={() => setAskingOn(true)}>Keep my decoded bills</NeuButton>
      </div>
      {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
    </NeuCard>
  );
}
