"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Auction } from "@/lib/pools";
import { clearingPremium, graduationThresholdUsd } from "@/lib/pools";
import { usd, price, compact, hueFrom } from "@/lib/format";

/* Crowd Launch is the launchpad's other mechanic: a fixed-window batch auction.
   Everyone fills at one clearing price when the window shuts, so the only two
   numbers that matter while it runs are the clock and how far bidders have
   pushed the price above the floor. Those get the emphasis. */

function Countdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(new Date(endsAt).getTime() - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (left == null) return <span className="num text-[13px] text-muted">—</span>;
  if (left <= 0) return <span className="num text-[13px] text-muted">closed</span>;

  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const urgent = left < 15 * 60000;

  return (
    <span className={`num text-[13px] ${urgent ? "text-warn" : "text-mint"}`}>
      {h > 0 ? `${h}h ` : ""}
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function ipfsToHttp(url: string | null) {
  if (!url) return null;
  return url.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${url.slice(7)}` : url;
}

function AuctionCard({ a }: { a: Auction }) {
  const live = a.status === "live";
  const premium = clearingPremium(a);
  const img = ipfsToHttp(a.xProfileImageUrl ?? a.imageUrl);
  const hue = hueFrom(a.tokenAddress, a.imageHue);
  const target = graduationThresholdUsd(a);

  return (
    <Link
      href={`/token/${a.tokenAddress}`}
      className="card card-lift group flex flex-col gap-4 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      <div className="flex items-start gap-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote launch art
          <img src={img} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <div
            className="grid size-11 shrink-0 place-items-center rounded-lg text-lg"
            style={{ background: `hsl(${hue} 55% 18%)` }}
            aria-hidden
          >
            {a.imageEmoji ?? a.tokenSymbol.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-tight text-ink transition-colors group-hover:text-mint">
            {a.tokenName}
          </div>
          <div className="num mt-0.5 text-[11px] text-muted">${a.tokenSymbol}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] tracking-wide ${
            live ? "bg-mint/15 text-mint" : "bg-line/70 text-muted"
          }`}
        >
          {live ? "BIDDING" : "SETTLED"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <div className="label">{live ? "Closes in" : "Cleared at"}</div>
          <div className="mt-1">
            {live ? <Countdown endsAt={a.endsAt} /> : (
              <span className="num text-[13px] text-ink">{price(a.clearingPriceUsd)}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Raised</div>
          <div className="num mt-1 text-[13px] text-ink">{usd(a.raisedUsd)}</div>
        </div>
        <div>
          <div className="label">Bidders</div>
          <div className="num mt-1 text-[13px] text-ink-dim">{compact(a.bidderCount)}</div>
        </div>
        <div className="text-right">
          <div className="label">Above floor</div>
          <div
            className={`num mt-1 text-[13px] ${premium > 1.001 ? "text-mint" : "text-muted"}`}
            title="Clearing price divided by the auction floor price"
          >
            {premium.toFixed(premium >= 10 ? 0 : 2)}×
          </div>
        </div>
      </div>

      <div className="border-t border-line/60 pt-3">
        <div className="scan-track h-1 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-mint/70"
            style={{ width: `${Math.min(Math.max(a.graduationProgress, 1.5), 100)}%` }}
          />
        </div>
        <div className="num mt-2 flex justify-between text-[11px] text-muted">
          <span>{a.graduationProgress.toFixed(1)}% of book filled</span>
          <span>{usd(target)} to settle</span>
        </div>
      </div>
    </Link>
  );
}

export function Auctions({ auctions }: { auctions: Auction[] }) {
  const live = auctions.filter((a) => a.status === "live");
  const settled = auctions.filter((a) => a.status !== "live").slice(0, 4);
  const shown = [...live, ...settled].slice(0, 8);

  if (shown.length === 0) return null;

  return (
    <section className="mx-auto mt-24 w-full max-w-[1400px] px-5 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-4xl text-ink">Crowd launches</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-dim">
            A four-hour batch auction instead of a curve. Bidders push one clearing price up from a
            floor; when the window shuts, everybody fills at that same price.{" "}
            <span className="text-mint">{live.length} open now.</span>
          </p>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((a) => (
          <AuctionCard key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}
