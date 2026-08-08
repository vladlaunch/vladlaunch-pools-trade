import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "VladLaunch — launch and trade on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link preview is the first surface most people ever see, because a launchpad is
 * shared as a URL in a reply far more often than it is browsed to. Drawn here rather
 * than checked in as a PNG so it stays in step with the palette, and so the numbers on
 * it come from the same place the site does.
 *
 * Satori supports a subset of CSS: no CSS variables, no gradients on text, and every
 * element with more than one child needs an explicit `display: flex`. The values are
 * therefore inlined from globals.css instead of referenced.
 */
export default async function OpengraphImage() {
  const mint = "#00ffc2";
  const ink = "#ededed";
  const muted = "#888a88";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#070b0a",
          // The aurora floor, flattened to what Satori can actually render.
          backgroundImage:
            "radial-gradient(90% 62% at 22% 118%, rgba(0,255,194,0.20) 0%, transparent 62%)," +
            "radial-gradient(85% 58% at 82% 122%, rgba(0,255,194,0.14) 0%, transparent 60%)," +
            "linear-gradient(to top, #083436 0%, #070b0a 72%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              backgroundColor: mint,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 24, color: muted, letterSpacing: 6 }}>VLADLAUNCH</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, color: ink, lineHeight: 1.05, letterSpacing: -2 }}>
            Every token starts at zero
          </div>
          <div style={{ fontSize: 82, color: mint, lineHeight: 1.05, letterSpacing: -2 }}>
            and climbs to $50K.
          </div>
          <div style={{ marginTop: 28, fontSize: 27, color: muted, lineHeight: 1.4, maxWidth: 900 }}>
            Choose your own pool fee. Keep 75% of it. The liquidity has no route out — and the
            docs hand you the command to check.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 22 }}>
          <div style={{ color: ink }}>vladlaunch.fun</div>
          <div style={{ color: "#1f3535" }}>|</div>
          <div style={{ color: muted }}>Robinhood Chain · 4663</div>
        </div>
      </div>
    ),
    size,
  );
}
