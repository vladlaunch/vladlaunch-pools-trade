import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * Recover a pool's real swap fee from its poolId.
 *
 * Why this exists: on this launchpad the fee is NOT fixed. Official launches use a
 * 0.25% pool, but anyone can point the launch call at their own strategy contract and
 * pick any fee up to the protocol cap — 10% is one button in a public Telegram bot.
 * The feed API never returns the fee, so a trader has no way to see that the token
 * they are about to buy charges forty times the going rate.
 *
 * A Uniswap v4 poolId is keccak256(abi.encode(PoolKey)), and PoolKey has only five
 * fields. Four of them we already know for every launch on this pad: currency0 is
 * native ETH, currency1 is the token, and hooks is the zero address (verified on both
 * an official launch and a custom-strategy one). That leaves fee and tickSpacing, so
 * we hash the small candidate grid and keep the pair that reproduces the poolId.
 *
 * This is a proof, not a guess: a match means the on-chain PoolKey is exactly that.
 * No match means we don't know, and the UI must say so rather than assume 0.25%.
 *
 * Verified 2026-08-07:
 *   FRONG 0xacea8920… → fee 2500, tickSpacing 60
 *   TES   0xdb3eee80… → fee 2500, tickSpacing 60 (cross-checked against the
 *                        TokenLaunched event, which carries the PoolKey outright)
 */

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const POOL_KEY_ABI = [
  { type: "address" }, // currency0
  { type: "address" }, // currency1
  { type: "uint24" }, // fee
  { type: "int24" }, // tickSpacing
  { type: "address" }, // hooks
] as const;

/** Ordered by how often they actually appear, so the common case exits first. */
const FEE_CANDIDATES = [
  2500, 10000, 100000, 3000, 500, 5000, 25000, 30000, 50000, 250000, 100, 1000,
];
const SPACING_CANDIDATES = [60, 200, 10, 1, 2000];

export type PoolKeyFacts = {
  fee: number;
  /** Fee as a percentage — v4 fee units are millionths, so 2500 = 0.25%. */
  feePct: number;
  tickSpacing: number;
};

function poolIdFor(token: string, fee: number, tickSpacing: number): Hex {
  return keccak256(
    encodeAbiParameters(POOL_KEY_ABI, [ZERO, token as Hex, fee, tickSpacing, ZERO]),
  );
}

const cache = new Map<string, PoolKeyFacts | null>();

/** Returns null when no candidate reproduces the id — say "unknown", never assume. */
export function recoverPoolKey(
  tokenAddress: string | undefined,
  poolId: string | undefined,
): PoolKeyFacts | null {
  // The per-token detail endpoint omits poolId, and a token outside the top 100 has no
  // list row to merge from. No id, no proof — return unknown rather than throwing.
  if (!tokenAddress || !poolId) return null;

  const key = `${tokenAddress}:${poolId}`.toLowerCase();
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const want = poolId.toLowerCase();
  let found: PoolKeyFacts | null = null;

  outer: for (const fee of FEE_CANDIDATES) {
    for (const tickSpacing of SPACING_CANDIDATES) {
      if (poolIdFor(tokenAddress, fee, tickSpacing).toLowerCase() === want) {
        found = { fee, feePct: fee / 10_000, tickSpacing };
        break outer;
      }
    }
  }

  cache.set(key, found);
  return found;
}

/** The fee an official launch uses. Anything above it is a deliberate choice by the creator. */
export const STANDARD_FEE = 2500;

export type FeeVerdict = "standard" | "elevated" | "severe" | "unknown";

export function feeVerdict(facts: PoolKeyFacts | null): FeeVerdict {
  if (!facts) return "unknown";
  if (facts.fee <= STANDARD_FEE) return "standard";
  if (facts.fee <= 30_000) return "elevated"; // up to 3%
  return "severe";
}

/** Round-trip cost of buying then selling, which is what the fee actually costs a trader. */
export function roundTripPct(facts: PoolKeyFacts) {
  const f = facts.fee / 1_000_000;
  return (1 - (1 - f) * (1 - f)) * 100;
}
