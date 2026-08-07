"use client";

import { useMemo, useState } from "react";
import type { Candle } from "@/lib/pools";
import { price } from "@/lib/format";

/* A line, not candles. Candles encode four numbers per bar; on a launchpad where most
   tokens are hours old and the interesting question is "is it up", three of those four
   are noise. The band shows the high–low envelope so volatility is still visible. */

const W = 900;
const H = 300;
const PAD = { l: 8, r: 62, t: 16, b: 22 };

export function PriceChart({ candles }: { candles: Candle[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const rows = candles.filter((c) => Number.isFinite(c.close) && c.close > 0);
    if (rows.length < 2) return null;

    const lo = Math.min(...rows.map((c) => c.low || c.close));
    const hi = Math.max(...rows.map((c) => c.high || c.close));
    const span = hi - lo || hi || 1;
    const x = (i: number) => PAD.l + (i / (rows.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

    const line = rows.map((c, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(c.close)}`).join(" ");
    const area = `${line} L${x(rows.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
    const envTop = rows.map((c, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(c.high || c.close)}`).join(" ");
    const envBottom = rows
      .slice()
      .reverse()
      .map((c, i) => `L${x(rows.length - 1 - i)},${y(c.low || c.close)}`)
      .join(" ");

    return {
      rows,
      x,
      y,
      line,
      area,
      envelope: `${envTop} ${envBottom} Z`,
      lo,
      hi,
      up: rows[rows.length - 1].close >= rows[0].close,
    };
  }, [candles]);

  if (!model) {
    return (
      <div className="grid h-[300px] place-items-center text-sm text-muted">
        Not enough price history yet.
      </div>
    );
  }

  const { rows, x, y, line, area, envelope, lo, hi, up } = model;
  const stroke = up ? "#00FFC2" : "#FF5C7A";
  const active = hover != null ? rows[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const t = (px - PAD.l) / (W - PAD.l - PAD.r);
        setHover(Math.max(0, Math.min(rows.length - 1, Math.round(t * (rows.length - 1)))));
      }}
      role="img"
      aria-label={`Price history, ${rows.length} points, ${up ? "up" : "down"} over the window. Low ${price(lo)}, high ${price(hi)}.`}
    >
      <defs>
        <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((f) => {
        const v = lo + f * (hi - lo);
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#1F3535" />
            <text
              x={W - PAD.r + 8}
              y={y(v) + 4}
              className="num"
              fontSize="11"
              fill="#888A88"
            >
              {price(v)}
            </text>
          </g>
        );
      })}

      <path d={envelope} fill={stroke} fillOpacity="0.07" />
      <path d={area} fill="url(#pc-fill)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />

      {active && (
        <g pointerEvents="none">
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke={stroke}
            strokeOpacity="0.4"
          />
          <circle cx={x(hover!)} cy={y(active.close)} r="4" fill={stroke} />
          <g transform={`translate(${Math.min(x(hover!) + 10, W - PAD.r - 130)}, ${PAD.t + 6})`}>
            <rect width="126" height="34" rx="7" fill="#041819" stroke="#1F3535" />
            <text x="10" y="15" className="num" fontSize="12" fill="#EDEDED">
              {price(active.close)}
            </text>
            <text x="10" y="28" className="num" fontSize="10" fill="#888A88">
              {new Date(active.time * 1000).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
