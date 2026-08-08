import { defineChain } from "viem";

/** Robinhood Chain mainnet — Arbitrum Orbit, settles to Ethereum, blob DA. No native token. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/**
 * Contracts read off a live launch tx on 2026-08-07 (FRONG,
 * tx 0xbe6b90c5…8f35c) — not from docs, not from a blog post.
 *
 *   LAUNCHPAD   the address a creator calls. Entry is multicall(bytes[]) 0xac9650d8,
 *               wrapping token-create (0xdec14be1) + pool-launch (0xb6982b48).
 *   TOKEN_IMPL  deployer/impl referenced as the first arg of the create call.
 *   CURVE       reports poolManager() → the canonical v4 PoolManager below.
 *
 * None of the three are source-verified on Blockscout yet, so the create flow in
 * /create builds its calldata from these observed selectors rather than an ABI we
 * were handed. Verify before shipping a mainnet write path — see RECON.md.
 */
export const CONTRACTS = {
  LAUNCHPAD: "0x00004c4ccc709ef590f7c81102c0689f0263d4e9",
  TOKEN_IMPL: "0x000000e200088d55c39a11f609e5f667729ad49b",
  CURVE: "0x60d73b21cdf2ea846ab3d58699bbbb8f29d72491",
  POOL_MANAGER: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
} as const;

/**
 * Custody addresses, read off a live launch receipt (TES, tx 0x9702b5f3…04cb).
 * FEE_SPLITTER ends up holding the Uniswap v4 position NFT; BENEFICIARY_VAULT mints
 * the "Fee Beneficiary" (FEEB) NFT that entitles its holder to the pool fees.
 * A launch that sends the position anywhere else has left the creator able to pull
 * liquidity — which is exactly what /token shows.
 */
export const CUSTODY = {
  FEE_SPLITTER: "0x7198c32a497c09497e04c86cf8f77a244a9e4b8f",
  BENEFICIARY_VAULT: "0x587d2fdddf14f6f84022b51e8c3a473eb88c4544",
  POSITION_MANAGER: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
} as const;

/**
 * `TokenLaunched(PoolId indexed, address indexed token, address indexed recipient, PoolKey)`
 * — emitted by the official strategy and deliberately mirrored by custom ones, so one
 * topic covers both. The third topic is the final holder of the LP position.
 */
export const TOKEN_LAUNCHED_TOPIC =
  "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4";

/**
 * The only contracts whose `TokenLaunched` we treat as proof of custody.
 *
 * The event signature is public, so any contract can emit one naming any recipient.
 * Accepting an unfiltered log would let a creator mint a green "liquidity is locked"
 * badge for a token whose LP position is sitting in their own wallet — the badge would
 * be worth exactly nothing, and worse than nothing, because people would trust it.
 *
 * Verified emitters, swept from the full history of the topic on 2026-08-08:
 * the five official pools.trade strategies plus ours.
 */
export const TRUSTED_STRATEGIES: readonly string[] = [
  "0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491",
  "0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2",
  "0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00",
  "0x583a7903152b95831e82ffF534448Dee081754ec",
  "0xD8861C07a590A1F1775faF9E7732aF3eabb5B114",
];

/** Measured 2026-08-07: 18,909 blocks in 1,893s. Used only to bracket a log scan. */
export const BLOCK_TIME_MS = 100;

export const explorer = {
  address: (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`,
  tx: (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`,
  token: (a: string) => `https://robinhoodchain.blockscout.com/token/${a}`,
};
