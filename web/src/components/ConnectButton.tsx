"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/chain";
import { short } from "@/lib/format";

const BASE =
  "shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint sm:px-4";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending || !injected}
        className={`${BASE} border border-line text-ink hover:border-mint hover:text-mint disabled:opacity-50`}
      >
        {isPending ? "Check your wallet" : "Connect"}
      </button>
    );
  }

  // Signing on the wrong network fails at the wallet with a message nobody reads.
  // Offer the switch instead of the address.
  if (chainId !== robinhoodChain.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
        disabled={switching}
        className={`${BASE} bg-warn text-deep hover:opacity-90 disabled:opacity-50`}
      >
        {switching ? "Switching…" : "Switch to Robinhood Chain"}
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      className={`${BASE} num border border-line text-ink-dim hover:border-line-hi hover:text-ink`}
      title="Disconnect"
    >
      {short(address ?? "", 4, 4)}
    </button>
  );
}
