"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "./icons.js";

/** Pipeline stages streamed by /api/upload, with display copy and target %. */
const STAGES = [
  { key: "uploading", label: "Uploading your bill", pct: 5 },
  /* Only appears when more than one file was dropped, because that is the only
     time there is anything to sort. */
  { key: "splitting", label: "Checking whether this is one bill or several", pct: 12 },
  { key: "extracting", label: "Reading the bill with AI vision", pct: 32 },
  { key: "market", label: "Researching how this utility works in your country", pct: 46 },
  { key: "researching", label: "Scanning the market for better offers", pct: 62 },
  { key: "decoding", label: "Explaining charges & hunting savings", pct: 84 },
  { key: "guardrails", label: "Verifying every number against your bill", pct: 92 },
  { key: "finalizing", label: "Preparing your summary", pct: 97 },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

/**
 * Best supported match for the browser's language; explanations default to it.
 *
 * Only safe to call after mount. This is a client component but Next still
 * renders it on the server, where navigator does not exist and this returns
 * "en". A Hebrew browser then rendered "he" on hydration, the two trees
 * disagreed, and React threw #418 and discarded the server HTML. Use the
 * useBrowserLocale hook below in render; call this directly only in handlers,
 * which never run during hydration.
 */
function browserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.slice(0, 2).toLowerCase();
  return ["en", "es", "fr", "pt", "de", "he", "ru", "zh"].includes(lang) ? lang : "en";
}

/**
 * The browser's language, but only from the second render onwards.
 *
 * The first client render has to produce exactly what the server produced, so
 * it starts at "en" and the effect corrects it immediately afterwards. That is
 * the whole fix for the hydration error: the value still ends up right, it just
 * stops being right one render too early.
 */
function useBrowserLocale(): string {
  const [locale, setLocale] = useState("en");
  useEffect(() => setLocale(browserLocale()), []);
  return locale;
}

/** "1:24" rather than "84s": a wait long enough to worry about reads in minutes. */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What the server sends back when this bill has already been decoded for this
 * person. Carries a link to the ORIGINAL rather than a new analysis.
 */
interface DuplicateResult {
  summaryUrl: string;
  matchedOn: "file" | "bill";
  originalDecodedAt: string;
  providerName: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

/** Sent when the drop turned out to hold more than one bill. */
interface MultiResult {
  billCount: number;
  bills: Array<{ index: number; summaryUrl: string; duplicate?: true } & Partial<DuplicateResult>>;
  failures: Array<{ index: number; error: string; detail: string }>;
}

/** Shared bill-upload form: public homepage (no secret) and /try (secret). */
export function UploadForm({ endpoint, withSecret }: { endpoint: string; withSecret?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [multi, setMulti] = useState<MultiResult | null>(null);
  /* "bill 2 of 3", so a three-minute wait reads as progress rather than a
     stalled bar. Null for the ordinary single-bill upload. */
  const [billOf, setBillOf] = useState<{ bill: number; of: number } | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);
  const [overloaded, setOverloaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [translate, setTranslate] = useState(false);
  const [stage, setStage] = useState<StageKey | null>(null);
  const [pct, setPct] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const formEl = useRef<HTMLFormElement>(null);
  /* A ref rather than the billOf state, because goToStage runs in the same tick
     as the line that discovers the bill changed, and state would still hold the
     previous bill when the percentage is computed. */
  const billRef = useRef<{ bill: number; of: number } | null>(null);
  const uiLocale = useBrowserLocale();

  /* A visible clock, because the honest answer to "is this stuck?" is usually
     "no, a decode takes minutes". The bar alone cannot say that: it moves
     whether or not anything is happening, so a long real wait and a hang look
     identical. Elapsed seconds distinguish them. */
  useEffect(() => {
    if (startedAt === null) return;
    setElapsed(Math.round((Date.now() - startedAt) / 1000));
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  /**
   * Maps a within-bill percentage onto the whole upload.
   *
   * The STAGES percentages describe one bill. Used raw across several bills
   * they lie in both directions: bill 1 of 2 climbed to 99% and sat there while
   * bill 2 did all its work, so the bar said "almost done" with four minutes to
   * go, and then jumped BACKWARDS to 32% when bill 2 reached extraction.
   *
   * Two bills means bill 1 owns 0 to 50 and bill 2 owns 50 to 100. The bar only
   * moves forward, and 99% means what it says.
   *
   * Splitting and uploading happen once for the whole drop rather than per
   * bill, so they are pinned to the very start instead of being scaled.
   */
  function scale(withinBill: number, key: StageKey): number {
    const at = billRef.current;
    if (!at || at.of <= 1) return withinBill;
    if (key === "uploading" || key === "splitting") return withinBill / at.of;
    return ((at.bill - 1) / at.of) * 100 + withinBill / at.of;
  }

  function goToStage(key: StageKey) {
    const idx = STAGES.findIndex((s) => s.key === key);
    if (idx === -1) return;
    setStage(key);
    const target = scale(STAGES[idx]!.pct, key);
    /* Never let the bar go backwards. A stage arriving out of order, or a bill
       boundary landing a frame early, is not worth showing someone as lost
       progress. */
    setPct((p) => Math.max(p, target));
    // Trickle toward the next stage's target so the bar never looks stuck.
    const rawCeiling = idx + 1 < STAGES.length ? STAGES[idx + 1]!.pct - 2 : 99;
    const ceiling = Math.min(99, scale(rawCeiling, key));
    if (trickle.current) clearInterval(trickle.current);
    trickle.current = setInterval(() => {
      setPct((p) => (p < ceiling ? p + Math.max(0.2, (ceiling - p) * 0.02) : p));
    }, 700);
  }

  function stopTrickle() {
    if (trickle.current) clearInterval(trickle.current);
    trickle.current = null;
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run(false);
  }

  /**
   * `force` is threaded as an argument rather than a hidden field toggled by
   * state, because the re-run is triggered from a button and React would not
   * have rendered the field by the time the request went out.
   */
  async function run(force: boolean) {
    // The file input is display:none (styled dropzone), so native `required`
    // can't focus it to complain — validate here with a visible message.
    if (!fileInput.current?.files?.length) {
      setError("Please add a bill first — a photo or PDF, drag it in or tap the box above.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setDuplicate(null);
    setMulti(null);
    setBillOf(null);
    billRef.current = null;
    setOverloaded(null);
    setStartedAt(Date.now());
    setElapsed(0);
    goToStage("uploading");
    try {
      const body = new FormData(formEl.current!);
      if (force) body.set("force", "on");
      const res = await fetch(endpoint, { method: "POST", body });

      if (!res.headers.get("content-type")?.includes("ndjson")) {
        // Plain JSON path: quota errors, and the /try harness.
        const json = await res.json().catch(() => null);
        finish(json, res.ok);
        return;
      }

      // NDJSON stream: {stage} lines while working, one final result line.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let last: Record<string, unknown> | null = null;
      let sawStage = false;
      /* Bills that finished before the stream ended, kept so a connection that
         dies during a later bill cannot lose them. They were decoded and stored;
         the only thing at risk was the person ever being shown them. */
      const doneSoFar: MultiResult["bills"] = [];
      let totalBills = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line) as Record<string, unknown>;
          if (obj.stage === "billDone") {
            const done = obj.done as { index: number } & Record<string, unknown>;
            if (done && typeof done.index === "number") {
              const outcome = (done.outcome ?? {}) as Record<string, unknown>;
              if (typeof outcome.summaryUrl === "string") {
                doneSoFar.push({ index: done.index, ...outcome } as MultiResult["bills"][number]);
              }
            }
            if (typeof obj.of === "number") totalBills = obj.of;
            continue;
          }
          if (typeof obj.stage === "string") {
            sawStage = true;
            if (typeof obj.of === "number" && obj.of > 1 && typeof obj.bill === "number") {
              /* Ref first, state second. goToStage reads the ref in the same
                 tick to work out which slice of the bar this bill owns, and
                 state would still be on the previous bill. */
              billRef.current = { bill: obj.bill, of: obj.of };
              setBillOf({ bill: obj.bill, of: obj.of });
            }
            goToStage(obj.stage as StageKey);
          } else last = obj;
        }
      }
      if (buffer.trim()) last = JSON.parse(buffer) as Record<string, unknown>;
      if (!last && sawStage) {
        /* The stream died before the final line: a platform function limit, or
           the connection itself. Not a normal error response.

           If any bill had already finished, show those instead of an error. They
           were decoded and saved before the socket went; reporting a failure
           over the top of finished work is the wrong answer and sends the person
           to re-upload something they already have. */
        if (doneSoFar.length > 0) {
          finish(
            {
              billCount: Math.max(totalBills, doneSoFar.length),
              bills: doneSoFar,
              failures: Array.from(
                { length: Math.max(0, Math.max(totalBills, doneSoFar.length) - doneSoFar.length) },
                (_, k) => ({
                  index: doneSoFar.length + k,
                  error: "not_attempted",
                  detail: "the request ran out of time before this one; upload it on its own",
                }),
              ),
            },
            true,
          );
          return;
        }
        finish({ error: "connection_dropped", detail: "the analysis stream was interrupted — wait a minute, then try again; if it repeats, tell us which stage it stopped at" }, false);
        return;
      }
      finish(last, true);
    } catch (err) {
      stopTrickle();
      setStage(null);
      setError(String(err));
      setBusy(false);
    }
  }

  function finish(json: Record<string, unknown> | null, httpOk: boolean) {
    stopTrickle();
    setBillOf(null);

    /* Several bills in one drop. Checked before the summaryUrl branch because
       this payload deliberately does not carry a top-level summaryUrl: there is
       no single bill for it to point at, and inventing one would mean silently
       picking a winner. */
    if (httpOk && json && Array.isArray(json.bills)) {
      setStage(null);
      setPct(100);
      setMulti(json as unknown as MultiResult);
      setBusy(false);
      return;
    }

    if (json?.error === "overloaded") {
      /* Its own state rather than the error string, because this one has an
         action attached: wait, then press the button again. The files are still
         in the input, so a retry costs nothing but a click. */
      setStage(null);
      setPct(0);
      setOverloaded(typeof json.detail === "string" ? json.detail : "The analysis service is busy.");
      setBusy(false);
      return;
    }

    if (!httpOk || !json || typeof json.summaryUrl !== "string") {
      setStage(null);
      setPct(0);
      const parts = [json?.error ?? "something went wrong", json?.detail, json?.hint].filter(Boolean);
      setError(parts.join(" — "));
    } else if (json.duplicate === true) {
      /* Deliberately no window.open here. A new tab is the right reflex when
         something was just produced; for a bill they already had it reads as
         the browser doing something they did not ask for, and it hides the
         explanation of why no new analysis ran. */
      setStage(null);
      setPct(0);
      setDuplicate(json as unknown as DuplicateResult);
    } else {
      setPct(100);
      setStage(null);
      setResult(json.summaryUrl);
      window.open(json.summaryUrl, "_blank");
    }
    setBusy(false);
  }

  /** "12 March 2026" in the reader's own language, from an ISO timestamp. */
  function formatWhen(iso: string): string {
    try {
      return new Intl.DateTimeFormat(uiLocale, { dateStyle: "long" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  }

  const stageIdx = stage ? STAGES.findIndex((s) => s.key === stage) : -1;

  return (
    <form ref={formEl} onSubmit={submit}>
      <label
        className={`dropzone${drag ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (fileInput.current && e.dataTransfer.files.length > 0) {
            fileInput.current.files = e.dataTransfer.files;
            setFileNames(Array.from(e.dataTransfer.files).map((f) => f.name));
            setError(null);
          }
        }}
      >
        <span className="dz-icon">
          <IconUpload size={26} />
        </span>
        <b>Drop your bills here, or tap to choose</b>
        {/* Was "several pages fine", which was true and read as a limit. Several
            bills at once now genuinely works, and saying so is the only way
            anyone finds out. */}
        <div className="dz-hint">
          Photos or PDF · several pages, or several bills at once · max 15 MB
        </div>
        <input
          ref={fileInput}
          type="file"
          name="pages"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => {
            setFileNames(Array.from(e.currentTarget.files ?? []).map((f) => f.name));
            setError(null);
          }}
        />
        {fileNames.length > 0 && (
          <div className="dz-files">
            {fileNames.map((n, i) => (
              <span key={i} className="chip">
                {n}
              </span>
            ))}
          </div>
        )}
      </label>

      <p>
        <label className="consent">
          <input type="checkbox" name="translate" checked={translate} onChange={(e) => setTranslate(e.currentTarget.checked)} />
          <span>
            Translate the bill's own text (line items, printed notes). Off by default — your bill is shown in
            its original language.
          </span>
        </label>
      </p>

      {translate ? (
        <p style={{ margin: "0 0 12px 27px" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Translate into
            <select name="locale" defaultValue={uiLocale} key={uiLocale}>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="pt">Português</option>
              <option value="de">Deutsch</option>
              <option value="he">עברית</option>
              <option value="ru">Русский</option>
              <option value="zh">中文</option>
            </select>
          </label>
        </p>
      ) : (
        // Explanations still need a language — follow the browser silently.
        <input type="hidden" name="locale" value={uiLocale} />
      )}

      <p>
        <label className="consent">
          <input type="checkbox" name="retain" />
          <span>
            Keep my decoded bill data (encrypted — never the images) so my future bills can be compared month to
            month. Unticked, everything is deleted in 7 days. You can delete it all at any time.
          </span>
        </label>
      </p>

      {withSecret && (
        <p>
          <input type="password" name="secret" placeholder="Access secret" required autoComplete="off" style={{ width: "100%" }} />
        </p>
      )}

      <button className="cta" type="submit" disabled={busy} style={{ width: "100%", cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Analyzing…" : "Analyze my bill — free"}
      </button>

      {stage && (
        <div className="progress" aria-live="polite">
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(pct, 99)}%` }} />
          </div>
          <div className="stage">
            <span>
              {billOf ? `Bill ${billOf.bill} of ${billOf.of}: ` : ""}
              {STAGES[stageIdx]?.label}…
            </span>
            <span className="pct">
              {formatElapsed(elapsed)} · {Math.round(Math.min(pct, 99))}%
            </span>
          </div>
          {/* Said once, up front, because the bar cannot say it. Reading every
              line of a bill and searching the live market genuinely takes a few
              minutes per bill, and without being told that, a long wait is
              indistinguishable from a hang. */}
          {elapsed > 25 && (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {billOf && billOf.of > 1
                ? `Still working. Each bill is read in full and checked against the market, which takes a couple of minutes, so ${billOf.of} bills take a while. Leave this open.`
                : "Still working. Reading every line and checking the market takes a couple of minutes. Leave this open."}
            </p>
          )}
          <ol className="stages">
            {STAGES.map((s, i) => (
              <li key={s.key} className={i < stageIdx ? "done" : i === stageIdx ? "active" : ""}>
                <span className="mark">{i < stageIdx ? "✓" : i === stageIdx ? "●" : "○"}</span>
                {s.label}
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <div className="gotcha alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {result && (
        <div className="gotcha info" style={{ marginTop: 14 }}>
          ✅ Ready — <a href={result}>open your bill summary</a>
        </div>
      )}
      {overloaded && (
        <div className="gotcha" style={{ marginTop: 14 }} aria-live="polite">
          <b>Busy, not broken.</b>
          <p style={{ margin: "6px 0 0" }}>{overloaded}</p>
          <p style={{ margin: "10px 0 0" }}>
            <button
              type="button"
              className="cta ghost"
              disabled={busy}
              onClick={() => void run(false)}
              style={{ cursor: busy ? "wait" : "pointer" }}
            >
              Try again
            </button>
          </p>
        </div>
      )}
      {multi && (
        <div className="gotcha info" style={{ marginTop: 14 }} aria-live="polite">
          <b>
            That was {multi.billCount} bills, so I decoded {multi.billCount === multi.bills.length ? "each" : "them"} separately.
          </b>
          <ol style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
            {multi.bills.map((b) => (
              <li key={b.index} style={{ margin: "4px 0" }}>
                <a href={b.summaryUrl} target="_blank" rel="noreferrer">
                  {b.providerName ?? `Bill ${b.index + 1}`}
                  {b.billingPeriodStart && b.billingPeriodEnd
                    ? `, ${b.billingPeriodStart} to ${b.billingPeriodEnd}`
                    : ""}
                </a>
                {b.duplicate ? " — you already had this one" : ""}
              </li>
            ))}
            {multi.failures.map((f) => (
              <li key={`f${f.index}`} style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                {f.error === "overloaded"
                  ? `Bill ${f.index + 1} was not analysed: the service was busy. Upload it again in a minute.`
                  : f.error === "not_attempted"
                    ? `Bill ${f.index + 1} was not analysed: there was not enough time left. Upload it on its own.`
                    : f.error === "unsupported_category"
                      ? `Bill ${f.index + 1} could not be read: we support energy, internet and mobile bills so far`
                      : `Bill ${f.index + 1} could not be read`}
              </li>
            ))}
          </ol>
          {/* Said plainly rather than assumed. The split is a judgement, and if
              it got the grouping wrong the person is the only one who can tell,
              so they are told what it decided. */}
          <p style={{ margin: "10px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            If those were meant to be pages of one bill, upload them again one at a time and I will
            read them as a single document.
          </p>
        </div>
      )}
      {duplicate && (
        <div className="gotcha info" style={{ marginTop: 14 }} aria-live="polite">
          <b>You have already decoded this bill.</b>
          <p style={{ margin: "6px 0 0" }}>
            {duplicate.matchedOn === "file"
              ? "It is the same file you sent before"
              : "It looks like the same bill, sent as a different photo or file"}
            {describeBill(duplicate)}, analysed on {formatWhen(duplicate.originalDecodedAt)}. Nothing has
            been charged and no second copy was created.
          </p>
          <p style={{ margin: "10px 0 0" }}>
            <a href={duplicate.summaryUrl} target="_blank" rel="noreferrer">
              Open the analysis you already have
            </a>
          </p>
          <p style={{ margin: "10px 0 0" }}>
            <button
              type="button"
              className="cta ghost"
              disabled={busy}
              onClick={() => void run(true)}
              style={{ cursor: busy ? "wait" : "pointer" }}
            >
              Analyse it again anyway
            </button>
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Worth doing if this is genuinely a different bill, or if you want it run through the current
            version of the analysis.
          </p>
        </div>
      )}
    </form>
  );
}

/** " from Iberdrola, 1 Jan to 31 Jan" — only the parts the bill actually gave us. */
function describeBill(d: DuplicateResult): string {
  const parts: string[] = [];
  if (d.providerName) parts.push(` from ${d.providerName}`);
  if (d.billingPeriodStart && d.billingPeriodEnd) {
    parts.push(`, covering ${d.billingPeriodStart} to ${d.billingPeriodEnd}`);
  }
  return parts.join("");
}
