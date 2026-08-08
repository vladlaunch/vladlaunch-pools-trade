import type { Metadata } from "next";
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Providers } from "./providers";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const DESCRIPTION =
  "Every token on Robinhood Chain starts at zero and climbs to fifty thousand. VladLaunch shows you where each one is on the way up, what its pool charges, and who holds the liquidity.";

export const metadata: Metadata = {
  /**
   * Without a metadataBase, Next resolves Open Graph and Twitter image paths against
   * localhost at build time, so every link shared anywhere renders with no card. The
   * env var lets a Vercel preview deployment advertise its own URL instead of claiming
   * to be production — otherwise a preview's cards point at the live site.
   */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://vladlaunch.fun"),
  ),
  title: {
    default: "VladLaunch — launch and trade on Robinhood Chain",
    // Page titles supply only their own name; the brand is appended here once.
    template: "%s — VladLaunch",
  },
  description: DESCRIPTION,
  applicationName: "VladLaunch",
  keywords: [
    "Robinhood Chain",
    "launchpad",
    "Uniswap v4",
    "bonding curve",
    "token launch",
    "RHC 4663",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "VladLaunch",
    url: "/",
    title: "VladLaunch — launch and trade on Robinhood Chain",
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "VladLaunch" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vladlaunch",
    creator: "@vladlaunch",
    title: "VladLaunch — launch and trade on Robinhood Chain",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <div className="aurora" aria-hidden />
        <div className="grain" aria-hidden />
        <Providers>
          <Nav />
          <main>{children}</main>
        <footer className="mx-auto mt-24 w-full max-w-[1400px] border-t border-line/70 px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="display text-3xl text-ink">VladLaunch</div>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                Launch and trade on Robinhood Chain. Your own pool fee, your own fee claim,
                the same liquidity as everyone else.
              </p>
            </div>
            <div className="flex gap-10 text-sm">
              <div className="flex flex-col gap-2">
                <span className="label">Product</span>
                <a href="/" className="text-ink-dim transition-colors hover:text-mint">Explore</a>
                <a href="/board" className="text-ink-dim transition-colors hover:text-mint">Board</a>
                <a href="/create" className="text-ink-dim transition-colors hover:text-mint">Create</a>
                <a href="/docs" className="text-ink-dim transition-colors hover:text-mint">Docs</a>
              </div>
              <div className="flex flex-col gap-2">
                <span className="label">Elsewhere</span>
                <a
                  href="https://x.com/vladlaunch"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-dim transition-colors hover:text-mint"
                >
                  X
                </a>
                <a
                  href="https://robinhoodchain.blockscout.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-dim transition-colors hover:text-mint"
                >
                  Explorer
                </a>
              </div>
            </div>
          </div>
          <p className="mt-10 text-xs leading-relaxed text-ink-faint">
            Market data is read from the public pools.trade API and Robinhood Chain RPC. Nothing here
            is advice. Bonding-curve tokens can go to zero, and most do.
          </p>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
