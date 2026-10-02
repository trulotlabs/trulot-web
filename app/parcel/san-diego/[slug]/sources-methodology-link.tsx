"use client";

import type { ReactNode } from "react";

export function SourcesMethodologyLink({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  function revealSources() {
    const summary = document.getElementById("sources-methodology");
    const disclosure = summary?.closest("details");
    if (disclosure) disclosure.open = true;
  }

  return (
    <a href="#sources-methodology" onClick={revealSources} className={className}>
      {children}
    </a>
  );
}
