"use client";

import { useState } from "react";
import { explorer } from "@/lib/chain";
import { short } from "@/lib/format";

/**
 * A contract address is something people need in their clipboard, not just on screen.
 * Truncating it and linking it to an explorer looks tidy and leaves the one action
 * anyone actually wants — pasting it into a wallet — as a manual retype.
 */
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {
            /* clipboard blocked; the explorer link below still gets them there */
          }
        }}
        title={address}
        aria-label={copied ? "Address copied" : `Copy ${address}`}
        className={`num rounded px-1.5 py-0.5 transition-colors ${
          copied ? "bg-mint/15 text-mint" : "hover:bg-line/60 hover:text-ink"
        }`}
      >
        {copied ? "copied" : short(address, 6, 6)}
      </button>
      <a
        href={explorer.token(address)}
        target="_blank"
        rel="noreferrer"
        title="View on Blockscout"
        className="text-ink-faint transition-colors hover:text-mint"
      >
        ↗
      </a>
    </span>
  );
}
