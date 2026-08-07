"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeEventLog, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import {
  LAUNCHER,
  LAUNCHER_ABI,
  UERC20_FACTORY,
  UERC20_FACTORY_ABI,
  CUSTOM_STRATEGY,
  launchConfigMissing,
  SUPPLY,
  DECIMALS,
  FEE_PRESETS,
  DYNAMIC_FEE_FLAG,
  MAX_FEE,
  ZERO_ADDRESS,
  LAUNCH_ROUTER,
  ROUTER_ABI,
  poolKeyFor,
  graffitiFor,
  encodeMetadata,
  buildConfigData,
  validateSettings,
  launchSalt,
  feeLabel,
  roundTrip,
} from "@/lib/launchpad";
import { ConnectButton } from "./ConnectButton";
import { ImageUpload, type PinnedImage } from "./ImageUpload";
import { robinhoodChain } from "@/lib/chain";
import { usd, compact } from "@/lib/format";

/* Four steps because there are genuinely four decisions: what the token is, who can
   find it, what it costs to trade, and whether to send it. Fee comes before the
   review on purpose — it is the one setting that cannot be changed afterwards. */

type Draft = {
  name: string;
  symbol: string;
  description: string;
  xUrl: string;
  website: string;
};

const EMPTY: Draft = {
  name: "",
  symbol: "",
  description: "",
  xUrl: "",
  website: "",
};

const STEPS = ["Identity", "Links", "Fee", "First buy", "Review"] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink">{label}</span>
      {children}
      {hint && <span className="text-[12px] leading-relaxed text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-panel/60 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-mint/60 focus:outline-none";

export function CreateWizard() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();

  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [image, setImage] = useState<PinnedImage>(null);
  const [fee, setFee] = useState<number>(2500);
  const [customFee, setCustomFee] = useState("");
  const [hooks, setHooks] = useState("");
  const [devBuyEth, setDevBuyEth] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const hooksAddr = (/^0x[a-fA-F0-9]{40}$/.test(hooks) ? hooks : ZERO_ADDRESS) as Address;

  const settings = useMemo(
    () => ({
      feeRecipient: (address ?? ZERO_ADDRESS) as Address,
      fee,
      hooks: hooksAddr,
    }),
    [address, fee, hooksAddr],
  );

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = "Give the token a name.";
    else if (d.name.length > 32) e.name = "Keep the name under 32 characters.";
    if (!/^[A-Za-z0-9]{2,10}$/.test(d.symbol))
      e.symbol = "Tickers are 2–10 letters or digits, no spaces or symbols.";
    if (d.xUrl && !/^https?:\/\/(x|twitter)\.com\/.+/i.test(d.xUrl))
      e.xUrl = "That isn't an x.com profile URL.";
    if (hooks && !/^0x[a-fA-F0-9]{40}$/.test(hooks)) e.hooks = "That isn't a contract address.";
    const s = validateSettings(settings);
    if (s) e.fee = s;
    if (devBuyEth) {
      const n = Number(devBuyEth);
      if (!Number.isFinite(n) || n < 0) e.devBuy = "Enter an amount in ETH, or leave it empty.";
      else if (n > 0 && !LAUNCH_ROUTER)
        e.devBuy = "This deployment has no router address set, so an opening buy is not available.";
    }
    return e;
  }, [d, hooks, settings]);

  const stepValid = [
    !errors.name && !errors.symbol,
    !errors.xUrl,
    !errors.fee && !errors.hooks,
    !errors.devBuy,
    Object.keys(errors).length === 0,
  ];

  const devBuyWei = (() => {
    const n = Number(devBuyEth);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * 1e18));
  })();

  // CREATE2 means the token address is knowable before it exists. Showing it up front
  // is also the cheapest sanity check that the factory agrees with our arguments.
  const { data: predicted } = useReadContract({
    address: UERC20_FACTORY,
    abi: UERC20_FACTORY_ABI,
    functionName: "getUERC20Address",
    args: address
      ? [d.name, d.symbol, DECIMALS, LAUNCHER, graffitiFor(address)]
      : undefined,
    query: { enabled: Boolean(address && d.name && d.symbol) },
  });

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { data: receipt, isLoading: mining } = useWaitForTransactionReceipt({ hash: txHash });

  // The launch is confirmed by TokenDistributed, not by the tx succeeding: a token can
  // mint and still fail to get a pool. Only the event proves liquidity exists.
  const launchedToken = useMemo(() => {
    if (!receipt) return null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== LAUNCHER.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: LAUNCHER_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "TokenDistributed") {
          return (ev.args as { tokenAddress: Address }).tokenAddress;
        }
      } catch {
        /* other event from the same contract */
      }
    }
    return null;
  }, [receipt]);

  /** Build the two launcher calls. Shared by the quote and the real send. */
  const buildCalls = useCallback(async () => {
    if (!publicClient) return null;
    // The launcher derives graffiti from ITS OWN caller — createToken takes no graffiti
    // argument. Routing through the router therefore salts the token address with the
    // router, not the creator, and predicting with the wrong one produces an address
    // the launch never creates.
    const salter = (devBuyWei > 0n ? LAUNCH_ROUTER : address) as Address;
    const token = (await publicClient.readContract({
      address: UERC20_FACTORY,
      abi: UERC20_FACTORY_ABI,
      functionName: "getUERC20Address",
      args: [d.name, d.symbol, DECIMALS, LAUNCHER, graffitiFor(salter)],
    })) as Address;

    const tokenData = encodeMetadata({
      description: d.description,
      website: d.xUrl || d.website,
      image: image?.uri ?? "",
    });

    const { encodeFunctionData } = await import("viem");
    const createCall = encodeFunctionData({
      abi: LAUNCHER_ABI,
      functionName: "createToken",
      args: [UERC20_FACTORY, d.name, d.symbol, DECIMALS, SUPPLY, LAUNCHER, tokenData],
    });
    // Unreachable unless configured — the component returns early when it is not.
    if (!CUSTOM_STRATEGY) throw new Error("No launch strategy configured.");
    const strategy = CUSTOM_STRATEGY as Address;

    const distributeCall = encodeFunctionData({
      abi: LAUNCHER_ABI,
      functionName: "distributeToken",
      args: [
        token,
        {
          strategy,
          amount: SUPPLY,
          configData: buildConfigData(strategy, settings),
        },
        launchSalt(address!, d.symbol),
      ],
    });

    return { token, calls: [createCall, distributeCall] as `0x${string}`[] };
  }, [publicClient, address, d, image, settings, devBuyWei]);

  /**
   * Ask the chain what the opening buy would return. Simulating the real call is exact
   * — no client-side curve maths to drift out of sync with the contract — and it is
   * also a full dry run of the launch, so a launch that would revert says so here.
   */
  const runQuote = useCallback(async () => {
    if (!publicClient || !address || devBuyWei === 0n || !LAUNCH_ROUTER) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    setSimError(null);
    try {
      const built = await buildCalls();
      if (!built) return;
      const { result } = await publicClient.simulateContract({
        address: LAUNCH_ROUTER,
        abi: ROUTER_ABI,
        functionName: "launchAndBuy",
        args: [built.calls, poolKeyFor(built.token, fee, hooksAddr), 0n],
        value: devBuyWei,
        account: address,
      });
      setQuote(result as bigint);
    } catch (err) {
      setQuote(null);
      setSimError(
        err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "Quote failed.",
      );
    } finally {
      setQuoting(false);
    }
  }, [publicClient, address, devBuyWei, buildCalls, fee, hooksAddr]);

  async function launch() {
    if (!address || !publicClient) return;
    setBusy(true);
    setSimError(null);
    try {
      const built = await buildCalls();
      if (!built) return;

      if (devBuyWei > 0n) {
        if (!LAUNCH_ROUTER) throw new Error("No router configured for the opening buy.");
        const key = poolKeyFor(built.token, fee, hooksAddr);

        // Simulate to learn the exact output, then require 99% of it. The launch and the
        // buy are one transaction so nothing can trade in between, but a slippage floor
        // still catches a pool that did not open the way we expected.
        const { result } = await publicClient.simulateContract({
          address: LAUNCH_ROUTER,
          abi: ROUTER_ABI,
          functionName: "launchAndBuy",
          args: [built.calls, key, 0n],
          value: devBuyWei,
          account: address,
        });
        const minOut = ((result as bigint) * 99n) / 100n;

        const hash = await writeContractAsync({
          address: LAUNCH_ROUTER,
          abi: ROUTER_ABI,
          functionName: "launchAndBuy",
          args: [built.calls, key, minOut],
          value: devBuyWei,
        });
        setTxHash(hash);
        return;
      }

      // No opening buy: talk to the launcher directly and skip the router entirely.
      await publicClient.simulateContract({
        address: LAUNCHER,
        abi: LAUNCHER_ABI,
        functionName: "multicall",
        args: [built.calls],
        account: address,
      });
      const hash = await writeContractAsync({
        address: LAUNCHER,
        abi: LAUNCHER_ABI,
        functionName: "multicall",
        args: [built.calls],
      });
      setTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimError(msg.split("\n")[0].slice(0, 220));
    } finally {
      setBusy(false);
    }
  }

  const missingConfig = launchConfigMissing();

  if (missingConfig.length > 0) {
    return (
      <div className="card mt-10 border-warn/40 p-6">
        <div className="label !text-warn">Launching is not available here</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          This deployment has no launch contracts configured, so the form will not build a
          transaction. Deploying without them would create real tokens through an address
          nobody chose.
        </p>
        <p className="num mt-3 text-[12px] text-ink-faint">Missing: {missingConfig.join(", ")}</p>
      </div>
    );
  }

  if (launchedToken) {
    return (
      <div className="card mt-10 p-8">
        <h2 className="display text-3xl text-ink">${d.symbol} is live.</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          The pool exists and the liquidity is in it. Trading is open to anyone from this block.
        </p>
        <p className="num mt-4 break-all text-[12px] text-muted">{launchedToken}</p>
        <button
          onClick={() => router.push(`/token/${launchedToken}`)}
          className="mt-6 rounded-full bg-mint px-5 py-2.5 text-sm font-medium text-deep transition-colors hover:bg-mint-dim"
        >
          Open the token page
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                step === i ? "bg-line/60 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span className={`num ${step === i ? "text-mint" : ""}`}>{i + 1}</span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-line" />}
          </li>
        ))}
      </ol>

      <div className="card mt-6 p-6">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <Field label="Name" hint="Written into the token contract. It can never be changed.">
              <input
                className={inputCls}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Frog Dynasty"
                maxLength={40}
              />
            </Field>
            {errors.name && d.name.length > 0 && (
              <p className="-mt-3 text-[12px] text-down">{errors.name}</p>
            )}

            <Field label="Ticker" hint="2–10 characters. Shown everywhere with a $ in front.">
              <input
                className={`${inputCls} num uppercase`}
                value={d.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase().slice(0, 10))}
                placeholder="FROG"
              />
            </Field>
            {errors.symbol && d.symbol.length > 0 && (
              <p className="-mt-3 text-[12px] text-down">{errors.symbol}</p>
            )}

            <Field label="Description" hint="Two lines show on the card. The rest shows on the token page.">
              <textarea
                className={`${inputCls} h-24 resize-none py-2.5 leading-relaxed`}
                value={d.description}
                onChange={(e) => set("description", e.target.value.slice(0, 280))}
                placeholder="What is this and why should anyone hold it?"
              />
            </Field>

            <ImageUpload value={image} onChange={setImage} />
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <Field
              label="X profile"
              hint="Traders filter on this. An unlinked launch gets skipped."
            >
              <input
                className={inputCls}
                value={d.xUrl}
                onChange={(e) => set("xUrl", e.target.value)}
                placeholder="https://x.com/yourhandle"
              />
            </Field>
            {errors.xUrl && <p className="-mt-3 text-[12px] text-down">{errors.xUrl}</p>}

            <Field label="Website" hint="Optional.">
              <input
                className={inputCls}
                value={d.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="text-[13px] text-ink">Swap fee</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
                Charged on every buy and every sell, and paid to you. It is fixed into the pool at
                launch and cannot be changed afterwards.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {FEE_PRESETS.map((p) => (
                  <button
                    key={p.fee}
                    onClick={() => {
                      setFee(p.fee);
                      setCustomFee("");
                    }}
                    aria-pressed={fee === p.fee}
                    className={`num rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      fee === p.fee
                        ? "border-mint bg-mint text-deep"
                        : "border-line text-ink-dim hover:border-line-hi hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setFee(DYNAMIC_FEE_FLAG)}
                  aria-pressed={fee === DYNAMIC_FEE_FLAG}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    fee === DYNAMIC_FEE_FLAG
                      ? "border-mint bg-mint text-deep"
                      : "border-line text-ink-dim hover:border-line-hi hover:text-ink"
                  }`}
                >
                  Dynamic
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-[12px] text-muted">Or set your own</span>
                  <input
                    className={`${inputCls} num h-9 w-28`}
                    value={customFee}
                    onChange={(e) => {
                      setCustomFee(e.target.value);
                      const pctVal = Number(e.target.value);
                      if (Number.isFinite(pctVal)) setFee(Math.round(pctVal * 10_000));
                    }}
                    placeholder="%"
                    inputMode="decimal"
                  />
                </label>
                <span className="text-[12px] text-ink-faint">Capped at {MAX_FEE / 10_000}%.</span>
              </div>

              <div className="mt-4 rounded-lg border border-line bg-panel/50 p-4">
                {fee === DYNAMIC_FEE_FLAG ? (
                  <p className="text-[13px] leading-relaxed text-ink-dim">
                    A dynamic pool has no fee of its own — a hook contract sets one per swap.
                    That hook has to exist before the pool does.
                  </p>
                ) : (
                  <p className="text-[13px] leading-relaxed text-ink-dim">
                    <span className="num text-ink">{feeLabel(fee)}</span> per swap ·{" "}
                    <span className="num text-ink">{roundTrip(fee)?.toFixed(2)}%</span> to buy and
                    sell once
                    {fee > 2500 && (
                      <>
                        {" "}
                        · <span className="text-warn">{(fee / 2500).toFixed(0)}× the standard rate</span>
                      </>
                    )}
                    . Your own board will show this number on the token.
                  </p>
                )}
              </div>
            </div>

            <Field
              label={`Hook contract${fee === DYNAMIC_FEE_FLAG ? "" : " (optional)"}`}
              hint="A Uniswap v4 hook to attach to the pool. Required for a dynamic fee."
            >
              <input
                className={`${inputCls} num`}
                value={hooks}
                onChange={(e) => setHooks(e.target.value.trim())}
                placeholder="0x0000000000000000000000000000000000000000"
              />
            </Field>
            {(errors.hooks || errors.fee) && (
              <p className="-mt-3 text-[12px] text-down">{errors.hooks ?? errors.fee}</p>
            )}

            <div className="border-t border-line/60 pt-5">
              <div className="text-[13px] text-ink">Liquidity</div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">
                Your LP position is held by a contract that has no way to move it and no way
                to reduce it. Fees are collected by withdrawing zero liquidity, so the
                principal cannot leave. Nobody can pull it — you included. Every launch here
                works this way, which is what makes it worth saying.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                You still collect the fees: 75% to you, 25% to the protocol, claimable any
                time from the Claim page.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <Field
              label="Your opening buy (ETH)"
              hint="Spent in the same transaction as the launch, before the pool is open to anyone else. Leave it empty to buy nothing."
            >
              <input
                className={`${inputCls} num`}
                value={devBuyEth}
                onChange={(e) => {
                  setDevBuyEth(e.target.value);
                  setQuote(null);
                }}
                placeholder="0.0"
                inputMode="decimal"
              />
            </Field>
            {errors.devBuy && <p className="-mt-3 text-[12px] text-down">{errors.devBuy}</p>}

            <p className="-mt-2 text-[12px] leading-relaxed text-ink-dim">
              There is no block between the launch and this buy, so no bot can get in
              first. That is the only reason it goes through a router at all.
            </p>

            {devBuyWei > 0n && (
              <div className="rounded-lg border border-line bg-panel/50 p-4">
                {!isConnected ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13px] text-ink-dim">
                      Connect a wallet to price the buy.
                    </span>
                    <ConnectButton />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={runQuote}
                      disabled={quoting}
                      className="rounded-full border border-line px-3.5 py-1.5 text-[12px] text-ink transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
                    >
                      {quoting ? "Asking the chain…" : quote == null ? "Price this buy" : "Re-price"}
                    </button>

                    {quote != null && (
                      <div className="mt-4">
                        <div className="num text-2xl text-ink">
                          {compact(Number(quote) / 1e18)} ${d.symbol || "TOKEN"}
                        </div>
                        <div className="num mt-1 text-[13px] text-mint">
                          {((Number(quote) / 1e18 / 1_000_000_000) * 100).toFixed(2)}% of supply
                        </div>
                        <p className="mt-3 text-[12px] leading-relaxed text-ink-dim">
                          Simulated against the live chain, not estimated. Buyers can see this
                          transaction, and how much of the supply a creator opened with is the
                          first thing anyone checks before sizing a position.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                { k: "Name", v: d.name || "—" },
                { k: "Ticker", v: d.symbol ? `$${d.symbol}` : "—" },
                { k: "Supply", v: "1,000,000,000" },
                { k: "Swap fee", v: feeLabel(fee) },
                { k: "Quote asset", v: "ETH" },
                { k: "Graduates at", v: `${usd(5_000_000)} FDV` },
                { k: "LP position", v: "Locked, unpullable" },
                {
                  k: "Opening buy",
                  v: devBuyWei > 0n ? `${devBuyEth} ETH` : "None",
                },
                { k: "Hook", v: hooksAddr === ZERO_ADDRESS ? "None" : hooks },
              ].map((r) => (
                <div key={r.k} className="border-b border-line/50 pb-2">
                  <dt className="label">{r.k}</dt>
                  <dd className="num mt-1 break-all text-[13px] text-ink">{r.v}</dd>
                </div>
              ))}
            </dl>

            {predicted && (
              <div className="rounded-lg border border-line bg-panel/50 p-4">
                <div className="label">Token address</div>
                <p className="num mt-1.5 break-all text-[13px] text-mint">{predicted as string}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                  Computed by the factory before deployment. Change the name or ticker and this
                  changes too.
                </p>
              </div>
            )}


            {simError && (
              <div className="rounded-lg border border-down/40 bg-down/5 p-4">
                <div className="text-[13px] text-down">The launch would fail.</div>
                <p className="num mt-1.5 break-words text-[12px] leading-relaxed text-ink-dim">
                  {simError}
                </p>
              </div>
            )}

            {!isConnected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-ink-dim">Connect a wallet to launch.</span>
                <ConnectButton />
              </div>
            ) : chainId !== robinhoodChain.id ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-warn">Wrong network.</span>
                <ConnectButton />
              </div>
            ) : (
              <button
                onClick={launch}
                disabled={!stepValid[4] || busy || mining || Boolean(txHash)}
                className="self-start rounded-full bg-mint px-6 py-2.5 text-sm font-medium text-deep transition-colors hover:bg-mint-dim disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              >
                {busy
                  ? "Check your wallet"
                  : mining
                    ? "Launching…"
                    : `Launch $${d.symbol || "TOKEN"}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Preview — what the token will look like in the feed, updated as you type. */}
      <div className="mt-8">
        <div className="label">Preview</div>
        <div className="card mt-3 flex items-start gap-3 p-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- freshly pinned CID
            <img src={image.previewUrl} alt="" className="size-11 rounded-lg object-cover" />
          ) : (
            <div className="grid size-11 place-items-center rounded-lg bg-line/60 text-[10px] text-ink-faint">
              no art
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] text-ink">{d.name || "Untitled token"}</div>
            <div className="num mt-0.5 text-[11px] text-muted">
              ${d.symbol || "TICKER"} · just now
            </div>
            {d.description && (
              <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ink-faint">
                {d.description}
              </p>
            )}
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-[15px] text-ink">$1K</div>
            <div className="text-[11px] text-muted">{feeLabel(fee)} fee</div>
          </div>
        </div>
      </div>

      {step < STEPS.length - 1 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="rounded-full border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-line-hi"
            >
              Back
            </button>
          )}
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid[step]}
            className="rounded-full bg-mint px-5 py-2 text-sm font-medium text-deep transition-colors hover:bg-mint-dim disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            Continue
          </button>
        </div>
      )}
      {step === STEPS.length - 1 && (
        <button
          onClick={() => setStep((s) => s - 1)}
          className="mt-8 rounded-full border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-line-hi"
        >
          Back
        </button>
      )}
    </div>
  );
}
