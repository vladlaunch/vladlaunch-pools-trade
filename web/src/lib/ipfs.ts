/**
 * Turn whatever a token put in its metadata into something a browser can load.
 *
 * `ipfs://` is the dominant convention on this launchpad — 68 of the 100 live curve
 * launches and every crowd auction use it — and a browser cannot fetch that scheme at
 * all. An `<img src="ipfs://…">` is a broken image, silently.
 *
 * The gateway choice is not interchangeable, and getting it backwards is easy:
 *
 *   A Pinata *dedicated* gateway only serves content pinned to its own account.
 *   Measured against a live third-party CID:
 *     cyan-cheerful-fish-957.mypinata.cloud → 403
 *     ipfs.io                               → 200 in 0.26s
 *     gateway.pinata.cloud                  → 200 in 6.6s
 *     cloudflare-ipfs.com                   → no response
 *
 * So feed art — which is overwhelmingly other people's CIDs — reads from a public
 * gateway. The dedicated gateway is used only where the content is ours by
 * construction: the preview of a file we just pinned, in api/upload.
 */

const PRIMARY = "ipfs.io";
/** dweb.link 301s to its subdomain form, which browsers follow. Different operator. */
export const FALLBACK_GATEWAY = "dweb.link";

function toPath(url: string): string | null {
  if (url.startsWith("ipfs://")) {
    // Some tools write ipfs://ipfs/<cid>; drop the duplicated segment.
    return url.slice(7).replace(/^ipfs\//, "");
  }
  // A bare CID turns up often enough to be worth accepting.
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58,})/.test(url)) return url;
  return null;
}

export function resolveImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const path = toPath(url);
  if (path) return `https://${PRIMARY}/ipfs/${path}`;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return null;
}

/** Second address for the same content, for an onError retry. Null when there is none. */
export function fallbackImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const path = toPath(url);
  return path ? `https://${FALLBACK_GATEWAY}/ipfs/${path}` : null;
}
