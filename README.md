# VladLaunch

A launchpad and trading surface for [Robinhood Chain](https://robinhoodchain.blockscout.com)
(chain id `4663`), built on top of Uniswap's `LiquidityLauncher` — the same entry contract
pools.trade uses — with a **launcher-chosen pool fee** and an **atomic opening buy**.

Tokens launched here are Uniswap's own UERC20, created by Uniswap's own factory, trading
in a Uniswap v4 pool. Only the distribution step is ours.

## What is different here

| | Official launch | VladLaunch |
|---|---|---|
| Pool fee | 0.25%, hardcoded | 0.25% – 5%, chosen per launch |
| Opening buy | separate transaction | **same transaction as the launch** |
| Fee recipient | the creator | 75% creator / 25% protocol |
| LP position | held by the pools.trade fee splitter | held by a contract with no withdrawal path |

Nobody who launches here can pull the liquidity. Not because of a policy — because the
position is never in a person's wallet, and the contract that does hold it exposes no
call that removes principal. Fees are collected by decreasing liquidity by **zero**, so
the principal has no route out at all.

`test_liquidityCannotBePulled` asserts this against live chain state: after repeated
claims the position's liquidity is unchanged, it still belongs to the splitter, and no
approval exists on it. Add a withdrawal path later and that test fails.

## Contracts

| Contract | Purpose |
|---|---|
| `VladStrategy` | Distribution strategy for `LiquidityLauncher`. Opens the v4 pool at the chosen fee and mints the single-sided position. |
| `VladLaunchRouter` | Launch plus an opening buy in one transaction, so no bot can get in between. |
| `VladFeeSplit` | Holds the fee claim, splits every payout 75/25, and is the launchpad's on-chain registry. |

### The strategy address is the registry

`TokenLaunched` is emitted **by the strategy contract**, so one query returns the complete
catalogue and nothing else:

```
eth_getLogs({ address: <VladStrategy>, topics: [TokenLaunched] })
```

Deploy one strategy and never replace it. Switching splits the catalogue across two
addresses with no way to merge them.

## What the fee actually pays

Measured on a mainnet fork, not assumed. A v4 pool charges its fee on the **input** side of
each swap, so buys pay in ETH and sells pay in the token; the two-sided pile only appears
once volume goes both ways.

Where the position ends up decides how much of that survives:

| LP position custody | Fee reaching the launchpad |
|---|---|
| pools.trade fee splitter | **40%** of the ETH side, **0%** of the token side |
| `VladFeeSplit` (ours) | **100%** of both |

The pools.trade splitter forwards the remainder to `0x666DA634…be9b`. That is upstream
behaviour, not a bug in this repo, and `test_compare_custodyRoutes` measures it on every run.

## Layout

```
contracts/          Foundry project
  src/              the three contracts above
  test/             fork tests against live Robinhood Chain state
  script/Deploy     deploys all three, wired together
web/                Next.js 16 app — explore, board, token pages, launch wizard,
                    creator claim, treasury view
```

## Running it

```bash
# contracts
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts
forge build
forge test --fork-url https://rpc.mainnet.chain.robinhood.com --match-path "*LaunchAndBuy*" -vv

# web
cd web && pnpm install && pnpm dev
```

Copy `web/.env.example` to `web/.env.local` and fill it in. There is no private key in it,
and there should never be one: launches are signed by the visitor's own wallet in the
browser, so the server holds nothing worth stealing.

### Fees, and who can touch them

`VladFeeSplit` has no owner, no admin function and no withdrawal. The treasury address is
set once at deploy time and cannot be changed afterwards.

Claiming is permissionless: anyone may call it, and it always pays the same two addresses
— 75% to the launch's creator, 25% to the treasury — in the same transaction. `/claim`
does this for a creator's own launches, `/admin` does it across all of them. Neither page
has an ability the chain does not already give every wallet.

### Deploying

```bash
TREASURY=0xYourTreasury forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --broadcast --legacy --gas-estimate-multiplier 300 --interactive
```

`--interactive` prompts for the key rather than reading an environment variable, which
would otherwise end up in shell history. Robinhood Chain needs `--legacy` and a generous
gas multiplier or the deploy runs out of gas.

## Status

The contracts are **unaudited**. The fork suite passes against real mainnet state, which
proves the flow works — it does not prove the code is safe. Launch small first.

## License

MIT
