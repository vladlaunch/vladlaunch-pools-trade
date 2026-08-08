import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  fetchLaunch,
  fetchOhlc,
  fetchTrades,
  fetchLeaderboard,
  fetchActivityStats,
  fetchAuction,
  graduationThresholdUsd,
  climbLabel,
  bookLabel,
  progressPct,
  hasGraduated,
  clearingPremium,
} from "@/lib/pools";
import type { ActivityStats, Launch, Auction } from "@/lib/pools";
import { PriceChart } from "@/components/PriceChart";
import { TradeFeed } from "@/components/TradeFeed";
import { CurveBar } from "@/components/TokenCard";
import { readCustody, type Custody } from "@/lib/custody";
import { recoverPoolKey, roundTripPct, STANDARD_FEE, type PoolKeyFacts } from "@/lib/poolkey";
import { feeLabel } from "@/components/FeeBadge";
import { usd, price, compact, pct, age, short, hueFrom } from "@/lib/format";
import { explorer } from "@/lib/chain";
import { TokenImage } from "@/components/TokenImage";
import { readTokenMeta, type OnChainMeta } from "@/lib/tokenmeta";
import { XMark, GlobeMark } from "@/components/Icons";
import { CopyAddress } from "@/components/CopyAddress";

export const revalidate = 10;

/* The two facts nobody else on this chain shows: what the pool charges, and whether
   anyone can still pull the liquidity. Both are stated with their evidence. */
function LiquidityPanel({
  custody,
  facts,
}: {
  custody: Custody;
  facts: PoolKeyFacts | null;
}) {
  const severe = facts ? facts.fee > 30_000 : false;
  const risky = custody.kind === "creator";

  return (
    <div className={`card p-4 ${risky || severe ? "border-warn/40" : ""}`}>
      <div className="label">Liquidity &amp; fee</div>

      <dl className="mt-4 flex flex-col gap-4">
        <div>
          <dt className="text-[12px] text-muted">Swap fee</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className={`num text-xl ${severe ? "text-down" : "text-ink"}`}>
              {feeLabel(facts)}
            </span>
            {facts && (
              <span className="text-[11px] text-ink-faint">
                {roundTripPct(facts).toFixed(2)}% round trip
              </span>
            )}
          </dd>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
            {!facts
              ? "Could not be proven from the pool id. Treat it as unknown."
              : facts.fee <= STANDARD_FEE
                ? "The same rate an official launch uses."
                : `An official launch charges 0.25%. This pool charges ${(facts.fee / STANDARD_FEE).toFixed(0)}× that.`}
          </p>
        </div>

        <div className="border-t border-line/60 pt-4">
          <dt className="text-[12px] text-muted">LP position</dt>
          <dd className="mt-1">
            {custody.kind === "vladlaunch" && (
              <>
                <span className="num text-[15px] text-mint">Locked, unpullable</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                  Held by a contract with no call that moves it or reduces it. Fees are
                  collected by withdrawing zero liquidity, so the principal has no route
                  out — for the creator or anyone else.
                </p>
              </>
            )}
            {custody.kind === "locked" && (
              <>
                <span className="num text-[15px] text-mint">Held by the fee splitter</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                  The creator holds a Fee Beneficiary NFT — a claim on the pool fees, not on
                  the liquidity. They cannot withdraw it.
                </p>
              </>
            )}
            {custody.kind === "creator" && (
              <>
                <span className="num text-[15px] text-down">Held by the creator ⚠</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                  The position NFT went to a wallet, not the splitter. Whoever holds it can
                  remove the liquidity at any time.
                </p>
                <a
                  href={explorer.address(custody.holder)}
                  target="_blank"
                  rel="noreferrer"
                  className="num mt-2 inline-block text-[11px] text-muted underline-offset-2 hover:text-mint hover:underline"
                >
                  {short(custody.holder, 6, 6)}
                </a>
              </>
            )}
            {custody.kind === "unknown" && (
              <>
                <span className="num text-[15px] text-ink-faint">Unknown</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                  {custody.reason}. Absence of proof is not proof the liquidity is locked.
                </p>
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Pressure({ stats }: { stats: ActivityStats | null }) {
  if (!stats) return null;
  const windows: (keyof ActivityStats["windows"])[] = ["5m", "1h", "6h", "24h"];
  return (
    <div className="card p-4">
      <div className="label">Buy vs sell pressure</div>
      <div className="mt-4 flex flex-col gap-3.5">
        {windows.map((w) => {
          const d = stats.windows[w];
          if (!d) return null;
          const total = d.buyVolumeUsd + d.sellVolumeUsd;
          const buyShare = total > 0 ? (d.buyVolumeUsd / total) * 100 : 50;
          return (
            <div key={w}>
              <div className="num mb-1.5 flex items-baseline justify-between text-[11px]">
                <span className="text-muted">{w}</span>
                <span>
                  <span className="text-up">{usd(d.buyVolumeUsd)}</span>
                  <span className="mx-1 text-ink-faint">/</span>
                  <span className="text-down">{usd(d.sellVolumeUsd)}</span>
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-line/60">
                <div className="bg-up" style={{ width: `${buyShare}%` }} />
                <div className="bg-down" style={{ width: `${100 - buyShare}%` }} />
              </div>
              <div className="num mt-1 flex justify-between text-[10px] text-ink-faint">
                <span>{compact(d.buyers)} buyers</span>
                <span>{compact(d.sellers)} sellers</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A crowd launch is a fixed-window batch auction, not a curve, and rendering one as a
 * curve produced a page of zeros beside a live book. Nothing here is borrowed from the
 * curve layout: the numbers that exist for an auction are the clearing price, what has
 * been raised, who is bidding, and how long is left.
 */
function AuctionView({ auction: a, meta }: { auction: Auction; meta: OnChainMeta | null }) {
  const live = a.status === "live";
  const target = graduationThresholdUsd(a);
  const hue = hueFrom(a.tokenAddress, a.imageHue);
  const premium = clearingPremium(a);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pt-8 sm:px-8">
      <Link href="/" className="text-sm text-muted transition-colors hover:text-mint">
        ← All launches
      </Link>

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <TokenImage
          src={meta?.image || a.imageUrl}
          className="size-16 rounded-xl object-cover"
          onUnavailable={
            <div
              className="grid size-16 place-items-center rounded-xl text-2xl"
              style={{ background: `hsl(${hue} 55% 18%)` }}
              aria-hidden
            >
              {a.imageEmoji ?? a.tokenSymbol.slice(0, 1)}
            </div>
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-4xl text-ink">{meta?.name || a.tokenName}</h1>
            <span className="num rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
              ${a.tokenSymbol}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                live ? "bg-mint/15 text-mint" : "bg-line/70 text-muted"
              }`}
            >
              {live ? "Crowd launch · bidding" : "Crowd launch · settled"}
            </span>
          </div>
          <div className="num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <CopyAddress address={a.tokenAddress} />
            {(meta?.xUrl || a.xUrl) && (
              <a
                href={(meta?.xUrl || a.xUrl)!}
                target="_blank"
                rel="noreferrer"
                aria-label="X profile"
                className="inline-flex items-center rounded p-1 transition-colors hover:bg-line/60 hover:text-ink"
              >
                <XMark />
              </a>
            )}
            {meta?.website && (
              <a
                href={meta.website}
                target="_blank"
                rel="noreferrer"
                aria-label="Project website"
                className="inline-flex items-center rounded p-1 transition-colors hover:bg-line/60 hover:text-ink"
              >
                <GlobeMark />
              </a>
            )}
          </div>
        </div>
        <div className="num text-right">
          <div className="text-3xl text-ink">{price(a.clearingPriceUsd)}</div>
          <div className="mt-1 text-[12px] text-muted">clearing price</div>
        </div>
      </header>

      {(meta?.description || a.description) && (
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
          {meta?.description || a.description}
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line/80 bg-line/60 sm:grid-cols-4">
        {[
          { k: "Raised", v: usd(a.raisedUsd) },
          { k: "Bidders", v: compact(a.bidderCount) },
          { k: "Above floor", v: `${premium.toFixed(premium >= 10 ? 0 : 2)}×` },
          { k: live ? "Closes" : "Closed", v: new Date(a.endsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
        ].map((s) => (
          <div key={s.k} className="bg-void/80 px-4 py-4">
            <dt className="label">{s.k}</dt>
            <dd className="num mt-1.5 text-lg text-ink">{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="card mt-5 max-w-2xl p-5">
        <div className="label">How this one works</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Bidders push a single clearing price up from a floor of {price(a.floorPriceUsd)}.
          When the window shuts, every bid fills at that one price — nobody pays more than
          anybody else, and there is no curve to climb.
        </p>
        <div className="mt-4">
          <div className="scan-track h-1 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-mint/70"
              style={{ width: `${Math.min(Math.max(progressPct(a.graduationProgress), 1.5), 100)}%` }}
            />
          </div>
          <div className="num mt-2 flex justify-between text-[11px] text-muted">
            <span>{bookLabel(a.graduationProgress)}</span>
            <span>{usd(target)} to settle</span>
          </div>
        </div>
        <a
          href={`https://pools.trade/t/${a.tokenAddress}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block rounded-full bg-mint px-4 py-2.5 text-center text-sm font-medium text-deep transition-colors hover:bg-mint-dim"
        >
          {live ? `Bid on $${a.tokenSymbol}` : `Trade $${a.tokenSymbol}`}
        </a>
      </div>
    </div>
  );
}

/**
 * A token page is the link people actually paste into a reply, so it is the one page
 * whose card must not be generic. Everything here comes from the feed row we already
 * fetch; a failure falls back to the address rather than to an empty title, because a
 * card reading "undefined" is worse than a plain one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const launch = await fetchLaunch(address).catch(() => null);
  if (!launch) return { title: short(address, 6, 6), robots: { index: false, follow: true } };

  const climbed = hasGraduated(launch)
    ? "Graduated out of the curve."
    : `${progressPct(launch.graduationProgress).toFixed(0)}% of the way to ${usd(graduationThresholdUsd(launch))}.`;

  const title = `${launch.tokenName} ($${launch.tokenSymbol})`;
  const description = `${climbed} ${usd(launch.fdvUsd)} FDV, ${compact(launch.holderCount ?? 0)} holders. See what its pool charges and who holds the liquidity.`;

  return {
    title,
    description,
    alternates: { canonical: `/token/${address}` },
    openGraph: { title: `${title} — VladLaunch`, description, url: `/token/${address}` },
    twitter: { card: "summary_large_image", title: `${title} — VladLaunch`, description },
  };
}

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) notFound();

  // The chain is the floor and the feed is the garnish, not the other way round.
  // Requiring the feed meant a token that plainly exists on-chain 404'd whenever the
  // indexer lagged or hiccuped — which is exactly when its creator goes looking for it.
  // Crowd launches are a different mechanic on a different endpoint, and every auction
  // card on the home page links here. Querying only the curve endpoint made a live
  // auction — real bidders, real money — render as a curve at zero.
  const [feed, auction, meta] = await Promise.all([
    fetchLaunch(address).catch(() => null),
    fetchAuction(address).catch(() => null),
    readTokenMeta(address as `0x${string}`),
  ]);
  if (!feed && !auction && !meta) notFound();

  if (auction && !feed) return <AuctionView auction={auction} meta={meta} />;

  const launch: Launch = {
    ...(feed ?? ({} as Launch)),
    tokenAddress: address,
    tokenName: meta?.name || feed?.tokenName || "Unknown token",
    tokenSymbol: meta?.symbol || feed?.tokenSymbol || "???",
    // Written at creation and immutable, so the chain outranks the feed on all three.
    description: meta?.description || feed?.description || null,
    imageUrl: meta?.image || feed?.imageUrl || null,
    xUrl: meta?.xUrl ?? feed?.xUrl ?? null,
    poolStats: feed?.poolStats ?? {
      priceUsd: 0,
      priceEth: 0,
      priceChange1hPct: 0,
      priceChange24hPct: 0,
      volume24hUsd: 0,
      liquidityUsd: 0,
    },
    graduationProgress: feed?.graduationProgress ?? 0,
    graduationTargetUsd: feed?.graduationTargetUsd ?? 50_000,
    fdvUsd: feed?.fdvUsd ?? 0,
  };
  // Without a feed row none of the market numbers were measured. They render as em
  // dashes rather than zeros, because "$0.000000" is a claim and a dash is not.
  const hasMarket = Boolean(feed);
  const website = meta?.website ?? null;

  const [candles, trades, traders, stats, custody] = await Promise.all([
    fetchOhlc(address, "ONE_HOUR").catch(() => []),
    fetchTrades(address).then((r) => r.trades).catch(() => []),
    fetchLeaderboard(address).then((r) => r.traders).catch(() => []),
    fetchActivityStats(address).catch(() => null),
    readCustody(address, launch.createdAt),
  ]);

  // Fee comes from the pool id by proof; the launch event confirms it when we find one.
  const facts =
    custody.kind === "unknown"
      ? recoverPoolKey(launch.tokenAddress, launch.poolId)
      : { fee: custody.fee, feePct: custody.fee / 10_000, tickSpacing: custody.tickSpacing };

  const now = Date.now();
  const up = launch.poolStats.priceChange24hPct >= 0;
  const threshold = graduationThresholdUsd(launch);
  const graduated = hasGraduated(launch);
  const hue = hueFrom(launch.tokenAddress, launch.imageHue);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pt-8 sm:px-8">
      <Link href="/" className="text-sm text-muted transition-colors hover:text-mint">
        ← All launches
      </Link>

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <TokenImage
          src={launch.imageUrl}
          className="size-16 rounded-xl object-cover"
          onUnavailable={
            <div
              className="grid size-16 place-items-center rounded-xl text-2xl"
              style={{ background: `hsl(${hue} 55% 18%)` }}
              aria-hidden
            >
              {launch.imageEmoji ?? launch.tokenSymbol.slice(0, 1)}
            </div>
          }
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-4xl text-ink">{launch.tokenName}</h1>
            <span className="num rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
              ${launch.tokenSymbol}
            </span>
            {graduated && (
              <span className="rounded-full bg-mint/15 px-2.5 py-1 text-[11px] text-mint">
                Graduated
              </span>
            )}
          </div>
          <div className="num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <CopyAddress address={launch.tokenAddress} />
            {launch.createdAt && <span>launched {age(launch.createdAt, now)} ago</span>}
            {launch.creatorAddress && (
              <span>
                by{" "}
                <a
                  href={explorer.address(launch.creatorAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-mint"
                >
                  {launch.creatorHandle ?? short(launch.creatorAddress)}
                </a>
              </span>
            )}
            {launch.xUrl && (
              <a
                href={launch.xUrl}
                target="_blank"
                rel="noreferrer"
                title={launch.xUrl}
                aria-label="X profile"
                className="inline-flex items-center gap-1 rounded p-1 transition-colors hover:bg-line/60 hover:text-ink"
              >
                <XMark />
                {launch.xVerified && <span className="text-[10px] text-mint">✓</span>}
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                title={website}
                aria-label="Project website"
                className="inline-flex items-center rounded p-1 transition-colors hover:bg-line/60 hover:text-ink"
              >
                <GlobeMark />
              </a>
            )}
            {!feed && <span className="text-warn">market data unavailable</span>}
          </div>
        </div>

        <div className="num text-right">
          <div className="text-3xl text-ink">{price(launch.poolStats.priceUsd)}</div>
          <div className={`mt-1 text-sm ${up ? "text-up" : "text-down"}`}>
            {pct(launch.poolStats.priceChange24hPct)} 24h
          </div>
        </div>
      </header>

      {launch.description && (
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
          {launch.description}
        </p>
      )}

      {/* min-w-0 on the columns, not minmax(0,1fr) on the track: below lg this grid has
          no explicit columns at all, so the implicit track floors at the item's
          min-content — the trades table — and dragged a 360px phone out to 362px. */}
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="card p-4">
            <PriceChart candles={candles} />
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line/80 bg-line/60 sm:grid-cols-4">
            {[
              { k: "FDV", v: hasMarket ? usd(launch.fdvUsd) : "—" },
              { k: "24h volume", v: hasMarket ? usd(launch.poolStats.volume24hUsd) : "—" },
              { k: "Liquidity", v: hasMarket ? usd(launch.poolStats.liquidityUsd) : "—" },
              { k: "Holders", v: launch.holderCount != null ? compact(launch.holderCount) : "—" },
            ].map((s) => (
              <div key={s.k} className="bg-void/80 px-4 py-4">
                <dt className="label">{s.k}</dt>
                <dd className="num mt-1.5 text-lg text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>

          <TradeFeed
            tokenAddress={launch.tokenAddress}
            initialTrades={trades}
            initialTraders={traders}
          />
        </div>

        <aside className="flex flex-col gap-5">
          <div className="card p-4">
            <div className="label">The climb</div>
            {!hasMarket ? (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
                Not measured. The market feed has no row for this token yet, and progress
                toward graduation is its number to report — inventing one here would be a
                guess wearing a percentage sign.
              </p>
            ) : (
            <>
            <div className="num mt-3 flex items-baseline gap-2">
              <span className="text-3xl text-mint">{climbLabel(launch.graduationProgress)}</span>
              <span className="text-[12px] text-muted">of {usd(threshold)}</span>
            </div>
            <div className="mt-4">
              <CurveBar progress={launch.graduationProgress} graduated={graduated} />
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
              {graduated
                ? "The curve is done. This token now trades in its own pool."
                : `${usd(Math.max(threshold - launch.fdvUsd, 0))} of FDV left before this graduates out of the curve.`}
            </p>
            </>
            )}
          </div>

          <LiquidityPanel custody={custody} facts={facts} />

          <div className="card p-4">
            <div className="label">Trade</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Swaps still route through the launchpad&apos;s own interface. VladLaunch reads the
              market; it does not yet sign for it.
            </p>
            <a
              href={`https://pools.trade/t/${launch.tokenAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block rounded-full bg-mint px-4 py-2.5 text-center text-sm font-medium text-deep transition-colors hover:bg-mint-dim"
            >
              Buy ${launch.tokenSymbol}
            </a>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Opens pools.trade. The contracts behind it are not source-verified on Blockscout, so
              nothing here builds swap calldata for you.
            </p>
          </div>

          <Pressure stats={stats} />

          <div className="card p-4">
            <div className="label">Buyers, last hour</div>
            <div className="num mt-2 text-2xl text-ink">{compact(launch.buyersLast1h)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
