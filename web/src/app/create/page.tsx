import { CreateWizard } from "@/components/CreateWizard";

export const metadata = {
  title: "Launch a token — VladLaunch",
  description: "Set up a bonding-curve launch on Robinhood Chain.",
};

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pt-12 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="max-w-2xl">
          <h1 className="display text-5xl text-ink">Launch a token</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            One billion supply, a bonding curve priced in ETH, and a pool that opens itself once
            fully-diluted value reaches $5M. You pick the swap fee and keep it.
          </p>
          <CreateWizard />
        </div>

        <aside className="flex flex-col gap-5 lg:pt-4">
          <div className="card p-5">
            <div className="label">What actually happens</div>
            <ol className="mt-4 flex flex-col gap-4 text-[13px] leading-relaxed text-ink-dim">
              <li className="flex gap-3">
                <span className="num shrink-0 text-mint">1</span>
                <span>
                  A token contract is deployed with your name, ticker, and art written on-chain.
                  Its address is known before it exists.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="num shrink-0 text-mint">2</span>
                <span>
                  The whole supply goes into a bonding curve at the fee you chose. Every buy moves
                  the price up the curve; every sell moves it back down.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="num shrink-0 text-mint">3</span>
                <span>
                  At $5M FDV the curve stops and the liquidity migrates into a real pool. That is
                  graduation, and it is the only exit the curve has.
                </span>
              </li>
            </ol>
            <p className="mt-5 border-t border-line/60 pt-4 text-[12px] leading-relaxed text-ink-faint">
              Steps 1 and 2 are one transaction. It is simulated before your wallet ever opens, so
              a launch that would fail tells you why instead of costing gas.
            </p>
          </div>

          <div className="card p-5">
            <div className="label">The fee is yours</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Swap fees from your pool accrue to you and are paid out whenever anyone
              collects — 75% to you, 25% to the protocol, in the same transaction. Your
              claim is recorded on-chain against your address, not issued as a token.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Pick the rate honestly. A high fee is charged to the people buying your token, and
              this site prints it on the card.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
