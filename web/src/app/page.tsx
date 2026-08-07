import Link from "next/link";
import { fetchLaunches, fetchAuctions, sortLaunches, isNearGraduation } from "@/lib/pools";
import type { Auction } from "@/lib/pools";
import { Climb } from "@/components/Climb";
import { Explorer } from "@/components/Explorer";
import { Auctions } from "@/components/Auctions";
import { TokenCard } from "@/components/TokenCard";
import { usd, compact } from "@/lib/format";

export const revalidate = 10;

function Degraded({ reason }: { reason: string }) {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-5 py-24 sm:px-8">
      <h1 className="display text-5xl text-ink">The feed is quiet.</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
        Live launch data isn&apos;t reachable right now, so nothing is shown rather than something
        stale. The chain itself is unaffected — your tokens and positions are fine.
      </p>
      <p className="num mt-6 text-xs text-ink-faint">{reason}</p>
      <Link
        href="/board"
        className="mt-8 inline-block rounded-full border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-mint hover:text-mint"
      >
        Try the board
      </Link>
    </section>
  );
}

export default async function HomePage() {
  let launches;
  let auctions: Auction[] = [];
  try {
    // The auction feed is optional garnish; a failure there must not take the page down.
    const [l, a] = await Promise.all([fetchLaunches("volume"), fetchAuctions().catch(() => [])]);
    launches = l;
    auctions = a;
  } catch (err) {
    return <Degraded reason={err instanceof Error ? err.message : "unknown error"} />;
  }

  if (launches.length === 0) return <Degraded reason="feed returned zero launches" />;

  // One clock for the whole render, taken on the server, so relative times hydrate clean.
  const now = Date.now();
  const trending = sortLaunches(launches, "volume").slice(0, 8);
  const totalVol = launches.reduce((s, l) => s + (l.poolStats.volume24hUsd || 0), 0);
  const totalHolders = launches.reduce((s, l) => s + (l.holderCount || 0), 0);
  const nearCount = launches.filter(isNearGraduation).length;

  return (
    <>
      <Climb launches={launches} now={now} />

      {/* The three numbers that describe the whole market, stated plainly. */}
      <section className="mx-auto mt-16 w-full max-w-[1400px] px-5 sm:px-8">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line/80 bg-line/60 sm:grid-cols-4">
          {[
            { k: "24h volume", v: usd(totalVol) },
            { k: "Live launches", v: String(launches.length) },
            { k: "Holders", v: compact(totalHolders) },
            { k: "Near graduation", v: String(nearCount) },
          ].map((s) => (
            <div key={s.k} className="bg-void/80 px-5 py-5">
              <dt className="label">{s.k}</dt>
              <dd className="num mt-2 text-2xl text-ink">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Trending strip — horizontal, because it is a ranking and rankings read across. */}
      <section className="mt-20">
        <div className="mx-auto flex w-full max-w-[1400px] items-end justify-between px-5 sm:px-8">
          <h2 className="display text-4xl text-ink">Moving now</h2>
          <span className="label pb-2">By 24h volume</span>
        </div>
        <div className="marquee-mask no-scrollbar mt-6 overflow-x-auto">
          <div className="mx-auto flex w-max max-w-none gap-4 px-5 sm:px-8">
            {trending.map((l) => (
              <div key={l.tokenAddress} className="w-[300px] shrink-0">
                <TokenCard l={l} now={now} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Auctions auctions={auctions} />

      <Explorer launches={launches} now={now} />

      <section className="mx-auto mt-24 w-full max-w-[1400px] px-5 sm:px-8">
        <div className="card flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="display text-3xl text-ink">Want every column instead?</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-dim">
              The board puts all {launches.length} launches in one sortable table — price, climb,
              liquidity, turnover, and age, with no card chrome in the way.
            </p>
          </div>
          <Link
            href="/board"
            className="shrink-0 rounded-full bg-mint px-5 py-2.5 text-sm font-medium text-deep transition-colors hover:bg-mint-dim"
          >
            Open the board
          </Link>
        </div>
      </section>
    </>
  );
}
