"use client";

import { useState } from "react";

/**
 * Pre-WABA test harness: upload a bill, run the real pipeline, open the real
 * summary page. Enabled only when DEV_TRY_SECRET is configured server-side.
 */
export default function TryPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dev/process", { method: "POST", body: new FormData(e.currentTarget) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.summaryUrl) {
        setError(json?.error ?? `HTTP ${res.status}`);
      } else {
        setResult(JSON.stringify(json, null, 2));
        window.open(json.summaryUrl, "_blank");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Test a bill</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Runs the real pipeline: vision extraction → decode → guardrails → summary page. Takes 30–90 seconds.
        </p>
        <form onSubmit={submit}>
          <p>
            <label>
              Bill pages (photos or one PDF)
              <br />
              <input type="file" name="pages" multiple accept="image/*,application/pdf" required />
            </label>
          </p>
          <p>
            <label>
              Language{" "}
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
            <label>
              Access secret
              <br />
              <input type="password" name="secret" required autoComplete="off" />
            </label>
          </p>
          <button className="cta" type="submit" disabled={busy} style={{ width: "100%", border: 0, cursor: "pointer" }}>
            {busy ? "Analyzing… (up to 90s)" : "Analyze bill"}
          </button>
        </form>
        {error && <div className="gotcha alert" style={{ marginTop: 12 }}>{error}</div>}
        {result && (
          <pre style={{ marginTop: 12, fontSize: 12, overflowX: "auto", background: "var(--accent-soft)", padding: 10, borderRadius: 8 }}>
            {result}
          </pre>
        )}
      </section>
    </main>
  );
}
