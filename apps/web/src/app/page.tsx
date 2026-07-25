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
        </ol>
      </section>

      <h2>Privacy</h2>
      <section className="card">
        <p style={{ margin: 0 }}>
          Your bill is sensitive. Extracted data is encrypted at rest, your summary link is private and expires
          in 7 days, nothing is indexed or shared, and raw bill images are deleted automatically after 90 days.
        </p>
      </section>

      <p className="footer">Soon on WhatsApp: send your bill in a chat and get the same analysis back.</p>
    </main>
  );
}
