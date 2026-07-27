"use client";

import { useMemo, useState } from "react";
import { Money, NeuBadge, NeuCard } from "../ui/neu.js";

/* Bands are deliberately conservative and clearly labelled as an estimate.
   The real number only exists once a bill has been decoded, which is the
   whole premise of the product, so this widget must never look like a quote. */
const categories = [
  { id: "mobile", label: "Mobile", low: 0.1, high: 0.28 },
  { id: "internet", label: "Internet", low: 0.12, high: 0.3 },
  { id: "electricity", label: "Electricity", low: 0.05, high: 0.15 },
  { id: "insurance", label: "Insurance", low: 0.1, high: 0.25 },
] as const;

const currencies = [
  { code: "GBP", symbol: "£" },
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "ILS", symbol: "₪" },
] as const;

export function SavingsEstimator() {
  const [categoryId, setCategoryId] = useState<string>("mobile");
  const [currency, setCurrency] = useState<string>("GBP");
  const [monthly, setMonthly] = useState<number>(45);

  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? "£";
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  const { yearlyLow, yearlyHigh } = useMemo(() => {
    const safeMonthly = Number.isFinite(monthly) && monthly > 0 ? monthly : 0;
    return {
      yearlyLow: Math.round(safeMonthly * 12 * category.low),
      yearlyHigh: Math.round(safeMonthly * 12 * category.high),
    };
  }, [monthly, category]);

  return (
    <NeuCard className="mx-auto max-w-3xl p-7 sm:p-9">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-dim">
            Bill type
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={active}
                  className={`rounded-pill px-4 py-2 text-sm font-medium neu-press ${
                    active
                      ? "bg-brand text-white neu-raised-sm"
                      : "bg-card text-muted neu-inset hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="fx-monthly"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-dim"
          >
            What you pay each month
          </label>
          <div className="flex items-center gap-2 rounded-button bg-card px-4 py-3 neu-inset">
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="cursor-pointer bg-transparent pr-1 font-mono text-base text-muted"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol}
                </option>
              ))}
            </select>
            <input
              id="fx-monthly"
              type="number"
              inputMode="decimal"
              min={0}
              max={100000}
              value={Number.isFinite(monthly) ? monthly : ""}
              onChange={(e) => setMonthly(Number.parseFloat(e.target.value))}
              className="w-full bg-transparent font-mono text-lg text-ink"
            />
          </div>
        </div>
      </div>

      <div className="mt-7 rounded-card bg-card p-6 neu-inset-deep">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">
          Possible yearly reduction
        </p>
        <p className="mt-2 text-3xl font-bold text-savings sm:text-4xl">
          <Money>
            {symbol}
            {yearlyLow.toLocaleString()}
          </Money>{" "}
          <span className="text-muted">to</span>{" "}
          <Money>
            {symbol}
            {yearlyHigh.toLocaleString()}
          </Money>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is a range drawn from published loyalty penalty research, not a quote and not a
          promise. Fixplo only shows you a real figure once it has read your actual bill, and it
          will tell you plainly when there is nothing worth negotiating.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <NeuBadge tone="brand">Estimate only</NeuBadge>
        <NeuBadge tone="neutral">Your bill decides the real number</NeuBadge>
      </div>
    </NeuCard>
  );
}
