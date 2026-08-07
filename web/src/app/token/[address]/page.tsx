import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchLaunch,
  fetchOhlc,
  fetchTrades,
  fetchLeaderboard,
  fetchActivityStats,
  graduationThresholdUsd,
  hasGraduated,
} from "@/lib/pools";
import type { ActivityStats } from "@/lib/pools";
import { PriceChart } from "@/components/PriceChart";
import { TradeFeed } from "@/components/TradeFeed";
import { CurveBar } from "@/components/TokenCard";
import { readCustody, type Custody } from "@/lib/custody";
import { recoverPoolKey, roundTripPct, STANDARD_FEE, type PoolKeyFacts } from "@/lib/poolkey";
import { feeLabel } from "@/components/FeeBadge";
import { usd, price, compact, pct, age, short, hueFrom } from "@/lib/format";
import { explorer } from "@/lib/chain";
import { TokenImage } from "@/components/TokenImage";

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

  return (
    <div className={`card p-4 ${custody.kind === "creator" || severe ? "border-warn/40" : ""}`}>
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

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) notFound();

  const launch = await fetchLaunch(address).catch(() => null);
  if (!launch) notFound();

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
            <a
              href={explorer.token(launch.tokenAddress)}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-mint"
            >
              {short(launch.tokenAddress, 6, 6)}
            </a>
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
                className="transition-colors hover:text-mint"
              >
                {launch.xVerified ? "X (verified)" : "X"}
              </a>
            )}
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

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <div className="card p-4">
            <PriceChart candles={candles} />
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line/80 bg-line/60 sm:grid-cols-4">
            {[
              { k: "FDV", v: usd(launch.fdvUsd) },
              { k: "24h volume", v: usd(launch.poolStats.volume24hUsd) },
              { k: "Liquidity", v: usd(launch.poolStats.liquidityUsd) },
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
            <div className="num mt-3 flex items-baseline gap-2">
              <span className="text-3xl text-mint">{launch.graduationProgress.toFixed(1)}%</span>
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
          </div>

          <LiquidityPanel custody={custody} facts={facts} />

          <div className="card p-4">
            <div className="label">Trade</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Swaps still route through the launchpad&apos;s own interface. VladLaunch reads the
              market; it does not yet sign for it.
            </p>
            <a
              href={`https://pools.trade/token/${launch.tokenAddress}`}
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
