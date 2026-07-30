"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DashboardBill } from "@bills/db/repo/dashboard";
import { NeuButton } from "../../components/ui/neu.js";

/**
 * The months inside a service card, each one deletable.
 *
 * Collapsed by default. The card already answers what someone pays and whether
 * it moved; the individual months are for when they want to open one or get rid
 * of one, and putting five rows under every service by default would undo the
 * grouping the card exists to provide.
 *
 * Delete confirms in place rather than in a dialog. The row being deleted stays
 * on screen and visible next to the confirmation, so the thing about to go is the
 * thing you are looking at. A modal moves the decision away from the object.
 */
export function BillList({
  bills,
  currency,
  locale = "en",
  startOpen = false,
}: {
  bills: DashboardBill[];
  currency: string | null;
  locale?: string;
  /** True on the provider page, where this list is the point of the screen. */
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /* Rows already gone, hidden immediately. The server component re-renders on
     refresh, but leaving a deleted row on screen until then reads as a failure. */
  const [removed, setRemoved] = useState<string[]>([]);

  function money(minor: number | null): string {
    if (minor === null) return "n/a";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency ?? "USD",
        maximumFractionDigits: 2,
      }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(2)} ${currency ?? ""}`.trim();
    }
  }

  function remove(invoiceId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/bill/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(
          json?.detail ??
            "That did not delete. Nothing has changed. Try again in a moment.",
        );
        return;
      }
      setRemoved((r) => [...r, invoiceId]);
      setConfirming(null);
      /* Re-read the server component so the totals, the chart and the typical
         month all reflect the deletion. Recomputing them here would mean two
         implementations of the same arithmetic. */
      router.refresh();
    });
  }

  const visible = bills.filter((b) => !removed.includes(b.invoiceId));

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-muted hover:text-ink"
        >
          {visible.length === 1 ? "Show the bill" : `Show all ${visible.length} bills`} ▾
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <ul className="space-y-1.5">
        {visible.map((b) => (
          <li key={b.invoiceId} className="rounded-button bg-card px-4 py-2.5 neu-inset">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1 text-sm text-muted">
                {b.periodStart && b.periodEnd ? `${b.periodStart} to ${b.periodEnd}` : "Period not on the bill"}
              </span>
              <span className="font-mono text-sm font-semibold text-ink">{money(b.totalMinor)}</span>
              <a
                href={`/portfolio/open/${b.invoiceId}`}
                className="text-sm font-medium text-brand-soft hover:text-brand"
              >
                Open
              </a>
              {confirming === b.invoiceId ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfirming(b.invoiceId);
                  }}
                  className="text-sm font-medium text-muted hover:text-alert"
                >
                  Delete
                </button>
              )}
            </div>

            {confirming === b.invoiceId && (
              <div className="mt-3 border-t border-hairline pt-3">
                <p className="text-sm font-bold text-ink">Delete this bill permanently?</p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                  The explanation, the charge breakdown and the savings found are erased, and every
                  share link for it stops working. It cannot be recovered; getting it back would mean
                  uploading the bill again and paying for the analysis again. Your other bills and
                  your month to month comparison of them are untouched.
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <NeuButton
                    tone="danger"
                    size="sm"
                    onClick={() => remove(b.invoiceId)}
                    disabled={pending}
                  >
                    {pending ? "Deleting" : "Delete it"}
                  </NeuButton>
                  <NeuButton
                    tone="quiet"
                    size="sm"
                    onClick={() => setConfirming(null)}
                    disabled={pending}
                  >
                    Keep it
                  </NeuButton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-sm text-alert">{error}</p> : null}

      {!startOpen && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirming(null);
          }}
          className="mt-3 text-sm font-medium text-muted hover:text-ink"
        >
          Hide ▴
        </button>
      )}
    </div>
  );
}
