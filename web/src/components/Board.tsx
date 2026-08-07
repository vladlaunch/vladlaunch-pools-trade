"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Launch, SortKey, FilterKey } from "@/lib/pools";
import { sortLaunches, filterLaunches, heat, hasGraduated } from "@/lib/pools";
import { recoverPoolKey } from "@/lib/poolkey";
import { FeeBadge } from "./FeeBadge";
import { usd, price, compact, pct, age, hueFrom } from "@/lib/format";
import { CurveBar } from "./TokenCard";

/* The board is for people who already know what they're looking at: one row per
   token, every column sortable, no card chrome. Card grid is for discovery;
   this is for deciding. */

type Col = {
  key: SortKey | null;
  label: string;
  align?: "left" | "right";
  hideBelow?: "sm" | "md" | "lg";
};

const COLS: Col[] = [
  { key: null, label: "Token", align: "left" },
  { key: null, label: "Price", align: "right" },
  { key: "progress", label: "Climb", align: "left" },
  { key: null, label: "Fee", align: "right" },
  { key: "fdv", label: "FDV", align: "right" },
  { key: "volume", label: "24h vol", align: "right" },
  { key: "holders", label: "Holders", align: "right", hideBelow: "sm" },
  { key: null, label: "Liquidity", align: "right", hideBelow: "lg" },
  { key: "change1h", label: "1h", align: "right", hideBelow: "md" },
  { key: "change24h", label: "24h", align: "right" },
  { key: "heat", label: "Heat", align: "right", hideBelow: "lg" },
  { key: "new", label: "Age", align: "right", hideBelow: "md" },
];

const HIDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "near", label: "Near graduation" },
  { key: "graduated", label: "Graduated" },
  { key: "linkedX", label: "Linked X" },
];

export function Board({ launches, now }: { launches: Launch[]; now: number }) {
  const [sort, setSort] = useState<SortKey>("volume");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterKey>("all");
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
    return sortLaunches(out, sort, dir);
  }, [launches, sort, dir, filter, q]);

  const toggle = (key: SortKey) => {
    if (key === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDir("desc");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
        <label className="relative ml-auto w-full max-w-xs">
          <span className="sr-only">Filter the board</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter rows"
            className="h-9 w-full rounded-full border border-line bg-panel/60 px-4 text-sm text-ink placeholder:text-ink-faint focus:border-mint/60 focus:outline-none"
          />
        </label>
      </div>

      <div className="thin-scroll card mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line/80">
              {COLS.map((c) => {
                const active = c.key && c.key === sort;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    className={`${c.hideBelow ? HIDE[c.hideBelow] : ""} px-3 py-3 font-normal ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {c.key ? (
                      <button
                        onClick={() => toggle(c.key!)}
                        className={`label transition-colors hover:text-ink ${
                          active ? "!text-mint" : ""
                        }`}
                        aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
                      >
                        {c.label}
                        {active ? (dir === "desc" ? " ↓" : " ↑") : ""}
                      </button>
                    ) : (
                      <span className="label">{c.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const hue = hueFrom(l.tokenAddress, l.imageHue);
              const h = heat(l);
              return (
                <tr
                  key={l.tokenAddress}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-line/25"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/token/${l.tokenAddress}`}
                      className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      {l.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote launch art
                        <img src={l.imageUrl} alt="" loading="lazy" className="size-7 rounded object-cover" />
                      ) : (
                        <span
                          className="grid size-7 place-items-center rounded text-xs"
                          style={{ background: `hsl(${hue} 55% 18%)` }}
                          aria-hidden
                        >
                          {l.imageEmoji ?? l.tokenSymbol.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="num block text-[13px] text-ink transition-colors group-hover:text-mint">
                          ${l.tokenSymbol}
                        </span>
                        <span className="block max-w-[16ch] truncate text-[11px] text-muted">
                          {l.tokenName}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[13px] text-ink">
                    {price(l.poolStats.priceUsd)}
                  </td>
                  <td className="w-[140px] px-3 py-2.5">
                    <CurveBar progress={l.graduationProgress} graduated={hasGraduated(l)} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <FeeBadge facts={recoverPoolKey(l.tokenAddress, l.poolId)} />
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[13px] text-ink">{usd(l.fdvUsd)}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px] text-ink-dim">
                    {usd(l.poolStats.volume24hUsd)}
                  </td>
                  <td className={`${HIDE.sm} num px-3 py-2.5 text-right text-[13px] text-ink-dim`}>
                    {compact(l.holderCount)}
                  </td>
                  <td className={`${HIDE.lg} num px-3 py-2.5 text-right text-[13px] text-ink-dim`}>
                    {usd(l.poolStats.liquidityUsd)}
                  </td>
                  <td
                    className={`${HIDE.md} num px-3 py-2.5 text-right text-[13px] ${
                      l.poolStats.priceChange1hPct >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {pct(l.poolStats.priceChange1hPct, 1)}
                  </td>
                  <td
                    className={`num px-3 py-2.5 text-right text-[13px] ${
                      l.poolStats.priceChange24hPct >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {pct(l.poolStats.priceChange24hPct, 1)}
                  </td>
                  <td className={`${HIDE.lg} px-3 py-2.5 text-right`}>
                    <span
                      className="num text-[13px] text-ink-dim"
                      title="24h volume divided by pool liquidity — how many times the book turned over"
                    >
                      {h >= 100 ? "99+" : h.toFixed(1)}×
                    </span>
                  </td>
                  <td className={`${HIDE.md} num px-3 py-2.5 text-right text-[13px] text-muted`}>
                    {age(l.createdAt, now)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">
          No rows match. Clear the filter to see all {launches.length} launches.
        </p>
      )}
    </div>
  );
}
