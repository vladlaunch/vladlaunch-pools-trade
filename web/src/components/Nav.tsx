"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "./Mark";
import { ConnectButton } from "./ConnectButton";

const LINKS = [
  { href: "/", label: "Explore" },
  { href: "/board", label: "Board" },
  { href: "/create", label: "Create" },
  { href: "/claim", label: "Claim" },
];

/** Live block height — the cheapest honest proof the page is talking to the chain. */
function BlockChip() {
  const [block, setBlock] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch("https://rpc.mainnet.chain.robinhood.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        });
        const json = await res.json();
        if (alive && json.result) setBlock(parseInt(json.result, 16));
      } catch {
        /* chain unreachable — chip stays hidden rather than showing a stale number */
      }
    };
    read();
    const t = setInterval(read, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (block == null) return null;
  return (
    <span className="num hidden items-center gap-2 text-[11px] text-muted xl:inline-flex">
      <span className="live-dot inline-block size-1.5 rounded-full bg-mint" />
      {block.toLocaleString("en-US")}
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-line/70 bg-void/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-5 sm:gap-6 sm:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2"
          aria-label="VladLaunch home"
        >
          <Mark size={26} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span className="display hidden text-[19px] leading-none text-ink md:inline">
            VladLaunch
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-2.5 py-1.5 text-sm transition-colors duration-200 sm:px-3 ${
                  active ? "bg-line/60 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <BlockChip />
          <ConnectButton />
          {/* The label shortens rather than wrapping — a three-line pill is a broken nav. */}
          <Link
            href="/create"
            className="hidden shrink-0 whitespace-nowrap rounded-full bg-mint px-4 py-2 text-sm font-medium text-deep transition-all duration-200 hover:bg-mint-dim hover:mint-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint lg:inline-block"
          >
            Launch a token
          </Link>
        </div>
      </nav>
    </header>
  );
}
