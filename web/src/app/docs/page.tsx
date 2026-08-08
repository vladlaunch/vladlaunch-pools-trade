import Link from "next/link";
import type { Metadata } from "next";
import { DocsToc, type TocEntry } from "@/components/DocsToc";
import { Receipt, TestReceipt } from "@/components/Receipt";
import { CopyAddress } from "@/components/CopyAddress";
import { FEE_PRESETS } from "@/lib/launchpad";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How a VladLaunch token works: the pool fee you choose, the 75/25 fee split, why the liquidity has no route out, and the exact commands to check all of it against Robinhood Chain yourself.",
};

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const STRATEGY = "0x0256b6Cf22487B1C2076fF1565F1368DFFa39743";
const FEE_SPLIT = "0xee1327A78909067566d133e2CeE31086660dB8BE";
const ROUTER = "0x2F0f67E77D83cE1f225e80200F25b9843261f49a";
const TREASURY = "0x01Fa31abb46d5750F68AE7F9a60c1691aA5DE614";

const SECTIONS: TocEntry[] = [
  { id: "what", label: "What this is" },
  { id: "launch", label: "Launching a token" },
  { id: "fee", label: "The pool fee" },
  { id: "split", label: "Fees and the split" },
  { id: "liquidity", label: "Liquidity" },
  { id: "graduation", label: "Graduation" },
  { id: "contracts", label: "Contracts" },
  { id: "limits", label: "What this cannot do" },
];

/* --------------------------------------------------------------- primitives */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="docs-section border-t border-line/70 pt-10">
      <span className="label">{eyebrow}</span>
      <h2 className="display mt-3 text-[34px] leading-[1.05] text-ink sm:text-[40px]">{title}</h2>
      <div className="mt-5 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-dim">
        {children}
      </div>
    </section>
  );
}

/** Only the launch flow is genuinely a sequence, so only it is numbered. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="num mt-0.5 shrink-0 text-[13px] text-mint">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="text-[15px] text-ink">{title}</div>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{children}</p>
      </div>
    </div>
  );
}

function Row({ k, v, hint }: { k: string; v: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/50 py-3 last:border-0">
      <div className="min-w-0">
        <span className="text-[14px] text-ink">{k}</span>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">{hint}</p>}
      </div>
      <span className="num shrink-0 text-[13px] text-ink-dim">{v}</span>
    </div>
  );
}

/* --------------------------------------------------------------------- page */

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8">
      {/* The hero is the project's one real claim, stated with the way to falsify it
          beside it. A docs page for a launchpad opens on the question everyone actually
          arrives with — can the dev take the liquidity — not on a welcome. */}
      <header className="relative grid gap-10 pt-14 pb-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:pt-20">
        <div className="hero-halo" aria-hidden />
        <div className="relative z-10 min-w-0">
          <span className="label">Docs</span>
          <h1 className="display mt-4 max-w-[14ch] text-[clamp(2.5rem,7vw,4.5rem)] text-ink">
            Nobody can pull the <span className="text-mint">liquidity</span>.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-dim">
            Everything else on this page is a detail. A token launched here puts its whole
            supply into a Uniswap v4 pool, and the position that holds it goes to a contract
            with no function that returns it — not to the creator, not to us, not to anyone.
          </p>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-dim">
            You should not take that on trust, and you do not have to. Every claim below is
            printed above the command that would catch it lying.
          </p>
        </div>

        <div className="relative z-10 min-w-0 lg:pt-14">
          <div className="card p-5">
            <span className="label !text-mint/70">Prove us wrong</span>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Fees are collected by withdrawing <span className="text-ink">zero</span> liquidity.
              Read the position after any claim: if the launchpad could drain a pool, this number
              would fall.
            </p>
            <Receipt
              label="Run it"
              cmd={`cast call ${FEE_SPLIT} \\\n  "PROTOCOL_BPS()(uint16)" \\\n  --rpc-url ${RPC}`}
              out="2500"
              note="2500 basis points is the 25% protocol share. It is a constant, so this answer cannot change for as long as the contract exists."
            />
          </div>
        </div>
      </header>

      <div className="grid gap-12 pb-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <DocsToc entries={SECTIONS} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-14">
          {/* ---------------------------------------------------------------- */}
          <Section id="what" eyebrow="Start here" title="What this is">
            <p>
              VladLaunch is a launchpad on{" "}
              <a
                href="https://robinhoodchain.blockscout.com"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-line-hi underline-offset-4 transition-colors hover:text-mint hover:decoration-mint"
              >
                Robinhood Chain
              </a>{" "}
              (chain id 4663). It is built on Uniswap&apos;s <span className="num text-ink">LiquidityLauncher</span>
              {" "}— the same entry contract pools.trade uses.
            </p>
            <p>
              That matters more than any feature list. The token contract is Uniswap&apos;s UERC20,
              created by Uniswap&apos;s factory, trading in a Uniswap v4 pool. Only the distribution
              step is ours. A token launched here is the same kind of object as one launched
              anywhere else on this chain, and it shows up on third-party front-ends for the same
              reason.
            </p>
            <p className="text-ink">Three things are different:</p>
            <div className="card px-5 py-1">
              <Row k="Pool fee" v="0.25% – 5%" hint="An official launch is 0.25%, hardcoded. Here you choose it, once, at launch." />
              <Row k="Opening buy" v="same transaction" hint="Official flow: launch, then buy in a second transaction, with a gap for a sniper to sit in." />
              <Row k="Fee recipient" v="75 / 25" hint="Official flow sends the fee claim to the creator. Here it splits: 75% creator, 25% protocol." />
            </div>
            <p className="text-[14px] text-ink-faint">
              And one thing is not different: the liquidity is locked either way. What changes is{" "}
              <em className="not-italic text-ink-dim">how much of the fee survives the trip</em> —
              see <a href="#split" className="text-mint underline-offset-4 hover:underline">the split</a>.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="launch" eyebrow="For creators" title="Launching a token">
            <p>
              One billion supply, eighteen decimals, priced in ETH. Steps 1 and 2 are a single
              transaction, simulated before your wallet ever opens.
            </p>
            <div className="mt-2 flex flex-col gap-5">
              <Step n={1} title="The token is deployed">
                Your name, ticker, and image are written on-chain in the token&apos;s own metadata.
                The address is known before the token exists, because it is derived from your
                wallet and a salt.
              </Step>
              <Step n={2} title="The whole supply goes into a curve">
                A single-sided Uniswap v4 position at the fee you chose. Every buy moves the price
                up the curve; every sell moves it back down. There is no team allocation to sell
                into you, because there is no allocation at all — all of it is in the pool.
              </Step>
              <Step n={3} title="Your opening buy lands in the same transaction">
                Optional. If you set one, the router launches and buys atomically, so no bot can
                get between the two. If the buy fails its slippage check, the whole transaction
                reverts and the token is never created.
              </Step>
              <Step n={4} title="It climbs, or it does not">
                At $50,000 fully-diluted value the curve ends and the liquidity migrates into a
                normal pool. Most tokens never get there.
              </Step>
            </div>
            <Receipt
              label="Check your own launch"
              cmd={`cast logs --from-block <launch-block> \\\n  --address ${STRATEGY} \\\n  --rpc-url ${RPC}`}
              note="Every launch emits TokenLaunched from the strategy address. One query returns the complete catalogue and nothing else — that address is the registry."
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="fee" eyebrow="Economics" title="The pool fee">
            <p>
              You choose the swap fee at launch and it is fixed for the life of the pool. A v4 pool
              charges its fee on the <span className="text-ink">input</span> side of each swap, so
              buyers pay in ETH and sellers pay in the token.
            </p>
            <div className="card px-5 py-1">
              {FEE_PRESETS.map((p) => (
                <Row
                  key={p.fee}
                  k={p.label}
                  v={`${((p.fee / 10_000) * 2).toFixed(2)}% round trip`}
                  hint={p.note}
                />
              ))}
            </div>
            <p className="text-[14px] text-ink-faint">
              This interface caps the fee at 5%. The underlying Uniswap library allows far more, so
              a token launched through some other front-end can charge more than anything you can
              pick here — which is why every token page on this site prints the pool&apos;s real fee
              rather than assuming it.
            </p>
            <p className="text-[14px]">
              A high fee is not free money. It is a tax your own buyers pay, and at 5% a round trip
              costs them 9.75% before the price has moved at all.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="split" eyebrow="Economics" title="Fees and the split">
            <p>
              Every payout is split in the same transaction: <span className="text-ink">75% to the
              launch&apos;s creator, 25% to the treasury</span>. Both sides — the ETH the buyers paid
              and the tokens the sellers paid — split the same way.
            </p>
            <p>
              Claiming is permissionless. Anyone may call it, and it always pays the same two
              addresses, so there is nothing to gate and no one to ask.{" "}
              <Link href="/claim" className="text-mint underline-offset-4 hover:underline">
                /claim
              </Link>{" "}
              does it for a creator&apos;s own launches;{" "}
              <Link href="/admin" className="text-mint underline-offset-4 hover:underline">
                /admin
              </Link>{" "}
              does it across all of them. Neither page has an ability the chain does not already
              give every wallet.
            </p>
            <p className="text-ink">Where the position ends up decides how much fee survives:</p>
            <div className="card px-5 py-1">
              <Row k="Held by the pools.trade splitter" v="40% ETH · 0% token" hint="That splitter forwards the remainder upstream. It is their behaviour, not a bug here." />
              <Row k="Held by VladFeeSplit" v="100% · 100%" hint="Measured on a mainnet fork, not assumed." />
            </div>
            <Receipt
              cmd={`cast call ${FEE_SPLIT} \\\n  "treasury()(address)" \\\n  --rpc-url ${RPC}`}
              out={TREASURY}
              note="Set once in the constructor and declared immutable. There is no setter, so this address cannot be changed for the life of the contract."
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="liquidity" eyebrow="The guarantee" title="Liquidity">
            <p>
              The LP position is never in a person&apos;s wallet. It is held by a contract that
              exposes no call which removes principal, and fees are collected by decreasing
              liquidity by <span className="text-ink">zero</span> — so the principal has no route
              out at all. Not for the creator, not for us.
            </p>
            <TestReceipt
              name="test_liquidityCannotBePulled"
              asserts="Runs against live Robinhood Chain state: after repeated fee claims the position's liquidity is unchanged, it still belongs to the splitter, and no approval exists on it. Add a withdrawal path later and this test fails."
            />
            <p className="mt-2 text-ink">Stated at its real strength, not stronger:</p>
            <div className="card px-5 py-1">
              <Row k="Owner, admin, pause, upgrade, proxy" v="none" hint="No such function exists in any of the three contracts. Every privileged address is immutable and fixed at deployment." />
              <Row k="Access control" v="exists" hint="Not a role system, but real: register() is callable only by the strategy, and unlockCallback() only by the PoolManager. Both are immutable-address checks." />
              <Row k="Contracts outside this repo" v="not covered" hint="A launch that locks its position with pools.trade's vault hands custody to their contracts. Their admin and upgrade properties are theirs, not ours, and this guarantee says nothing about them." />
            </div>
            <p className="text-[14px] text-ink-faint">
              Every token page on this site classifies its own custody from the chain and says which
              of these cases it is in — including telling you when it cannot prove it.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="graduation" eyebrow="Mechanics" title="Graduation">
            <p>
              A curve ends at <span className="text-ink">$50,000 fully-diluted value</span>. At that
              point trading moves into a normal pool and the token is out of the curve for good.
            </p>
            <p>
              The launchpad API reports this as{" "}
              <span className="num text-ink">graduationProgress</span>, and it is a multiple of the
              threshold, not a percentage of it: <span className="num text-ink">1.0</span> is the
              line, <span className="num text-ink">0.84</span> is 84% of the way, and{" "}
              <span className="num text-ink">20</span> means the token graduated a long time ago.
            </p>
            <Receipt
              label="Why we are sure"
              cmd={`graduationProgress === fdvUsd / graduationTargetUsd   # 100 of 100 rows\ngraduationTargetUsd === 50000                        # every row\n\nliquidity / fdv, below 1.0x  →  median 1.008   (81 rows)\nliquidity / fdv, above 1.0x  →  median 0.377   (19 rows)`}
              note="Liquidity roughly equal to FDV is the signature of a whole supply sitting in one single-sided curve position; a fraction of FDV is a migrated pool. That break is a regime change, not a gradient, and it lands exactly on 1.0. The API's own status field disagreed on 17 of those rows, so the ratio is what this site trusts."
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="contracts" eyebrow="Verify" title="Contracts">
            <p>
              All three are source-verified on Blockscout. Read them there rather than taking this
              page&apos;s word for what they do.
            </p>
            <div className="card px-5 py-1">
              <Row k="VladStrategy" v={<CopyAddress address={STRATEGY} />} hint="Opens the pool at your chosen fee and mints the position. Also the registry — every launch emits TokenLaunched from here." />
              <Row k="VladFeeSplit" v={<CopyAddress address={FEE_SPLIT} />} hint="Holds the fee claim and splits every payout 75/25. No owner, no withdrawal." />
              <Row k="VladLaunchRouter" v={<CopyAddress address={ROUTER} />} hint="Launch plus opening buy in one transaction." />
            </div>
            <Receipt
              label="Confirm they are live"
              cmd={`cast code ${STRATEGY} \\\n  --rpc-url ${RPC} | head -c 20`}
              note="Empty output means no contract at that address. Deployed is not the same as used — the board tells you which tokens actually came through it."
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="limits" eyebrow="Read this part" title="What this cannot do">
            <p className="text-ink">
              The contracts are unaudited. The fork suite passes against real mainnet state, which
              proves the flow works. It does not prove the code is safe. Launch small first.
            </p>
            <div className="card px-5 py-1">
              <Row
                k="Pool fee cannot always be proven"
                v="hooks"
                hint="This site recovers a pool's fee by brute-forcing its PoolKey from the pool id. That is impossible when a pool uses a hook, and most do. Where it cannot be proven, the token page says unknown rather than guessing."
              />
              <Row
                k="Market data is second-hand"
                v="pools.trade"
                hint="Prices, volume, and holder counts are read from the public pools.trade API. When it is unreachable the site shows a degraded state rather than something stale. Custody and contract facts come from the chain and are unaffected."
              />
              <Row
                k="The feed is capped"
                v="100 rows"
                hint="Totals shown on the front page are computed over the launches the feed returns, not over every token that has ever existed on this chain."
              />
              <Row
                k="A locked pool is not a safe token"
                v="—"
                hint="Locked liquidity stops one specific attack. It does nothing about a token nobody wants to buy."
              />
            </div>
            <p className="text-[14px] leading-relaxed text-ink-faint">
              Bonding-curve tokens can go to zero, and most do. Nothing here is advice.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <div className="card flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="display text-2xl text-ink">Read the source instead</h2>
              <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink-dim">
                Every claim above is a sentence. The contracts are the actual answer.
              </p>
            </div>
            <a
              href="https://github.com/vladlaunch/vladlaunch-pools-trade"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:border-mint hover:text-mint"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
