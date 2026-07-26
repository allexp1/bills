import { UploadForm } from "./upload-form.js";
import { IconChart, IconFileUp, IconGlobe, IconLanguages, IconSearch, IconSpark, IconTrendDown } from "./icons.js";

export const metadata = {
  title: "SaveBills — understand every bill, pay less",
  description:
    "Upload any recurring bill. Get a plain-language explanation, real numbers, a ready-to-send negotiation pitch, and concrete ways to pay less.",
};

export default function Home() {
  return (
    <main className="page">
      <header className="brandbar">
        <span className="brandmark">
          <IconSpark size={16} />
        </span>
        <span className="brandname">SaveBills</span>
      </header>

      <h1 className="display">
        Understand every bill.
        <br />
        <span className="grad">Pay less.</span>
      </h1>
      <p className="lede">
        Drop in a photo or PDF of any energy, internet or mobile bill. AI reads it, explains every charge in
        plain language, researches the market, and hands you a ready-to-send pitch for a better deal — with
        real numbers only, verified against your own bill.
      </p>

      <section className="card">
        <UploadForm endpoint="/api/upload" />
      </section>

      <h2>How it works</h2>
      <div className="steps">
        <div className="step">
          <span className="tile t-indigo">
            <IconFileUp />
          </span>
          <b>Upload</b>
          <p>Bill photos or PDF — several pages fine, five languages supported.</p>
        </div>
        <div className="step">
          <span className="tile t-blue">
            <IconSearch />
          </span>
          <b>Decode</b>
          <p>Every line item explained; estimated readings, expiring promos and price jumps called out.</p>
        </div>
        <div className="step">
          <span className="tile t-teal">
            <IconGlobe />
          </span>
          <b>Research</b>
          <p>Live search of current offers in your country, compared with what you actually use and pay.</p>
        </div>
        <div className="step">
          <span className="tile t-green">
            <IconTrendDown />
          </span>
          <b>Save</b>
          <p>Verified amounts and a ready-to-send negotiation pitch. Nothing is invented — every number is checked in code.</p>
        </div>
        <div className="step">
          <span className="tile t-orange">
            <IconChart />
          </span>
          <b>Track</b>
          <p>Upload each month's bill and see exactly what changed: totals, new charges, price creep, usage.</p>
        </div>
        <div className="step">
          <span className="tile t-purple">
            <IconLanguages />
          </span>
          <b>Translate</b>
          <p>Bill in a language you don't speak? Read it natively — amounts quality-checked to stay exact.</p>
        </div>
      </div>

      <h2>Privacy</h2>
      <section className="card">
        <p style={{ margin: 0 }}>
          Your bill is sensitive. We never store your bill images or PDFs — they're analyzed and immediately
          discarded. The decoded summary is kept encrypted for 7 days so your private link works, then deleted
          too — unless you opt in to keeping it (encrypted) so your future bills can be compared month to
          month; you can erase everything at any time. Beyond that we keep anonymous statistics only
          (category, provider, amounts) with no link of any kind back to you. Nothing is indexed or shared.
        </p>
      </section>

      <p className="footer">
        Also on Telegram: <a href="https://t.me/savebills_bot">@savebills_bot</a> — send your bill in a chat,
        get the same analysis back.
      </p>
    </main>
  );
}
