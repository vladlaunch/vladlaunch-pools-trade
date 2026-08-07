"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "@/lib/chain";

/**
 * Injected connector only, deliberately.
 *
 * The bot this launcher came from signs with a private key in its .env. A hosted site
 * must never do that: the key would sit in a Vercel environment variable and sign for
 * whoever loaded the page. Launches are signed by the visitor's own wallet, so the
 * server holds nothing worth stealing.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http(robinhoodChain.rpcUrls.default.http[0]) },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
