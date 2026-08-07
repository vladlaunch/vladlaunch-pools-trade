"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  FEE_SPLIT_ABI,
  REGISTERED_EVENT,
  CLAIMED_EVENT,
  ERC20_SYMBOL_ABI,
  TREASURY,
  CREATOR_SHARE_BPS,
} from "@/lib/feesplit";
import { robinhoodChain, explorer } from "@/lib/chain";
import { ConnectButton } from "./ConnectButton";
import { compact, short } from "@/lib/format";

/* The treasury has no privileged withdrawal, and this page does not pretend otherwise.
   Its 25% is paid out inside every claim, to an address fixed at deploy time. What this
   view adds is visibility over all launches at once, and a way to trigger claims in
   bulk — the same permissionless call any wallet could make. */

type Row = {
  tokenId: bigint;
  token: Address;
  creator: Address;
  symbol: string;
  protocolEth: bigint;
  protocolToken: bigint;
};

export function AdminPanel({ feeSplit }: { feeSplit: Address | "" }) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<bigint | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const isTreasury =
    Boolean(address) && Boolean(TREASURY) && address!.toLowerCase() === TREASURY.toLowerCase();

  const load = useCallback(async () => {
    if (!publicClient || !feeSplit) return;
    setError(null);
    try {
      const [registered, claims] = await Promise.all([
        publicClient.getLogs({
          address: feeSplit,
          event: REGISTERED_EVENT,
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: feeSplit,
          event: CLAIMED_EVENT,
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const earned = new Map<string, { eth: bigint; token: bigint }>();
      for (const l of claims) {
        const a = l.args;
        if (a.tokenId == null) continue;
        const k = a.tokenId.toString();
        const prev = earned.get(k) ?? { eth: 0n, token: 0n };
        earned.set(k, {
          eth: prev.eth + (a.protocolEth ?? 0n),
          token: prev.token + (a.protocolToken ?? 0n),
        });
      }

      const out: Row[] = [];
      for (const l of registered) {
        const a = l.args;
        if (a.tokenId == null || !a.token || !a.creator) continue;
        const symbol = await publicClient
          .readContract({ address: a.token, abi: ERC20_SYMBOL_ABI, functionName: "symbol" })
          .catch(() => "???");
        const e = earned.get(a.tokenId.toString()) ?? { eth: 0n, token: 0n };
        out.push({
          tokenId: a.tokenId,
          token: a.token,
          creator: a.creator,
          symbol,
          protocolEth: e.eth,
          protocolToken: e.token,
        });
      }
      out.sort((x, y) => (y.protocolEth > x.protocolEth ? 1 : -1));
      setRows(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the registry.");
      setRows([]);
    }
  }, [publicClient, feeSplit]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (isSuccess) void load();
  }, [isSuccess, load]);

  async function collect(tokenId: bigint) {
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
      setError(err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "Collect failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (!feeSplit) {
    return (
      <div className="card mt-10 p-6">
        <div className="label !text-warn">Not configured</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          No fee splitter address is set on this deployment. Deploy the contracts and set{" "}
          <span className="num">NEXT_PUBLIC_FEE_SPLIT</span>.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="card mt-10 flex flex-wrap items-center gap-4 p-6">
        <span className="text-[14px] text-ink-dim">Connect the treasury wallet.</span>
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

  if (!isTreasury) {
    return (
      <div className="card mt-10 p-6">
        <div className="label">Not the treasury</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          This view is for {TREASURY ? short(TREASURY, 6, 6) : "the treasury wallet"}. Connect
          that wallet to see it.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          Hiding it is a convenience, not a control — the numbers are on-chain and anyone can
          read them.
        </p>
      </div>
    );
  }

  const totalEth = (rows ?? []).reduce((s, r) => s + r.protocolEth, 0n);
  const withFees = (rows ?? []).filter((r) => r.protocolEth > 0n).length;

  return (
    <div className="mt-10">
      {error && (
        <div className="card mb-5 border-down/40 p-4">
          <p className="num break-words text-[12px] leading-relaxed text-down">{error}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line/80 bg-line/60 sm:grid-cols-3">
        {[
          { k: "Protocol earned", v: `${(Number(totalEth) / 1e18).toFixed(5)} ETH` },
          { k: "Launches", v: String(rows?.length ?? 0) },
          { k: "Have paid out", v: String(withFees) },
        ].map((s) => (
          <div key={s.k} className="bg-void/80 px-5 py-5">
            <dt className="label">{s.k}</dt>
            <dd className="num mt-2 text-xl text-ink">{s.v}</dd>
          </div>
        ))}
      </dl>

      {rows === null && <p className="mt-6 text-sm text-muted">Reading the registry…</p>}

      {rows?.length === 0 && (
        <div className="card mt-6 grid place-items-center px-6 py-16 text-center">
          <p className="display text-2xl text-ink">No launches yet.</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Every token created through this launchpad appears here the moment it launches.
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
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
                    href={explorer.address(r.creator)}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-mint"
                  >
                    creator {short(r.creator, 4, 4)}
                  </a>
                  <span className="mx-2 text-ink-faint">·</span>
                  position #{r.tokenId.toString()}
                </div>
              </div>

              <div className="num text-right text-[12px]">
                <div className="label">To treasury so far</div>
                <div className="mt-1 text-ink">
                  {(Number(r.protocolEth) / 1e18).toFixed(5)} ETH
                </div>
                <div className="text-ink-dim">
                  {compact(Number(r.protocolToken) / 1e18)} ${r.symbol}
                </div>
              </div>

              <button
                onClick={() => collect(r.tokenId)}
                disabled={busyId === r.tokenId || mining}
                className="shrink-0 rounded-full border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === r.tokenId ? "Check your wallet" : mining ? "Collecting…" : "Collect"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="num mt-8 text-[11px] leading-relaxed text-ink-faint">
        Collecting pays the creator {CREATOR_SHARE_BPS / 100}% and the treasury{" "}
        {(10_000 - CREATOR_SHARE_BPS) / 100}% in the same transaction. It is permissionless —
        anyone can trigger it, and it always pays the same two addresses.
      </p>
    </div>
  );
}
