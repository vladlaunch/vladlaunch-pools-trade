import { ClaimPanel } from "@/components/ClaimPanel";
import { FEE_SPLIT } from "@/lib/launchpad";

export const metadata = {
  title: "Claim fees",
  description: "Collect the trading fees your launches have earned.",
};

export default function ClaimPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pt-12 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="max-w-2xl">
          <h1 className="display text-5xl text-ink">Claim fees</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            Every swap on a token you launched pays a fee, and three quarters of it is
            yours. It accrues in the pool until someone collects it — that is what this
            page does.
          </p>
          <ClaimPanel feeSplit={FEE_SPLIT} />
        </div>

        <aside className="flex flex-col gap-5 lg:pt-4">
          <div className="card p-5">
            <div className="label">How the fee arrives</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              A pool charges its fee on whichever side a trader puts in. Buys pay in ETH,
              sells pay in your token — so a token with volume in both directions builds
              up two piles, not one.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Claiming pays out both at once: 75% to you, 25% to the protocol.
            </p>
          </div>

          <div className="card p-5">
            <div className="label">Your liquidity is not at risk</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Collecting withdraws <span className="num">zero</span> liquidity — only the
              fees that have already accrued come out. The position itself cannot be
              moved or reduced by anyone, which is the same reason nobody can rug a token
              launched here.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
