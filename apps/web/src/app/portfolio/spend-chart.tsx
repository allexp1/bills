"use client";

import { useId, useState } from "react";
import type { DashboardChart } from "@bills/db/repo/dashboard";

/**
 * Monthly spend, stacked by service.
 *
 * The column height is the whole monthly outflow and the bands are what makes
 * it up, which is the one question a bill dashboard exists to answer: what do I
 * pay each month, and what is it going on.
 *
 * Form choices, and why:
 *
 * Columns rather than a line, because billing periods are discrete months and a
 * line implies a value between them.
 *
 * A gap stays a gap. Carrying the previous month forward would draw a bill that
 * was never sent.
 *
 * One series gets a single hue and no legend: the heading already names it. Two
 * or more get the categorical order below plus a legend, so identity is never
 * carried by colour alone. Past six services the tail folds into "Other" rather
 * than inventing hues, which under colour blindness are indistinguishable from
 * the ones already on screen.
 */

/* Validated categorical order, dark and light steps of the same five hues.
   Adjacent-pair separation under simulated colour blindness clears the ≥8
   target in both modes (worst 8.4). On the light surface these fall below 3:1
   contrast, which is why the legend and the tooltip carry text: colour is never
   the only channel. Savings green is deliberately absent, being a reserved
   status colour. */
const SERIES = [
  { dark: "#9085e9", light: "#4a3aa7" },
  { dark: "#d95926", light: "#eb6834" },
  { dark: "#199e70", light: "#1baf7a" },
  { dark: "#c98500", light: "#eda100" },
  { dark: "#d55181", light: "#e87ba4" },
  { dark: "#8a86a0", light: "#6b6880" },
] as const;
const MAX_SERIES = SERIES.length - 1;

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(Number(y), Number(m) - 1, 1));
  } catch {
    return month;
  }
}

function money(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(
      minor / 100,
    );
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

export function SpendChart({
  chart,
  locale = "en",
  typicalMinor = null,
}: {
  chart: DashboardChart;
  locale?: string;
  /** Drawn as a reference line. Turns "415 is big" into "415 is big for you". */
  typicalMinor?: number | null;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  /* Biggest first, then the tail folded together, so the same service keeps the
     same colour whichever months are on screen. Colour follows the entity, never
     its rank within one view. */
  const ranked = [...chart.series].sort(
    (a, b) => sum(b.values) - sum(a.values),
  );
  const shown = ranked.slice(0, MAX_SERIES);
  const tail = ranked.slice(MAX_SERIES);
  const series =
    tail.length > 0
      ? [
          ...shown,
          {
            key: "__other",
            label: `${tail.length} more`,
            values: chart.months.map((_, i) => {
              const vals = tail.map((s) => s.values[i]).filter((v): v is number => v !== null);
              return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
            }),
          },
        ]
      : shown;

  const totals = chart.months.map((_, i) =>
    series.reduce((t, s) => t + (s.values[i] ?? 0), 0),
  );
  const peak = Math.max(...totals, 1);
  /* A round ceiling above the peak, so gridlines land on readable numbers. */
  const step = niceStep(peak / 4);
  const ceiling = Math.ceil(peak / step) * step;
  const gridlines = Array.from({ length: 5 }, (_, i) => i * (ceiling / 4));

  const W = 720;
  const H = 280;
  const padL = 64;
  const padR = 16;
  const padT = 26;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / chart.months.length;
  const bw = Math.min(64, slot * 0.62);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Monthly spend in ${chart.currency} across ${chart.series.length} ${
          chart.series.length === 1 ? "service" : "services"
        }, ${chart.months.length} months.`}
        onMouseLeave={() => setHover(null)}
      >
        {gridlines.map((g) => {
          const y = padT + plotH - (g / ceiling) * plotH;
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--fx-border)" strokeWidth={1} />
              <text
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--fx-text-dim)"
                fontFamily="var(--font-geist-mono)"
              >
                {Math.round(g / 100)}
              </text>
            </g>
          );
        })}

        {chart.months.map((month, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={month}>
              {series.map((s, k) => {
                const v = s.values[i] ?? null;
                if (v === null || v <= 0) return null;
                const h = (v / ceiling) * plotH;
                const y = padT + plotH - (acc / ceiling) * plotH - h;
                acc += v;
                const isTop = series.slice(k + 1).every((rest) => (rest.values[i] ?? 0) <= 0);
                const fill = `var(--fx-series-${k})`;
                /* 2px surface gap between segments so the bands stay countable,
                   and a 4px rounded cap on the topmost one only, because the
                   stack is anchored to the baseline. */
                const hh = Math.max(2, h - 2);
                const text = `${money(v, chart.currency, locale)} · ${s.label} · ${monthLabel(month, locale)}`;
                return isTop ? (
                  <path
                    key={s.key}
                    d={`M${x},${y + 5} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 v${hh - 4} h${-bw} z`}
                    fill={fill}
                    onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, text })}
                  />
                ) : (
                  <rect
                    key={s.key}
                    x={x}
                    y={y + 1}
                    width={bw}
                    height={hh}
                    fill={fill}
                    onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, text })}
                  />
                );
              })}
              {totals[i]! > 0 && (
                <text
                  x={x + bw / 2}
                  y={padT + plotH - (totals[i]! / ceiling) * plotH - 9}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={700}
                  fill="var(--fx-text-primary)"
                  fontFamily="var(--font-geist-mono)"
                >
                  {money(totals[i]!, chart.currency, locale)}
                </text>
              )}
              <text
                x={x + bw / 2}
                y={H - padB + 21}
                textAnchor="middle"
                fontSize={12}
                fill="var(--fx-text-muted)"
              >
                {monthLabel(month, locale)}
              </text>
            </g>
          );
        })}
        {/* The typical month, as a reference. Without it a reader has to hold
            five columns in their head to know whether one is unusual. Anchored
            left, because the right is where the last column's own label sits. */}
        {typicalMinor !== null && typicalMinor > 0 && typicalMinor < ceiling && (
          <g>
            <line
              x1={padL}
              y1={padT + plotH - (typicalMinor / ceiling) * plotH}
              x2={W - padR}
              y2={padT + plotH - (typicalMinor / ceiling) * plotH}
              stroke="var(--color-brand-soft)"
              strokeWidth={2}
              strokeDasharray="5 5"
              opacity={0.85}
            />
            <text
              x={padL + 6}
              y={padT + plotH - (typicalMinor / ceiling) * plotH - 8}
              fontSize={11}
              fontWeight={700}
              fill="var(--color-brand-soft)"
            >
              typically {money(typicalMinor, chart.currency, locale)}
            </text>
          </g>
        )}
        <style>{seriesVars(uid)}</style>
      </svg>

      {/* A legend for two or more; one series is named by the heading. */}
      {series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
          {series.map((s, k) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{ background: `var(--fx-series-${k})` }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {hover && (
        <span
          role="status"
          className="pointer-events-none fixed z-30 whitespace-nowrap rounded-button bg-card px-3 py-2 text-sm text-ink neu-raised-sm"
          style={{ left: Math.min(hover.x + 14, 1200), top: hover.y - 12 }}
        >
          {hover.text}
        </span>
      )}
    </div>
  );
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((t, v) => t + (v ?? 0), 0);
}

/** 1, 2, 5 × a power of ten, so gridlines land on numbers people read easily. */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * The series hues as CSS variables, both modes, emitted inline.
 *
 * Declared here rather than in the stylesheet because they belong to this chart
 * and nothing else reads them, and because the dark steps are a selected set
 * for the dark surface rather than an automatic flip of the light ones.
 */
function seriesVars(uid: string): string {
  const dark = SERIES.map((s, i) => `--fx-series-${i}:${s.dark};`).join("");
  const light = SERIES.map((s, i) => `--fx-series-${i}:${s.light};`).join("");
  return `svg{${dark}}[data-theme="light"] svg{${light}}/*${uid}*/`;
}
