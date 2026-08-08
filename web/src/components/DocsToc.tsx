"use client";

import { useEffect, useState } from "react";

export type TocEntry = { id: string; label: string };

/**
 * Scroll-spy contents rail. The highlight tracks what is actually on screen rather than
 * what was last clicked, so it stays honest when the reader scrolls past a section
 * instead of jumping to it.
 *
 * rootMargin pulls the detection band up to just under the sticky header and down to the
 * top third of the viewport: without it, the last section can never win, because a short
 * final section never reaches the middle of the screen.
 */
export function DocsToc({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    const nodes = entries
      .map((e) => document.getElementById(e.id))
      .filter((n): n is HTMLElement => n != null);
    if (!nodes.length) return;

    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (records) => {
        records.forEach((r) => seen.set(r.target.id, r.isIntersecting));
        const first = entries.find((e) => seen.get(e.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-72px 0px -66% 0px", threshold: 0 },
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [entries]);

  return (
    <nav aria-label="On this page" className="flex flex-col gap-0.5">
      <span className="label mb-3">On this page</span>
      {entries.map((e) => {
        const on = e.id === active;
        return (
          <a
            key={e.id}
            href={`#${e.id}`}
            aria-current={on ? "true" : undefined}
            className={`-ml-px border-l py-1.5 pl-3 text-[13px] leading-snug transition-colors ${
              on
                ? "border-mint text-mint"
                : "border-line/70 text-muted hover:border-line-hi hover:text-ink"
            }`}
          >
            {e.label}
          </a>
        );
      })}
    </nav>
  );
}
