import type { Metadata } from "next";
import { UploadForm } from "../upload-form.js";
import { SiteFooter, SiteNav } from "../../components/site-nav.js";
import { NeuBadge, NeuCard } from "../../components/ui/neu.js";

export const metadata: Metadata = {
  title: "Upload a bill | Fixplo.ai",
  description:
    "Drop in a photo or PDF of any utility bill. Fixplo decodes every line item and tells you whether there is anything worth negotiating.",
};

const accepted = ["Phone", "Internet", "Electricity", "Water", "Gas", "Insurance"];

export default function UploadPage() {
  return (
    <div className="fx min-h-screen">
      <SiteNav />

      <main className="mx-auto max-w-3xl px-5 pb-10 pt-10 sm:pt-14">
        <div className="text-center">
          <NeuBadge tone="brand">Step one</NeuBadge>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Upload a utility bill to decode
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
            A photo or a PDF works. Any country, any language, several pages if you have them.
            Fixplo reads the line items itself, so nothing needs typing out.
          </p>
        </div>

        <NeuCard className="mt-10 p-6 sm:p-8">
          <UploadForm endpoint="/api/upload" />
        </NeuCard>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {accepted.map((a) => (
            <li
              key={a}
              className="rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm"
            >
              {a}
            </li>
          ))}
        </ul>

        <NeuCard className="mt-8" elevation="inset">
          <h2 className="text-sm font-bold text-ink">What happens to your bill</h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            The image or PDF is analysed and then discarded rather than stored. The decoded summary
            is kept encrypted so your private link keeps working, and you can erase all of it at any
            time. Beyond that Fixplo keeps anonymous statistics only, with nothing that points back
            to you. Data is encrypted in transit and at rest, in line with GDPR.
          </p>
        </NeuCard>
      </main>

      <SiteFooter />
    </div>
  );
}
