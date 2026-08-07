"use client";

import { useEffect, useState } from "react";
import type { Trade, Trader } from "@/lib/pools";
import { usd, compact, since, short } from "@/lib/format";
import { explorer } from "@/lib/chain";

type Tab = "trades" | "traders";

/** One tx can emit several fills, so txHash alone is not unique. */
const tradeKey = (t: Trade) => `${t.txHash}-${t.atMs}-${t.side}-${t.tokens}`;

export function TradeFeed({
  tokenAddress,
  initialTrades,
  initialTraders,
}: {
  tokenAddress: string;
  initialTrades: Trade[];
  initialTraders: Trader[];
}) {
  const [tab, setTab] = useState<Tab>("trades");
  const [trades, setTrades] = useState(initialTrades);
  const [traders, setTraders] = useState(initialTraders);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(initialTrades.map(tradeKey)));

  // Poll our own route, never the upstream API directly from the browser.
  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/activity?token=${tokenAddress}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { trades: Trade[]; traders: Trader[] };
        if (!alive) return;
        setSeen(new Set(trades.map(tradeKey)));
        setTrades(json.trades ?? []);
        setTraders(json.traders ?? []);
      } catch {
        /* transient — keep showing the last good data rather than blanking the panel */
      }
    }, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tokenAddress, trades]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-line/70 px-3 py-2">
        {(["trades", "traders"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-full px-3 py-1.5 text-[13px] capitalize transition-colors ${
              tab === t ? "bg-line/60 text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t === "traders" ? "Top traders" : "Live trades"}
          </button>
        ))}
        <span className="num ml-auto flex items-center gap-1.5 pr-2 text-[11px] text-muted">
          <span className="live-dot inline-block size-1.5 rounded-full bg-mint" />
          live
        </span>
      </div>

      <div className="thin-scroll max-h-[520px] overflow-y-auto">
        {tab === "trades" ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel/95 backdrop-blur">
              <tr className="border-b border-line/60">
                <th className="label px-3 py-2 text-left font-normal">Side</th>
                <th className="label px-3 py-2 text-right font-normal">Value</th>
                <th className="label px-3 py-2 text-right font-normal">Tokens</th>
                <th className="label px-3 py-2 text-right font-normal">Trader</th>
                <th className="label px-3 py-2 text-right font-normal">Age</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted">
                    No trades yet. This one is still waiting for its first buyer.
                  </td>
                </tr>
              )}
              {trades.map((t) => (
                <tr
                  key={tradeKey(t)}
                  className={`border-b border-line/30 last:border-0 ${
                    seen.has(tradeKey(t)) ? "" : "flash-row"
                  }`}
                >
                  <td
                    className={`num px-3 py-2 text-[13px] ${
                      t.side === "buy" ? "text-up" : "text-down"
                    }`}
                  >
                    {t.side}
                  </td>
                  <td className="num px-3 py-2 text-right text-[13px] text-ink">
                    {usd(t.amountUsd)}
                  </td>
                  <td className="num px-3 py-2 text-right text-[13px] text-ink-dim">
                    {compact(t.tokens)}
                  </td>
                  <td className="num px-3 py-2 text-right text-[13px]">
                    <a
                      href={explorer.tx(t.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted transition-colors hover:text-mint"
                    >
                      {short(t.walletAddress)}
                    </a>
                  </td>
                  <td className="num px-3 py-2 text-right text-[13px] text-muted">
                    {since(t.atMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel/95 backdrop-blur">
              <tr className="border-b border-line/60">
                <th className="label px-3 py-2 text-left font-normal">Trader</th>
                <th className="label px-3 py-2 text-right font-normal">Realized</th>
                <th className="label px-3 py-2 text-right font-normal">Unrealized</th>
                <th className="label px-3 py-2 text-right font-normal">Holding</th>
              </tr>
            </thead>
            <tbody>
              {traders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-sm text-muted">
                    No positions to rank yet.
                  </td>
                </tr>
              )}
              {traders.map((tr) => (
                <tr key={tr.address} className="border-b border-line/30 last:border-0">
                  <td className="num px-3 py-2 text-[13px]">
                    <a
                      href={explorer.address(tr.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-dim transition-colors hover:text-mint"
                    >
                      {short(tr.address)}
                    </a>
                    {tr.basisUnknown && (
                      <span
                        className="ml-1.5 text-[10px] text-warn"
                        title="Some tokens arrived by transfer, so cost basis is incomplete"
                      >
                        ?
                      </span>
                    )}
                  </td>
                  <td
                    className={`num px-3 py-2 text-right text-[13px] ${
                      tr.realizedUsd >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {usd(tr.realizedUsd)}
                  </td>
                  <td
                    className={`num px-3 py-2 text-right text-[13px] ${
                      tr.unrealizedUsd >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {usd(tr.unrealizedUsd)}
                  </td>
                  <td className="num px-3 py-2 text-right text-[13px] text-ink-dim">
                    {usd(tr.holdingValueUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
