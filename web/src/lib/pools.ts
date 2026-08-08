/**
 * Read layer for the Uniswap bonding-curve launchpad on Robinhood Chain 4663.
 *
 * pools.trade exposes an unauthenticated tRPC API. We read it *server-side only*
 * (see src/app/api/feed/route.ts) so the browser never talks to a third party
 * and CORS never enters the picture. Every field here was verified against a
 * live response on 2026-08-07 — nothing is assumed from docs.
 *
 * This is a read dependency, not a trust dependency: the same numbers are
 * derivable from the chain via src/lib/chain.ts. If pools.trade changes shape or
 * goes down, `fetchLaunches` throws and the UI shows a degraded state rather
 * than inventing data.
 */

const BASE = "https://pools.trade/api/trpc";
export const RHC_CHAIN_ID = 4663;

export type LaunchStatus = "curveLive" | "graduated" | "graduating" | (string & {});

export type PoolStats = {
  priceUsd: number;
  priceEth: number;
  priceChange1hPct: number;
  priceChange24hPct: number;
  volume24hUsd: number;
  liquidityUsd: number;
};

export type Launch = {
  id: string;
  poolId: string;
  launchpadId: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  description: string | null;
  xUrl: string | null;
  xVerified: boolean;
  imageEmoji: string | null;
  imageHue: number | null;
  imageUrl: string | null;
  chainId: number;
  status: LaunchStatus;
  createdAt: string;
  fdvUsd: number;
  graduationTargetUsd: number;
  graduationProgress: number;
  holderCount: number;
  creatorAddress: string;
  creatorHandle: string;
  buyersLast1h: number;
  tierPlan: string;
  poolStats: PoolStats;
  poolPriceSeries?: { at: string; clearingPriceUsd: number }[];
};

export type Trade = {
  side: "buy" | "sell";
  wallet: string;
  walletAddress: string;
  txHash: string;
  amountUsd: number;
  tokens: number;
  priceUsd: number;
  atMs: number;
};

export type Trader = {
  handle: string;
  address: string;
  boughtUsd: number;
  boughtTokens: number;
  buyCount: number;
  soldUsd: number;
  soldTokens: number;
  sellCount: number;
  balance: number;
  transferredIn: boolean;
  basisUnknown: boolean;
  realizedUsd: number;
  unrealizedUsd: number;
  avgCostUsd: number;
  holdingValueUsd: number;
};

export type ActivityWindow = {
  buys: number;
  sells: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  buyers: number;
  sellers: number;
};

export type ActivityStats = { windows: Record<"5m" | "1h" | "6h" | "24h", ActivityWindow> };

export type Candle = { time: number; open: number; high: number; low: number; close: number };

/** tRPC batch envelope: [{ result: { data: T } }] or [{ error: {...} }] */
async function trpc<T>(path: string, input: unknown, revalidate = 10): Promise<T> {
  const url = `${BASE}/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": input }))}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const body = (await res.json()) as Array<{ result?: { data: T }; error?: { message?: string } }>;
  const first = body[0];
  if (!first || first.error) throw new Error(`${path} → ${first?.error?.message ?? "empty response"}`);
  return first.result!.data;
}

/** sortBy accepts exactly "volume" | "recency" — anything else is rejected by the server. */
export function fetchLaunches(sortBy: "volume" | "recency" = "volume") {
  return trpc<Launch[]>("curve.listLaunches", { sortBy }, 10);
}

/**
 * Per-token detail. Needed because listLaunches caps at 100 rows — but the detail
 * endpoint returns a *leaner* row than the list does: no holderCount, no creator, no
 * xUrl, and createdAt comes back as an empty string. So we read both and merge, with
 * the detail winning wherever it actually has a value.
 */
export async function fetchLaunch(tokenAddress: string): Promise<Launch | null> {
  // Null, not throw: a token that exists on-chain must still render when the feed
  // is unreachable or has not finished indexing it. The caller fills the gap from
  // the chain rather than showing a 404 for something that demonstrably exists.
  const detail = await trpc<Partial<Launch> & { websiteUrl?: string }>(
    "curve.getLaunchByAddress",
    { tokenAddress },
    10,
  ).catch(() => null);
  if (!detail) return null;

  const fromList = await fetchLaunches("volume")
    .then((rows) => rows.find((r) => r.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()))
    .catch(() => undefined);

  const merged = { ...(fromList ?? {}), ...detail } as Launch;

  // Empty strings in the detail payload must not clobber a good value from the list.
  if (!merged.createdAt && fromList?.createdAt) merged.createdAt = fromList.createdAt;

  // Outside the top 100 there is no list row, and the detail endpoint sends
  // createdAt as "". The oldest recent trade is a tight lower bound — on TES the
  // first buy landed in the launch block itself — and it is the only anchor we have
  // for bracketing the on-chain log scan in lib/custody.ts.
  if (!merged.createdAt) {
    const trades = (detail as { recentTrades?: { at?: string }[] }).recentTrades ?? [];
    const oldest = trades.map((t) => t.at).filter(Boolean).sort()[0];
    if (oldest) merged.createdAt = oldest;
  }
  if (!merged.description && fromList?.description) merged.description = fromList.description;
  if (merged.holderCount == null && fromList) merged.holderCount = fromList.holderCount;
  if (!merged.creatorAddress && fromList) {
    merged.creatorAddress = fromList.creatorAddress;
    merged.creatorHandle = fromList.creatorHandle;
  }
  if (!merged.xUrl && fromList?.xUrl) merged.xUrl = fromList.xUrl;

  return merged;
}

export function fetchAuction(tokenAddress: string) {
  return trpc<Auction>("cca.getAuctionByAddress", { tokenAddress }, 10);
}

/* ------------------------------------------------------------ crowd launches */

/**
 * The launchpad's second mechanic: a fixed-window uniform-price batch auction.
 * Bidders push a single clearing price up from a floor; when the window closes the
 * whole book fills at that one price and the token graduates into a pool.
 */
export type Auction = {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  description: string | null;
  xUrl: string | null;
  xProfileImageUrl: string | null;
  xVerified: boolean;
  imageEmoji: string | null;
  imageHue: number | null;
  imageUrl: string | null;
  chainId: number;
  status: "live" | "graduated" | (string & {});
  clearingPriceUsd: number;
  clearingPriceEth: number;
  floorPriceUsd: number;
  totalSupply: number;
  fdvUsd: number;
  raisedUsd: number;
  raisedEth: number;
  graduationTargetUsd: number;
  graduationProgress: number;
  creatorAddress: string;
  creatorHandle: string;
  creatorFeeEnabled: boolean;
  bidderCount: number;
  raisedUsdLast1h: number;
  holderCount?: number;
  startsAt: string;
  endsAt: string;
  graduatedAt?: string;
  auctionContractAddress: string;
  poolKeyHash?: string;
};

export function fetchAuctions(sortBy: "volume" | "recency" = "volume") {
  return trpc<Auction[]>("cca.listAuctions", { sortBy }, 10);
}

/** How much the book has bid the price above the floor, as a multiple. */
export function clearingPremium(a: Auction) {
  if (!a.floorPriceUsd) return 1;
  return a.clearingPriceUsd / a.floorPriceUsd;
}

export function fetchTrades(tokenAddress: string) {
  return trpc<{ trades: Trade[]; truncated: boolean }>(
    "activity.getTradeHistory",
    { tokenAddress },
    5,
  );
}

export function fetchLeaderboard(tokenAddress: string) {
  return trpc<{ traders: Trader[] }>("activity.getTraderLeaderboard", { tokenAddress }, 20);
}

export function fetchActivityStats(tokenAddress: string) {
  return trpc<ActivityStats>("activity.getActivityStats", { tokenAddress }, 10);
}

export function fetchOhlc(
  address: string,
  resolution: "ONE_MINUTE" | "FIVE_MINUTES" | "ONE_HOUR" | "ONE_DAY" = "ONE_HOUR",
  startTimeMs = Date.now() - 7 * 864e5,
) {
  return trpc<Candle[]>(
    "prices.getOhlc",
    { chainId: RHC_CHAIN_ID, address: address.toLowerCase(), resolution, startTimeMs },
    15,
  );
}

/* ------------------------------------------------------------------ derived */

/**
 * `graduationProgress` is a MULTIPLE of the threshold, not a percentage of it.
 *
 * An earlier reading of this got it wrong by 100x, in the direction that felt like the
 * careful correction. The arithmetic `fdvUsd / graduationProgress === 50000` holds
 * either way; what settles it is what the chain does.
 *
 * Three independent checks against a live feed of 100 launches (2026-08-08):
 *
 *   1. `graduationProgress === fdvUsd / graduationTargetUsd` for 100 of 100 rows, and
 *      `graduationTargetUsd` is 50000 for every one of them. Progress is that ratio,
 *      so 1.0 is the threshold and nothing else can be.
 *   2. Token 222 (0x21ed792d…) migrated at roughly $40K market cap while the API
 *      reported graduationProgress 6.09 — a token cannot migrate at 6% of the way.
 *   3. The pools separate into two regimes at exactly 1.0:
 *        progress < 1.0   (81 of 100)   liquidity / FDV median 1.008
 *        progress >= 1.0  (19 of 100)   liquidity / FDV median 0.377
 *      Liquidity equal to FDV is the signature of the whole supply sitting in one
 *      single-sided curve position; a fraction of FDV is a migrated pool. That break
 *      is a regime change, not a gradient, and it lands on 1.0.
 *
 * So: graduation happens at `graduationTargetUsd` of FDV — $50,000 — and progress
 * times 100 is the percentage.
 */
export function graduationThresholdUsd(l: { graduationTargetUsd: number }) {
  return l.graduationTargetUsd;
}

/** progress 1.0 === graduated. Multiply for display. */
export function progressPct(progress: number) {
  return progress * 100;
}

/**
 * An auction carries the same ratio — raised over the settle target — and it runs far
 * past 1.0, because a uniform-price batch auction keeps taking bids after the target is
 * met (RHPS raised $104,184 against a $5,020 target: 20.75x). Printing that as "20.75%
 * of the book filled" was wrong twice over: wrong scale, and wrong word.
 */
export function bookLabel(progress: number) {
  return progress >= 1
    ? `${progress.toFixed(progress < 10 ? 1 : 0)}\u00d7 oversubscribed`
    : `${progressPct(progress).toFixed(0)}% of the book filled`;
}

/** Progress runs past 1.0 — a curve keeps trading in its pool after it migrates. */
export const GRADUATION_FLOOR = 1;

/**
 * Status is unreliable here: the feed still reported "curveLive" for a token that had
 * demonstrably migrated. The ratio is measurable and the status is a label, so the
 * ratio wins.
 */
export function hasGraduated(l: { graduationProgress?: number; status?: string | null }) {
  return (l.graduationProgress ?? 0) >= GRADUATION_FLOOR;
}

/**
 * Under the line, a percentage is the readable form. Over it, the same number turns
 * into four digits — FRONG at 100.9x prints as "10091%", which is honest and useless.
 * Past graduation the multiple is the number that means something.
 */
export function climbLabel(progress: number) {
  return progress >= GRADUATION_FLOOR
    ? `${progress.toFixed(progress < 10 ? 1 : 0)}\u00d7`
    : `${progressPct(progress).toFixed(0)}%`;
}

/** Within the last fifth of the climb, and not yet over the line. */
export function isNearGraduation(l: Launch) {
  return l.graduationProgress >= 0.8 && l.graduationProgress < GRADUATION_FLOOR;
}

export function ageMs(l: Launch) {
  return Date.now() - new Date(l.createdAt).getTime();
}

/** Buy pressure over the 24h window — the single most useful degen signal. */
export function heat(l: Launch) {
  const vol = l.poolStats.volume24hUsd || 0;
  const liq = Math.max(l.poolStats.liquidityUsd, 1);
  return vol / liq;
}

export type SortKey =
  | "volume"
  | "fdv"
  | "holders"
  | "progress"
  | "new"
  | "change1h"
  | "change24h"
  | "heat";

export function sortLaunches(rows: Launch[], key: SortKey, dir: "asc" | "desc" = "desc") {
  const val = (l: Launch): number => {
    switch (key) {
      case "volume":
        return l.poolStats.volume24hUsd;
      case "fdv":
        return l.fdvUsd;
      case "holders":
        return l.holderCount;
      case "progress":
        return l.graduationProgress;
      case "new":
        return -ageMs(l);
      case "change1h":
        return l.poolStats.priceChange1hPct;
      case "change24h":
        return l.poolStats.priceChange24hPct;
      case "heat":
        return heat(l);
    }
  };
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * (val(a) - val(b)));
}

export type FilterKey = "all" | "new" | "near" | "graduated" | "linkedX";

export function filterLaunches(rows: Launch[], key: FilterKey) {
  switch (key) {
    case "new":
      return rows.filter((l) => ageMs(l) < 24 * 3600e3);
    case "near":
      return rows.filter(isNearGraduation);
    case "graduated":
      return rows.filter(hasGraduated);
    case "linkedX":
      return rows.filter((l) => Boolean(l.xUrl));
    default:
      return rows;
  }
}
