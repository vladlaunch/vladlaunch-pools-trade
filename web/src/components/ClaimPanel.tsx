"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  FEE_SPLIT_ABI,
  CREATOR_SHARE_BPS,
  REGISTERED_EVENT,
  CLAIMED_EVENT,
  ERC20_SYMBOL_ABI,
} from "@/lib/feesplit";
import { CUSTOM_STRATEGY } from "@/lib/launchpad";
import { robinhoodChain, explorer } from "@/lib/chain";
import { ConnectButton } from "./ConnectButton";
import { compact, short } from "@/lib/format";

/* One row per launch, one button. The complicated part is not the UI — it is that
   collecting fees takes two different shapes depending on where a position lives, and
   the creator should never have to know which. This page only ever calls claimDirect,
   because every launch made here keeps its position in our own splitter. */

type Row = {
  tokenId: bigint;
  token: Address;
  symbol: string;
  claimedEth: bigint;
  claimedToken: bigint;
};

export function ClaimPanel({ feeSplit }: { feeSplit: Address | "" }) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<bigint | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const load = useCallback(async () => {
    if (!address || !publicClient || !feeSplit) return;
    setError(null);
    try {
      // Registered carries the creator as an indexed topic, so this is one query
      // rather than a scan of every launch ever made here.
      const [logs, claims] = await Promise.all([
        publicClient.getLogs({
          address: feeSplit,
          event: REGISTERED_EVENT,
          args: { creator: address },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: feeSplit,
          event: CLAIMED_EVENT,
          args: { creator: address },
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const paid = new Map<string, { eth: bigint; token: bigint }>();
      for (const l of claims) {
        const a = l.args;
        if (a.tokenId == null) continue;
        const k = a.tokenId.toString();
        const prev = paid.get(k) ?? { eth: 0n, token: 0n };
        paid.set(k, {
          eth: prev.eth + (a.creatorEth ?? 0n),
          token: prev.token + (a.creatorToken ?? 0n),
        });
      }

      const out: Row[] = [];
      for (const l of logs) {
        const a = l.args;
        if (a.tokenId == null || !a.token) continue;
        const symbol = await publicClient
          .readContract({ address: a.token, abi: ERC20_SYMBOL_ABI, functionName: "symbol" })
          .catch(() => "???");
        const p = paid.get(a.tokenId.toString()) ?? { eth: 0n, token: 0n };
        out.push({
          tokenId: a.tokenId,
          token: a.token,
          symbol,
          claimedEth: p.eth,
          claimedToken: p.token,
        });
      }
      setRows(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read your launches.");
      setRows([]);
    }
  }, [address, publicClient, feeSplit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isSuccess) void load();
  }, [isSuccess, load]);

  async function claim(tokenId: bigint) {
    if (!feeSplit) return;
    setBusyId(tokenId);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: feeSplit,
        abi: FEE_SPLIT_ABI,
        functionName: "claimDirect",
        args: [tokenId],
      });
      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "Claim failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (!feeSplit) {
    return (
      <div className="card mt-10 p-6">
        <div className="label !text-warn">Not configured</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          This deployment has no fee splitter address set, so there is nothing to read.
          Deploy the contracts and set <span className="num">NEXT_PUBLIC_FEE_SPLIT</span>.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="card mt-10 flex flex-wrap items-center gap-4 p-6">
        <span className="text-[14px] text-ink-dim">Connect the wallet you launched with.</span>
        <ConnectButton />
      </div>
    );
  }

  if (chainId !== robinhoodChain.id) {
    return (
      <div className="card mt-10 flex flex-wrap items-center gap-4 p-6">
        <span className="text-[14px] text-warn">Wrong network.</span>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="mt-10">
      {error && (
        <div className="card mb-5 border-down/40 p-4">
          <p className="num break-words text-[12px] leading-relaxed text-down">{error}</p>
        </div>
      )}

      {rows === null && <p className="text-sm text-muted">Reading your launches…</p>}

      {rows?.length === 0 && (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="display text-2xl text-ink">Nothing launched from this wallet yet.</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Fees show up here once a token you created starts trading.
          </p>
          <Link
            href="/create"
            className="mt-6 rounded-full bg-mint px-5 py-2.5 text-sm font-medium text-deep transition-colors hover:bg-mint-dim"
          >
            Launch a token
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.tokenId.toString()} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/token/${r.token}`}
                  className="num text-[15px] text-ink transition-colors hover:text-mint"
                >
                  ${r.symbol}
                </Link>
                <div className="num mt-1 text-[11px] text-muted">
                  <a
                    href={explorer.token(r.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-mint"
                  >
                    {short(r.token, 5, 5)}
                  </a>
                  <span className="mx-2 text-ink-faint">·</span>
                  position #{r.tokenId.toString()}
                </div>
              </div>

              <div className="num text-right text-[12px]">
                <div className="label">Paid out to you</div>
                <div className="mt-1 text-ink">
                  {(Number(r.claimedEth) / 1e18).toFixed(5)} ETH
                </div>
                <div className="text-ink-dim">
                  {compact(Number(r.claimedToken) / 1e18)} ${r.symbol}
                </div>
              </div>

              <button
                onClick={() => claim(r.tokenId)}
                disabled={busyId === r.tokenId || mining}
                className="shrink-0 rounded-full bg-mint px-5 py-2.5 text-sm font-medium text-deep transition-colors hover:bg-mint-dim disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              >
                {busyId === r.tokenId ? "Check your wallet" : mining ? "Collecting…" : "Collect"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="num mt-8 text-[11px] leading-relaxed text-ink-faint">
        {CREATOR_SHARE_BPS / 100}% to you · {(10_000 - CREATOR_SHARE_BPS) / 100}% to the protocol ·
        strategy {short(CUSTOM_STRATEGY, 5, 5)}
      </p>
    </div>
  );
}
