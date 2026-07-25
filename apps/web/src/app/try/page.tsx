"use client";

import { UploadForm } from "../upload-form.js";

/** Secret-gated test harness (quota-exempt); the public flow lives at "/". */
export default function TryPage() {
  return (
    <main className="page">
      <section className="card">
        <h1>Test a bill</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Runs the real pipeline: vision extraction → market research → decode → guardrails → summary page.
          Takes up to 2 minutes.
        </p>
        <UploadForm endpoint="/api/dev/process" withSecret />
      </section>
    </main>
  );
}
