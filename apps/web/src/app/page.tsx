import { UploadForm } from "./upload-form.js";

export const metadata = {
  title: "Bills — understand your bill, pay less",
  description: "Upload any recurring bill. Get a plain-language explanation, real numbers, and concrete ways to pay less.",
};

export default function Home() {
  return (
    <main className="page">
      <section className="card hero" style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 6 }}>Understand your bill.<br />Pay less.</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Upload a photo or PDF of any energy, internet or mobile bill. Our AI reads it,
          explains every charge in plain language, researches current market offers, and
          shows exactly where your money can come back — with real numbers only.
        </p>
        <UploadForm endpoint="/api/upload" />
      </section>

      <h2>How it works</h2>
      <section className="card">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>📄 <b>Upload</b> — bill photo(s) or PDF, any of 5 languages.</li>
          <li>🔎 <b>Decode</b> — every line item explained; estimated readings, expiring promos and price jumps called out.</li>
          <li>🌍 <b>Research</b> — the AI searches current offers from other providers in your country and compares them to what you pay.</li>
          <li>💰 <b>Save</b> — concrete steps with verified amounts. Every number is checked in code against your bill's data; nothing is invented.</li>
          <li>📊 <b>Track</b> — upload each month's bill and we show exactly what changed: total, new charges, price creep, your usage.</li>
        </ol>
      </section>

      <h2>Privacy</h2>
      <section className="card">
        <p style={{ margin: 0 }}>
          Your bill is sensitive. We never store your bill images or PDFs — they're analyzed and immediately
          discarded; only the structured summary is kept, encrypted at rest. Your summary link is private,
          expires in 7 days, and nothing is indexed or shared.
        </p>
      </section>

      <p className="footer">Soon on WhatsApp: send your bill in a chat and get the same analysis back.</p>
    </main>
  );
}
