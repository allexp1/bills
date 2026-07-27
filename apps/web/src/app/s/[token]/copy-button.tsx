"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label,
  copiedLabel,
  className = "cta",
}: {
  text: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
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
