"use client";

import { useState } from "react";

export function CopyApnButton({ apn }: { apn: string }) {
  const [copied, setCopied] = useState(false);

  async function copyApn() {
    await navigator.clipboard.writeText(apn);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copyApn}
      aria-label={`Copy APN ${apn}`}
      className="rounded px-1.5 py-1 text-xs font-medium text-sky-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
