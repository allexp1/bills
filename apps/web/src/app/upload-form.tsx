"use client";

import { useRef, useState } from "react";
import { IconUpload } from "./icons.js";

/** Pipeline stages streamed by /api/upload, with display copy and target %. */
const STAGES = [
  { key: "uploading", label: "Uploading your bill", pct: 8 },
  { key: "extracting", label: "Reading the bill with AI vision", pct: 38 },
  { key: "researching", label: "Scanning the market for better offers", pct: 62 },
  { key: "decoding", label: "Explaining charges & hunting savings", pct: 84 },
  { key: "guardrails", label: "Verifying every number against your bill", pct: 92 },
  { key: "finalizing", label: "Preparing your summary", pct: 97 },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

/** Shared bill-upload form: public homepage (no secret) and /try (secret). */
export function UploadForm({ endpoint, withSecret }: { endpoint: string; withSecret?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState<StageKey | null>(null);
  const [pct, setPct] = useState(0);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function goToStage(key: StageKey) {
    const idx = STAGES.findIndex((s) => s.key === key);
    if (idx === -1) return;
    setStage(key);
    setPct(STAGES[idx]!.pct);
    // Trickle toward the next stage's target so the bar never looks stuck.
    const ceiling = idx + 1 < STAGES.length ? STAGES[idx + 1]!.pct - 2 : 99;
    if (trickle.current) clearInterval(trickle.current);
    trickle.current = setInterval(() => {
      setPct((p) => (p < ceiling ? p + Math.max(0.2, (ceiling - p) * 0.02) : p));
    }, 700);
  }

  function stopTrickle() {
    if (trickle.current) clearInterval(trickle.current);
    trickle.current = null;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    goToStage("uploading");
    try {
      const res = await fetch(endpoint, { method: "POST", body: new FormData(e.currentTarget) });

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
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line) as Record<string, unknown>;
          if (typeof obj.stage === "string") goToStage(obj.stage as StageKey);
          else last = obj;
        }
      }
      if (buffer.trim()) last = JSON.parse(buffer) as Record<string, unknown>;
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
    if (!httpOk || !json || typeof json.summaryUrl !== "string") {
      setStage(null);
      setPct(0);
      const parts = [json?.error ?? "something went wrong", json?.detail, json?.hint].filter(Boolean);
      setError(parts.join(" — "));
    } else {
      setPct(100);
      setStage(null);
      setResult(json.summaryUrl);
      window.open(json.summaryUrl, "_blank");
    }
    setBusy(false);
  }

  const stageIdx = stage ? STAGES.findIndex((s) => s.key === stage) : -1;

  return (
    <form onSubmit={submit}>
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
          }
        }}
      >
        <span className="dz-icon">
          <IconUpload size={26} />
        </span>
        <b>Drop your bill here, or tap to choose</b>
        <div className="dz-hint">Photos or PDF · several pages fine · max 15 MB</div>
        <input
          ref={fileInput}
          type="file"
          name="pages"
          multiple
          accept="image/*,application/pdf"
          required
          onChange={(e) => setFileNames(Array.from(e.currentTarget.files ?? []).map((f) => f.name))}
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

      <p style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Language
          <select name="locale" defaultValue="en">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </p>

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
            <span>{STAGES[stageIdx]?.label}…</span>
            <span className="pct">{Math.round(Math.min(pct, 99))}%</span>
          </div>
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
    </form>
  );
}
