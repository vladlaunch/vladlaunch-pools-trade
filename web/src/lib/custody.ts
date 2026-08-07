import { createPublicClient, http, parseAbiParameters, decodeAbiParameters, type Hex } from "viem";
import { robinhoodChain, CUSTODY, TOKEN_LAUNCHED_TOPIC, BLOCK_TIME_MS } from "./chain";
import { FEE_SPLIT } from "./launchpad";

/**
 * Who ends up holding the LP position for a launch — the single fact that decides
 * whether a token's liquidity can be pulled out from under its holders.
 *
 * On this pad the launch strategy is a parameter, so a creator can point it at their
 * own contract. That contract chooses between two endings, and the choice is invisible
 * everywhere else: hand the position to the FeeSplitter (creator keeps only a fee
 * claim, liquidity is stuck), or mint it straight to the creator's wallet (creator can
 * withdraw). The `TokenLaunched` event records which happened, in an indexed topic.
 *
 * Finding it means a log scan, and full history is 30M blocks. But the feed already
 * tells us when the token launched, and blocks here are ~100ms, so the event is
 * bracketed to a window of a few thousand blocks — one request, not fifteen hundred.
 */

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(robinhoodChain.rpcUrls.default.http[0]),
});

export type Custody =
  /** Our own splitter: unpullable, and it collects the full fee on both sides. */
  | { kind: "vladlaunch"; holder: string; fee: number; tickSpacing: number }
  /** The pools.trade splitter: unpullable, but it forwards only part of the fee. */
  | { kind: "locked"; holder: string; fee: number; tickSpacing: number }
  /** A wallet. Whoever holds it can remove the liquidity. */
  | { kind: "creator"; holder: string; fee: number; tickSpacing: number }
  | { kind: "unknown"; reason: string };

const WINDOW_BLOCKS = 4000n;

function pad32(addr: string): Hex {
  return `0x${addr.toLowerCase().replace("0x", "").padStart(64, "0")}` as Hex;
}

export async function readCustody(tokenAddress: string, createdAtIso: string): Promise<Custody> {
  if (!createdAtIso) return { kind: "unknown", reason: "launch time not reported by the feed" };

  const launchedAt = new Date(createdAtIso).getTime();
  if (!Number.isFinite(launchedAt)) {
    return { kind: "unknown", reason: "launch time not reported by the feed" };
  }

  try {
    const head = await client.getBlockNumber();
    const headBlock = await client.getBlock({ blockNumber: head });
    const headMs = Number(headBlock.timestamp) * 1000;

    const estimated = head - BigInt(Math.round((headMs - launchedAt) / BLOCK_TIME_MS));
    const from = estimated > WINDOW_BLOCKS ? estimated - WINDOW_BLOCKS : 0n;
    const to = estimated + WINDOW_BLOCKS > head ? head : estimated + WINDOW_BLOCKS;

    const logs = await client.request({
      method: "eth_getLogs",
      params: [
        {
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          topics: [TOKEN_LAUNCHED_TOPIC as Hex, null, pad32(tokenAddress)],
        },
      ],
    } as never);

    const rows = logs as unknown as { topics: Hex[]; data: Hex }[];
    if (!rows?.length) return { kind: "unknown", reason: "launch event not found in the scanned range" };

    const log = rows[0];
    const holder = `0x${log.topics[3].slice(-40)}`;

    // PoolKey rides in the non-indexed data: currency0, currency1, fee, tickSpacing, hooks.
    const [, , fee, tickSpacing] = decodeAbiParameters(
      parseAbiParameters("address, address, uint24, int24, address"),
      log.data,
    );

    // Order matters: our splitter is not the pools.trade one, but it is just as
    // unpullable. Classifying it as "creator" would have this site warning people off
    // its own launches.
    const lower = holder.toLowerCase();
    const kind =
      FEE_SPLIT && lower === FEE_SPLIT.toLowerCase()
        ? ("vladlaunch" as const)
        : lower === CUSTODY.FEE_SPLITTER.toLowerCase()
          ? ("locked" as const)
          : ("creator" as const);

    return {
      kind,
      holder,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
    };
  } catch (err) {
    return { kind: "unknown", reason: err instanceof Error ? err.message : "chain unreachable" };
  }
}
