"use client";

import { useState } from "react";

/** Shared bill-upload form: public homepage (no secret) and /try (secret). */
export function UploadForm({ endpoint, withSecret }: { endpoint: string; withSecret?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST", body: new FormData(e.currentTarget) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.summaryUrl) {
        const parts = [json?.error ?? `HTTP ${res.status}`, json?.detail, json?.hint].filter(Boolean);
        setError(parts.join(" — "));
      } else {
        setResult(json.summaryUrl);
        window.open(json.summaryUrl, "_blank");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p>
        <input type="file" name="pages" multiple accept="image/*,application/pdf" required />
      </p>
      <p>
        <label>
          🌐{" "}
          <select name="locale" defaultValue="en">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </p>
      {withSecret && (
        <p>
          <input type="password" name="secret" placeholder="Access secret" required autoComplete="off" />
        </p>
      )}
      <button className="cta" type="submit" disabled={busy} style={{ width: "100%", border: 0, cursor: "pointer" }}>
        {busy ? "Analyzing… up to 2 minutes ⏳" : "Analyze my bill"}
      </button>
      {error && (
        <div className="gotcha alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      {result && (
        <div className="gotcha info" style={{ marginTop: 12 }}>
          ✅ <a href={result}>Open your bill summary</a>
        </div>
      )}
    </form>
  );
}
