import { createPublicClient, http, type Address } from "viem";
import { robinhoodChain } from "./chain";

/**
 * Read a token's description, links and art straight from its own contract.
 *
 * Every UERC20 on this launchpad exposes `metadata()` returning
 * (description, website, image, extraData) — the exact struct written at creation.
 * Verified against both a launch made here and an official one.
 *
 * Why bother when the feed has these fields: the feed does not have them for a token
 * it has not finished indexing. A launch made thirty seconds ago comes back with an
 * empty description and no links, so the creator loads their own token page and finds
 * the X account they just entered missing. The chain has it from the first block.
 *
 * The feed still wins on anything the chain does not know — price, holders, volume.
 */

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(robinhoodChain.rpcUrls.default.http[0]),
});

const METADATA_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "metadata",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "description", type: "string" },
      { name: "website", type: "string" },
      { name: "image", type: "string" },
      { name: "extraData", type: "bytes" },
    ],
  },
] as const;

export type OnChainMeta = {
  name: string;
  symbol: string;
  description: string;
  website: string;
  image: string;
  /** X handle, when the creator attached a verification token at launch. */
  xHandle: string | null;
};

/** Official launches carry a signed X verification blob in extraData. */
function readXHandle(extraData: string): string | null {
  if (!extraData || extraData === "0x") return null;
  try {
    const bytes = extraData.slice(2).match(/.{2}/g);
    if (!bytes) return null;
    const text = String.fromCharCode(...bytes.map((b) => parseInt(b, 16)));
    const outer = JSON.parse(text) as { xVerificationToken?: string };
    const payload = outer.xVerificationToken?.split(".")[0];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      x_handle?: string;
    };
    return json.x_handle ?? null;
  } catch {
    // extraData is free-form; anything unparseable simply means no handle.
    return null;
  }
}

export async function readTokenMeta(token: Address): Promise<OnChainMeta | null> {
  try {
    const [meta, name, symbol] = await Promise.all([
      client.readContract({ address: token, abi: METADATA_ABI, functionName: "metadata" }) as Promise<
        [string, string, string, string]
      >,
      client.readContract({ address: token, abi: METADATA_ABI, functionName: "name" }).catch(() => ""),
      client.readContract({ address: token, abi: METADATA_ABI, functionName: "symbol" }).catch(() => ""),
    ]);
    const [description, website, image, extraData] = meta;

    return {
      name: name as string,
      symbol: symbol as string,
      description,
      website,
      image,
      xHandle: readXHandle(extraData),
    };
  } catch {
    // Not every token on this chain is a UERC20.
    return null;
  }
}

/** x.com URLs are stored in the website slot, so tell the two apart by host. */
export function isXUrl(url: string) {
  return /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url);
}
