import { parseAbiItem, type Address } from "viem";

/**
 * VladFeeSplit — the contract that holds every launch's LP position and pays fees out
 * 75/25. It is also the launchpad's registry: `Registered` carries the creator as an
 * indexed topic, so one log query returns everything a given wallet has launched.
 */

export const FEE_SPLIT_ABI = [
  {
    type: "function",
    name: "claimDirect",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "creatorOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "PROTOCOL_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "creatorEth", type: "uint256", indexed: false },
      { name: "creatorToken", type: "uint256", indexed: false },
      { name: "protocolEth", type: "uint256", indexed: false },
      { name: "protocolToken", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Uniswap v4 PositionManager — reads what a position has earned but not yet paid out. */
export const POSM_ABI = [
  {
    type: "function",
    name: "getPositionLiquidity",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint128" }],
  },
] as const;

export type LaunchRow = {
  tokenId: bigint;
  token: Address;
  symbol: string;
  name: string;
  imageUrl: string | null;
  feePct: number | null;
  /** Cumulative, from Claimed events — what this wallet has already been paid. */
  claimedEth: bigint;
  claimedToken: bigint;
};

export const CREATOR_SHARE_BPS = 7500;

/** Standalone event items so viem can type `getLogs` args instead of erasing them. */
export const REGISTERED_EVENT = parseAbiItem(
  "event Registered(uint256 indexed tokenId, address indexed creator, address indexed token)",
);
export const CLAIMED_EVENT = parseAbiItem(
  "event Claimed(uint256 indexed tokenId, address indexed creator, uint256 creatorEth, uint256 creatorToken, uint256 protocolEth, uint256 protocolToken)",
);

export const ERC20_SYMBOL_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
