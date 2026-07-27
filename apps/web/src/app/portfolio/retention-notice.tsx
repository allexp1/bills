"use client";

import { useState, useTransition } from "react";
import { NeuButton, NeuCard } from "../../components/ui/neu.js";

/**
 * Having an account does not by itself mean we keep anyone's bills.
 *
 * The decoded summary is deleted after seven days unless the customer opts in,
 * which is what the privacy section on the landing page promises, so the
 * portfolio has to ask rather than assume. Until they say yes, this page shows
 * only bills still inside their window, and says so plainly instead of looking
 * mysteriously empty next month.
 */
export function RetentionNotice({ consented }: { consented: boolean }) {
  const [isOn, setIsOn] = useState(consented);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consented: next }),
      });
      if (!res.ok) {
        setError("That did not save. Try again in a moment.");
        return;
      }
      setIsOn(next);
    });
  }

  if (isOn) {
    return (
      <NeuCard className="mt-6" elevation="inset">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm leading-relaxed text-muted">
            Your decoded bills are kept, encrypted, so you can compare month to month. You can stop
            this and erase everything whenever you like.
          </p>
          <NeuButton tone="quiet" size="sm" onClick={() => update(false)} disabled={pending}>
            {pending ? "Saving" : "Stop keeping them"}
          </NeuButton>
        </div>
        {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
      </NeuCard>
    );
  }

  return (
    <NeuCard className="mt-6">
      <h2 className="text-base font-bold text-ink">Keep your bills so you can compare them</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Right now each decoded bill is deleted after seven days, and the images are discarded as
        soon as they are read. Turn this on and the decoded summaries are kept encrypted instead, so
        next month&rsquo;s bill can be compared against this one and a quiet price rise shows up.
        Nothing else changes, and you can erase all of it at any time.
      </p>
      <div className="mt-5">
        <NeuButton onClick={() => update(true)} disabled={pending}>
          {pending ? "Saving" : "Keep my decoded bills"}
        </NeuButton>
      </div>
      {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}
    </NeuCard>
  );
}
