"use client";

import { useMemo, useState } from "react";
import type { Launch, FilterKey, SortKey } from "@/lib/pools";
import { filterLaunches, sortLaunches } from "@/lib/pools";
import { TokenCard } from "./TokenCard";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "near", label: "Near graduation" },
  { key: "graduated", label: "Graduated" },
  { key: "linkedX", label: "Linked X" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "heat", label: "Heat" },
  { key: "new", label: "Newest" },
  { key: "fdv", label: "FDV" },
  { key: "holders", label: "Holders" },
  { key: "progress", label: "Progress" },
];

export function Explorer({ launches, now }: { launches: Launch[]; now: number }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("volume");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = filterLaunches(launches, filter);
    if (needle) {
      out = out.filter(
        (l) =>
          l.tokenName.toLowerCase().includes(needle) ||
          l.tokenSymbol.toLowerCase().includes(needle) ||
          l.tokenAddress.toLowerCase().includes(needle),
      );
    }
    return sortLaunches(out, sort);
  }, [launches, filter, sort, q]);

  return (
    <section id="explore" className="mx-auto w-full max-w-[1400px] px-5 pt-20 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2 className="display text-4xl text-ink">Live launches</h2>
          <p className="mt-2 text-sm text-muted">
            {rows.length} of {launches.length} shown
          </p>
        </div>
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Search launches</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ticker, or address"
            className="h-10 w-full rounded-full border border-line bg-panel/60 px-4 text-base text-ink placeholder:text-ink-faint focus:border-mint/60 focus:outline-none sm:text-sm"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                filter === f.key
                  ? "bg-mint text-deep"
                  : "border border-line text-muted hover:border-line-hi hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="label">Sort</span>
          <div className="flex flex-wrap gap-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`rounded-full px-2.5 py-1 text-[13px] transition-colors ${
                  sort === s.key ? "text-mint" : "text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-8 grid place-items-center px-6 py-20 text-center">
          <p className="display text-2xl text-ink">Nothing matches that yet.</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Clear the search or pick a different filter. New tokens land on this chain every few
            minutes.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((l) => (
            <TokenCard key={l.tokenAddress} l={l} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
