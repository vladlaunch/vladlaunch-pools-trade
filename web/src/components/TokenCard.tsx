import Link from "next/link";
import type { Launch } from "@/lib/pools";
import { GRADUATION_FLOOR, hasGraduated } from "@/lib/pools";
import { recoverPoolKey } from "@/lib/poolkey";
import { TokenImage } from "./TokenImage";
import { FeeBadge } from "./FeeBadge";
import { usd, compact, pct, age, hueFrom } from "@/lib/format";

function Avatar({ l }: { l: Launch }) {
  const hue = hueFrom(l.tokenAddress, l.imageHue);
  return (
    <TokenImage
      src={l.imageUrl}
      className="size-11 shrink-0 rounded-lg object-cover"
      onUnavailable={
        <div
          className="grid size-11 shrink-0 place-items-center rounded-lg text-lg"
          style={{
            background: `linear-gradient(150deg, hsl(${hue} 60% 22%), hsl(${(hue + 40) % 360} 55% 12%))`,
          }}
          aria-hidden
        >
          {l.imageEmoji ?? l.tokenSymbol.slice(0, 1)}
        </div>
      }
    />
  );
}

/** The bar is the whole story of a bonding-curve token, so it gets real estate. */
export function CurveBar({ progress, graduated }: { progress: number; graduated?: boolean }) {
  // Progress runs past 100 while a token waits for its migration tx, so the bar is
  // clamped but the label always reports the real number. Only `graduated` — which
  // comes from status, not from the bar — is allowed to claim the token is out.
  // progress is a multiple of the threshold: 1 means graduated.
  const p = Math.min(Math.max(progress, 0), 1) * 100;
  const atLine = progress >= GRADUATION_FLOOR;
  return (
    <div className="flex items-center gap-2.5">
      <div className="scan-track h-1 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            atLine ? "bg-mint mint-glow" : "bg-mint/70"
          }`}
          style={{ width: `${Math.max(p, 1.5)}%` }}
        />
      </div>
      <span className={`num text-[11px] ${atLine ? "text-mint" : "text-muted"}`}>
        {graduated ? "out" : `${(progress * 100).toFixed(progress < 0.1 ? 1 : 0)}%`}
      </span>
    </div>
  );
}

/**
 * How brightly a card burns is how far up the curve it is.
 *
 * Squared on purpose: linear intensity made a token at 3% and one at 6% look
 * meaningfully different when they are the same story, and left nothing in reserve for
 * the few that are actually close. Squaring keeps the bottom of the field flat and
 * spends the range where it carries information.
 */
function climbIntensity(progress: number) {
  const t = Math.min(Math.max(progress, 0), 1);
  return Number((t * t).toFixed(3));
}

/** `now` is threaded from the server render — see lib/format.ts `age`. */
export function TokenCard({ l, now }: { l: Launch; now: number }) {
  const up = l.poolStats.priceChange24hPct >= 0;
  return (
    <Link
      href={`/token/${l.tokenAddress}`}
      style={{ "--climb": climbIntensity(l.graduationProgress) } as React.CSSProperties}
      /* min-w-0 is load-bearing, not tidiness. A grid track is minmax(auto, 1fr), and
         `auto` bottoms out at the item's min-content — which for this card is the full
         un-wrapped token name. One long name ("ABOAR - Allegra Boar, the New Boar of X")
         widened the track, the grid, the section, and finally the page, so a phone
         scrolled sideways to 451px. Letting the item shrink to 0 stops the chain. */
      className="card card-lift card-climb group flex min-w-0 flex-col gap-4 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      <div className="flex items-start gap-3">
        <Avatar l={l} />
        <div className="min-w-0 flex-1">
          {/* min-w-0 has to repeat here: a flex item's default min-width is its content,
              so without it this row refuses to shrink and `truncate` never fires — a name
              like "ABOAR - Allegra Boar, the New Boar of X" pushed the whole page wide
              enough to scroll sideways on a phone. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] leading-tight text-ink transition-colors group-hover:text-mint">
              {l.tokenName}
            </span>
            {l.xVerified && (
              <span
                className="shrink-0 rounded bg-mint/15 px-1 text-[9px] font-medium tracking-wide text-mint"
                title="Creator's X account is linked and verified"
              >
                X
              </span>
            )}
          </div>
          <div className="num mt-0.5 truncate text-[11px] text-muted">
            ${l.tokenSymbol} · {age(l.createdAt, now)}
          </div>
        </div>
        <div className="num shrink-0 text-right">
          <div className="text-[15px] leading-tight text-ink">{usd(l.fdvUsd)}</div>
          <div className={`text-[11px] ${up ? "text-up" : "text-down"}`}>
            {pct(l.poolStats.priceChange24hPct)}
          </div>
        </div>
      </div>

      {l.description && (
        <p className="line-clamp-2 text-[13px] leading-snug text-ink-faint">{l.description}</p>
      )}

      <CurveBar progress={l.graduationProgress} graduated={hasGraduated(l)} />

      <div className="num flex items-center justify-between border-t border-line/60 pt-3 text-[11px] text-muted">
        <span title="24h volume">{usd(l.poolStats.volume24hUsd)} vol</span>
        <span title="Holders">{compact(l.holderCount)} holders</span>
        {/* Fee is proven from the pool id, not assumed — see lib/poolkey.ts. */}
        <FeeBadge facts={recoverPoolKey(l.tokenAddress, l.poolId)} />
      </div>
    </Link>
  );
}
