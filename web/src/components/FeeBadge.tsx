import { feeVerdict, roundTripPct, STANDARD_FEE, type PoolKeyFacts } from "@/lib/poolkey";

/* The fee is the one number on this pad that a trader cannot see anywhere else and
   cannot undo once they've swapped. It gets a colour, and the colour is earned:
   green only when the pool charges what an official launch charges. */

const TONE: Record<string, string> = {
  standard: "text-muted",
  elevated: "text-warn",
  severe: "text-down",
  unknown: "text-ink-faint",
};

export function feeLabel(facts: PoolKeyFacts | null) {
  if (!facts) return "—";
  const p = facts.feePct;
  return `${p < 1 ? p.toFixed(2) : String(Number(p.toFixed(2)))}%`;
}

export function feeTitle(facts: PoolKeyFacts | null) {
  if (!facts) {
    return "Pool fee could not be proven from the pool id. Treat it as unknown, not as standard.";
  }
  const base = `Swap fee ${feeLabel(facts)} — costs ${roundTripPct(facts).toFixed(2)}% to buy and sell once.`;
  if (facts.fee <= STANDARD_FEE) return `${base} This is the rate an official launch uses.`;
  return `${base} An official launch charges 0.25%, so this is ${(facts.fee / STANDARD_FEE).toFixed(0)}× the going rate.`;
}

export function FeeBadge({ facts, className = "" }: { facts: PoolKeyFacts | null; className?: string }) {
  const v = feeVerdict(facts);
  return (
    <span className={`num text-[11px] ${TONE[v]} ${className}`} title={feeTitle(facts)}>
      {feeLabel(facts)} fee
      {v === "severe" && <span aria-hidden> ⚠</span>}
    </span>
  );
}
