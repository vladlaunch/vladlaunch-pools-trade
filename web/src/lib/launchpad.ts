import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";

/**
 * Launch path for Robinhood Chain, ported from the working SDK launcher rather than
 * reconstructed from decoded calldata. Every address below was verified on-chain.
 *
 * One atomic transaction to LiquidityLauncher:
 *
 *   graffiti  = keccak256(abi.encode(creatorEOA))
 *   predicted = UERC20Factory.getUERC20Address(name, symbol, 18, LAUNCHER, graffiti)
 *   multicall([
 *     createToken(factory, name, symbol, 18, supply, recipient = LAUNCHER, tokenData),
 *     distributeToken(predicted, { strategy, amount: supply, configData }, salt),
 *   ])
 *
 * `recipient` must be the launcher, not the creator — the second call pulls the supply
 * out of the launcher into the strategy. Both calls sit in the same multicall, so no
 * one else can wedge themselves in between.
 */

export const LAUNCHER: Address = "0x00004c4ccc709Ef590F7C81102C0689F0263D4e9";
export const UERC20_FACTORY: Address = "0x000000e200088D55C39a11F609E5F667729ad49b";

/**
 * The official strategies hardcode fee = 2500 / tickSpacing = 60 / no hook, and their
 * configData is a single address. They cannot carry a custom fee — that is the whole
 * reason CustomFeeStrategy exists. Kept as a literal list: deriving it from the
 * configured strategy would make a custom strategy test as "official" and silently
 * send the old configData shape, producing a 0.25% pool while the UI claimed otherwise.
 */
export const OFFICIAL_STRATEGIES: readonly Address[] = [
  "0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491",
  "0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2",
  "0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00",
  "0x583a7903152b95831e82ffF534448Dee081754ec",
  "0xD8861C07a590A1F1775faF9E7732aF3eabb5B114",
];

/** Our own CustomFeeStrategy. One contract serves every fee — fee rides in configData. */
export const CUSTOM_STRATEGY = (process.env.NEXT_PUBLIC_STRATEGY ??
  "0x544ef36801e90ee56bcd699ed51a63cfceac8ec9") as Address;

export function isOfficialStrategy(s: Address) {
  return OFFICIAL_STRATEGIES.some((o) => o.toLowerCase() === s.toLowerCase());
}

/**
 * Pool geometry, taken from the Initialize + ModifyLiquidity events of a real launch.
 * currency0 is native ETH and currency1 is the token, so price is token-per-ETH:
 * it starts high (token cheap) and falls as people buy. startTick is the top of the
 * range, which puts the whole position below spot — 100% token, no ETH to deposit.
 */
export const GEOMETRY = { startTick: 198060, tickLower: -208980, tickSpacing: 60 } as const;

export const SUPPLY = 1_000_000_000n * 10n ** 18n;
export const DECIMALS = 18;

/** v4 marks a dynamic-fee pool with this sentinel instead of a fixed rate. */
export const DYNAMIC_FEE_FLAG = 0x800000;

/** Hard ceiling for this interface. The contract also rejects anything unreasonable. */
export const MAX_FEE = 50_000; // 5%

export const FEE_PRESETS = [
  { fee: 2500, label: "0.25%", note: "What every official launch charges." },
  { fee: 10_000, label: "1%", note: "Four times the standard rate." },
  { fee: 30_000, label: "3%", note: "Twelve times standard — 5.9% to buy and sell once." },
  { fee: 50_000, label: "5%", note: "The ceiling here — 9.75% round trip." },
] as const;

/* --------------------------------------------------------------------- ABIs */

export const LAUNCHER_ABI = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    type: "function",
    name: "createToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "factory", type: "address" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "initialSupply", type: "uint128" },
      { name: "recipient", type: "address" },
      { name: "tokenData", type: "bytes" },
    ],
    outputs: [{ name: "tokenAddress", type: "address" }],
  },
  {
    type: "function",
    name: "distributeToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      {
        name: "distribution",
        type: "tuple",
        components: [
          { name: "strategy", type: "address" },
          { name: "amount", type: "uint128" },
          { name: "configData", type: "bytes" },
        ],
      },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "TokenDistributed",
    inputs: [
      { name: "tokenAddress", type: "address", indexed: true },
      { name: "strategy", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const UERC20_FACTORY_ABI = [
  {
    type: "function",
    name: "getUERC20Address",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "creator", type: "address" },
      { name: "graffiti", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * Token metadata must encode as ONE tuple, not four loose parameters — the leading
 * 0x20 offset word matters. Without it the factory's abi.decode reads a nonsense
 * offset and reverts with Panic(0x41), "allocated too much memory".
 */
const METADATA_PARAMS = [
  {
    type: "tuple",
    name: "metadata",
    components: [
      { name: "description", type: "string" },
      { name: "website", type: "string" },
      { name: "image", type: "string" },
      { name: "extraData", type: "bytes" },
    ],
  },
] as const;

const CUSTOM_CONFIG_PARAMS = [
  {
    type: "tuple",
    name: "config",
    components: [
      { name: "feeRecipient", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "startTick", type: "int24" },
      { name: "tickLower", type: "int24" },
      { name: "hooks", type: "address" },
      { name: "lockPosition", type: "bool" },
    ],
  },
] as const;

/* ------------------------------------------------------------------ builders */

export function graffitiFor(creator: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }], [creator]));
}

export function encodeMetadata(input: {
  description?: string;
  website?: string;
  image?: string;
}): Hex {
  const image = input.image?.startsWith("ipfs://")
    ? `https://gateway.pinata.cloud/ipfs/${input.image.slice(7)}`
    : (input.image?.startsWith("http") ? input.image : "");
  return encodeAbiParameters(METADATA_PARAMS, [
    {
      description: input.description ?? "",
      website: input.website ?? "",
      image,
      extraData: "0x",
    },
  ]);
}

export type LaunchSettings = {
  feeRecipient: Address;
  /** Fixed rate in millionths, or DYNAMIC_FEE_FLAG. */
  fee: number;
  hooks: Address;
};

/**
 * Custody is not a launch option on this pad.
 *
 * `false` tells the strategy to keep the LP position in VladFeeSplit instead of handing
 * it to the pools.trade splitter. That contract has no call which moves the position or
 * reduces liquidity — fees are collected by decreasing liquidity by zero — so nobody can
 * pull the liquidity, creator included. It also collects 100% of the fee on both sides
 * rather than the 40%/0% the pools.trade splitter forwards.
 *
 * Both facts are asserted in contracts/test: test_liquidityCannotBePulled and
 * test_compare_custodyRoutes.
 */
export const LOCK_POSITION = false;

/** VladFeeSplit — holds every position and pays out 75/25. */
export const FEE_SPLIT = (process.env.NEXT_PUBLIC_FEE_SPLIT ?? "") as Address | "";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * A dynamic-fee pool has no fee of its own — a hook sets it per swap. Initializing one
 * with hooks = address(0) leaves nothing to answer the pool manager, and the launch
 * reverts. Refuse here, where it costs nothing, rather than at the wallet.
 */
export function validateSettings(s: LaunchSettings): string | null {
  if (s.fee === DYNAMIC_FEE_FLAG) {
    if (s.hooks === ZERO_ADDRESS) {
      return "A dynamic-fee pool needs a hook contract to set the fee. Add one, or pick a fixed rate.";
    }
    return null;
  }
  if (!Number.isInteger(s.fee) || s.fee < 0) return "Fee must be a whole number.";
  if (s.fee > MAX_FEE) return `This interface caps the fee at ${MAX_FEE / 10_000}%.`;
  return null;
}

export function buildConfigData(strategy: Address, s: LaunchSettings): Hex {
  // Official strategies take a bare address and ignore everything else.
  if (isOfficialStrategy(strategy)) {
    return encodeAbiParameters([{ type: "address" }], [s.feeRecipient]);
  }
  return encodeAbiParameters(CUSTOM_CONFIG_PARAMS, [
    {
      feeRecipient: s.feeRecipient,
      fee: s.fee,
      tickSpacing: GEOMETRY.tickSpacing,
      startTick: GEOMETRY.startTick,
      tickLower: GEOMETRY.tickLower,
      hooks: s.hooks,
      lockPosition: LOCK_POSITION,
    },
  ]);
}

/** Salt only separates distributions inside the strategy; randomness is enough. */
export function launchSalt(creator: Address, symbol: string): Hex {
  return keccak256(toHex(`${creator}:${symbol}:${Date.now()}:${Math.random()}`));
}

export function feeLabel(fee: number) {
  if (fee === DYNAMIC_FEE_FLAG) return "dynamic";
  const p = fee / 10_000;
  return `${p < 1 ? p.toFixed(2) : String(Number(p.toFixed(2)))}%`;
}

export function roundTrip(fee: number) {
  if (fee === DYNAMIC_FEE_FLAG) return null;
  const f = fee / 1_000_000;
  return (1 - (1 - f) * (1 - f)) * 100;
}
