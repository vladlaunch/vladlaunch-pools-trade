"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Launch } from "@/lib/pools";
import { graduationThresholdUsd } from "@/lib/pools";
import { compact, usd, pct, age } from "@/lib/format";

/* ============================================================================
   THE CLIMB — the signature.

   Every token on this launchpad is doing exactly one thing: climbing from a
   near-zero valuation toward the threshold where the curve ends and a real pool
   opens. So the hero is not a headline about launching tokens; it is the climb
   itself, plotted from live data.

     y  progress toward graduation, log-scaled by decade of FDV
     x  age since launch, log-scaled (fresh at the left, veterans at the right)
     r  holder count (sqrt-scaled, so 10k holders isn't 1000× the area of 10)
     ⬤  mint intensity = height on the plotted axis

   Nothing is tuned to look dramatic. If the launches change, the field changes.
   ========================================================================= */

/* Two geometries, not one scaled geometry. A 1000×420 viewBox squeezed into a
   335px phone renders 140px tall with 8px axis labels — technically responsive,
   actually unreadable. The narrow layout is squarer and gives labels room. */
const WIDE = { W: 1000, H: 420, PAD: { l: 66, r: 24, t: 26, b: 34 } };
const NARROW = { W: 480, H: 440, PAD: { l: 54, r: 14, t: 20, b: 30 } };

type Geo = typeof WIDE;

const MIN_AGE_MIN = 5;
const MAX_AGE_MIN = 60 * 24 * 30; // 30d ceiling keeps the log axis readable

/**
 * Y is log-scaled, and that is a decision worth defending: on a live snapshot 99 of
 * 100 launches sit under 5% of the way up, so a linear axis flattens the whole field
 * onto one line and tells you nothing. Decades of FDV keep every token separable
 * while still showing, truthfully, how far the bottom is from the top.
 */
const MIN_PROGRESS = 0.02; // 0.02% of the threshold = $1,000 FDV
const MAX_PROGRESS = 100;
const LOG_MIN = Math.log10(MIN_PROGRESS);
const LOG_MAX = Math.log10(MAX_PROGRESS);

function xFor(g: Geo, ageMinutes: number) {
  const a = Math.min(Math.max(ageMinutes, MIN_AGE_MIN), MAX_AGE_MIN);
  const t = (Math.log(a) - Math.log(MIN_AGE_MIN)) / (Math.log(MAX_AGE_MIN) - Math.log(MIN_AGE_MIN));
  return g.PAD.l + t * (g.W - g.PAD.l - g.PAD.r);
}

function yFor(g: Geo, progressPct: number) {
  const p = Math.min(Math.max(progressPct, MIN_PROGRESS), MAX_PROGRESS);
  const t = (Math.log10(p) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return g.H - g.PAD.b - t * (g.H - g.PAD.t - g.PAD.b);
}

type Dot = { l: Launch; x: number; y: number; r: number; glow: number };

/** Render wide on the server and on desktop; swap after mount on narrow screens. */
function useGeometry(): Geo {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow ? NARROW : WIDE;
}

/** `now` comes from the server render so dot positions hydrate identically. */
export function Climb({ launches, now }: { launches: Launch[]; now: number }) {
  const g = useGeometry();
  const [hover, setHover] = useState<Dot | null>(null);

  const { dots, halfway, target, leaders } = useMemo(() => {
    const maxHolders = Math.max(...launches.map((l) => l.holderCount), 1);
    const ds: Dot[] = launches.map((l) => {
      const ageMin = (now - new Date(l.createdAt).getTime()) / 60000;
      const y = yFor(g, l.graduationProgress);
      // Brightness tracks height on the plotted axis, so what you see matches where it is.
      const t = 1 - (y - g.PAD.t) / (g.H - g.PAD.t - g.PAD.b);
      return {
        l,
        x: xFor(g, ageMin),
        y,
        r: (g === NARROW ? 2 : 3) + (g === NARROW ? 9 : 13) * Math.sqrt(l.holderCount / maxHolders),
        glow: Math.max(0, (t - 0.45) / 0.55),
      };
    });
    return {
      dots: ds,
      halfway: launches.filter((l) => l.graduationProgress < 50).length,
      // The threshold is 100× the field named graduationTargetUsd — see lib/pools.ts.
      target: launches[0] ? graduationThresholdUsd(launches[0]) : 5_000_000,
      leaders: [...launches].sort((a, b) => b.graduationProgress - a.graduationProgress).slice(0, 5),
    };
  }, [launches, g, now]);

  // One line per decade of FDV: 0.1% → $5K, 1% → $50K, 10% → $500K, 100% → $5M.
  const gridlines = [0.1, 1, 10, 100];
  const ticks = [
    { m: 60, label: "1h" },
    { m: 60 * 24, label: "1d" },
    { m: 60 * 24 * 7, label: "7d" },
    { m: 60 * 24 * 30, label: "30d" },
  ];
  const fs = g === NARROW ? 9 : 11;

  return (
    <section className="relative mx-auto w-full max-w-[1400px] px-5 pt-10 sm:px-8 sm:pt-16">
      <div className="hero-halo" aria-hidden />
      <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_280px] lg:gap-14">
        <div>
          <h1 className="display max-w-[15ch] text-[clamp(2.75rem,7vw,5.25rem)] text-ink">
            Every token starts at zero and climbs to{" "}
            <span className="text-mint">{usd(target)}</span>.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-dim">
            {halfway} of the {launches.length}
            {" live on Robinhood Chain right now haven’t made it halfway. This is all of them, "}
            {"plotted by how far up they are and how long they’ve been climbing."}
          </p>

          <div
            className="card mt-8 overflow-hidden p-3 sm:p-4"
            role="img"
            aria-label={`Scatter plot of ${launches.length} live token launches. Vertical position is progress toward the ${usd(target)} graduation threshold on a log scale, horizontal position is age since launch. ${halfway} are below halfway.`}
          >
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="label">FDV ↑ &nbsp;·&nbsp; Age →</span>
              <span className="label">Dot size = holders</span>
            </div>

            {/* h-auto, not a fixed height: a fixed height letterboxes the viewBox and
                leaves a dead band under the plot. */}
            <svg
              viewBox={`0 0 ${g.W} ${g.H}`}
              className="block h-auto w-full"
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="climb-fade" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#00FFC2" stopOpacity="0" />
                  <stop offset="100%" stopColor="#00FFC2" stopOpacity="0.09" />
                </linearGradient>
              </defs>

              <rect
                x={g.PAD.l}
                y={g.PAD.t}
                width={g.W - g.PAD.l - g.PAD.r}
                height={g.H - g.PAD.t - g.PAD.b}
                fill="url(#climb-fade)"
              />

              {gridlines.map((v) => (
                <g key={v}>
                  <line
                    x1={g.PAD.l}
                    x2={g.W - g.PAD.r}
                    y1={yFor(g, v)}
                    y2={yFor(g, v)}
                    stroke={v === 100 ? "#00FFC2" : "#1F3535"}
                    strokeOpacity={v === 100 ? 0.5 : 1}
                    strokeDasharray={v === 100 ? "4 4" : undefined}
                  />
                  <text
                    x={g.PAD.l - 10}
                    y={yFor(g, v) + 4}
                    textAnchor="end"
                    className="num"
                    fontSize={fs}
                    fill={v === 100 ? "#00FFC2" : "#888A88"}
                  >
                    {usd((target * v) / 100)}
                  </text>
                </g>
              ))}

              {ticks.map((t) => (
                <text
                  key={t.label}
                  x={xFor(g, t.m)}
                  y={g.H - 12}
                  textAnchor="middle"
                  className="num"
                  fontSize={fs}
                  fill="#888A88"
                >
                  {t.label}
                </text>
              ))}

              {hover && (
                <g pointerEvents="none">
                  <line
                    x1={g.PAD.l}
                    x2={hover.x}
                    y1={hover.y}
                    y2={hover.y}
                    stroke="#00FFC2"
                    strokeOpacity="0.45"
                  />
                  <line
                    x1={hover.x}
                    x2={hover.x}
                    y1={hover.y}
                    y2={g.H - g.PAD.b}
                    stroke="#00FFC2"
                    strokeOpacity="0.45"
                  />
                </g>
              )}

              {dots.map((d, i) => {
                const active = hover?.l.tokenAddress === d.l.tokenAddress;
                return (
                  <circle
                    key={d.l.tokenAddress}
                    cx={d.x}
                    cy={d.y}
                    r={d.r}
                    fill="#00FFC2"
                    fillOpacity={0.1 + d.glow * 0.45 + (active ? 0.3 : 0)}
                    stroke="#00FFC2"
                    strokeOpacity={0.28 + d.glow * 0.6}
                    strokeWidth={active ? 2 : 1}
                    className="rise cursor-pointer"
                    style={{ animationDelay: `${Math.min(i * 12, 900)}ms` }}
                    onMouseEnter={() => setHover(d)}
                  />
                );
              })}

              {hover && (
                <g
                  pointerEvents="none"
                  transform={`translate(${Math.min(hover.x + 14, g.W - 206)}, ${Math.max(hover.y - 46, g.PAD.t)})`}
                >
                  <rect width="196" height="42" rx="8" fill="#041819" stroke="#1F3535" />
                  <text x="12" y="18" fontSize="13" fill="#EDEDED">
                    {hover.l.tokenName.slice(0, 20)}
                  </text>
                  <text x="12" y="33" className="num" fontSize="11" fill="#888A88">
                    {hover.l.graduationProgress.toFixed(1)}% · {usd(hover.l.fdvUsd)} FDV ·{" "}
                    {compact(hover.l.holderCount)} holders
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* The legend is the keyboard-accessible twin of the plot: the five tokens
            closest to the top, as real links. */}
        <aside className="lg:pt-2">
          <div className="label">Closest to graduation</div>
          <ul className="mt-4 flex flex-col divide-y divide-line/70">
            {leaders.map((l) => (
              <li key={l.tokenAddress}>
                <Link
                  href={`/token/${l.tokenAddress}`}
                  className="group flex items-center gap-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink transition-colors group-hover:text-mint">
                      {l.tokenName}
                    </div>
                    <div className="num mt-1 text-[11px] text-muted">
                      {usd(l.poolStats.volume24hUsd)} 24h · {age(l.createdAt, now)} old
                    </div>
                  </div>
                  <div className="num shrink-0 text-right">
                    <div className="text-sm text-mint">{l.graduationProgress.toFixed(1)}%</div>
                    <div
                      className={`text-[11px] ${
                        l.poolStats.priceChange24hPct >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {pct(l.poolStats.priceChange24hPct)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
