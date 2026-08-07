"use client";

import { useState } from "react";
import { resolveImage, fallbackImage } from "@/lib/ipfs";

/**
 * Launch art, with a second gateway behind it.
 *
 * IPFS gateways time out, rate-limit and go down individually — one bad afternoon at
 * ipfs.io would otherwise blank two thirds of the feed. On error this retries the same
 * CID through a different operator once, then gives up and lets the caller's fallback
 * avatar show.
 */
export function TokenImage({
  src,
  className,
  onUnavailable,
}: {
  src: string | null | undefined;
  className?: string;
  /** Rendered when neither gateway can produce the image. */
  onUnavailable: React.ReactNode;
}) {
  const primary = resolveImage(src);
  const [current, setCurrent] = useState(primary);
  const [triedFallback, setTriedFallback] = useState(false);

  if (!current) return <>{onUnavailable}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts and CIDs
    <img
      src={current}
      alt=""
      loading="lazy"
      className={className}
      onError={() => {
        if (triedFallback) {
          setCurrent(null);
          return;
        }
        setTriedFallback(true);
        setCurrent(fallbackImage(src));
      }}
    />
  );
}
