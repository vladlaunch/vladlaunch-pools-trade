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
  /** The site, once the X profile has been separated out of the single website slot. */
  website: string | null;
  xUrl: string | null;
  image: string;
  /** Present when an official launch attached a signed X verification token. */
  xHandle: string | null;
};

function bytesToText(hex: string): string | null {
  if (!hex || hex === "0x") return null;
  const pairs = hex.slice(2).match(/.{2}/g);
  if (!pairs) return null;
  try {
    return decodeURIComponent(
      pairs.map((b) => `%${b}`).join(""),
    );
  } catch {
    return String.fromCharCode(...pairs.map((b) => parseInt(b, 16)));
  }
}

/**
 * Launches made here write {v, links:{x, website}} into extraData, because the struct
 * only has room for one link and a token with both would otherwise lose one forever.
 */
function readLinks(extraData: string): { x?: string; website?: string } {
  const text = bytesToText(extraData);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as { links?: { x?: string; website?: string } };
    return parsed.links ?? {};
  } catch {
    return {};
  }
}

/** Official launches carry a signed X verification blob in the same field. */
function readXHandle(extraData: string): string | null {
  const text = bytesToText(extraData);
  if (!text) return null;
  try {
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

    const links = readLinks(extraData);
    const handle = readXHandle(extraData);

    // The single website slot holds either a site or an X profile depending on what the
    // creator supplied, so sort it by host rather than trusting its name.
    const slotIsX = website ? isXUrl(website) : false;

    return {
      name: name as string,
      symbol: symbol as string,
      description,
      website: links.website ?? (slotIsX ? null : website || null),
      xUrl: links.x ?? (slotIsX ? website : handle ? `https://x.com/${handle}` : null),
      image,
      xHandle: handle,
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
