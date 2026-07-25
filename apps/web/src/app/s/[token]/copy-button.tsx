"use client";

import { useState } from "react";

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="cta"
      style={{ display: "inline-block", cursor: "pointer", border: "none", font: "inherit" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard can be unavailable (http, permissions) — leave the text selectable.
        }
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
