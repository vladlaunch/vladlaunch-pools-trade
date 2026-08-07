/** Number formatting for a trading surface: short, tabular, never rounded to a lie. */

export function usd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (opts.compact === false) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  const a = Math.abs(n);
  // Trailing zeros are noise on a dense surface: $5M reads faster than $5.00M.
  const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));
  if (a >= 1e9) return `$${trim(n / 1e9, 2)}B`;
  if (a >= 1e6) return `$${trim(n / 1e6, 2)}M`;
  if (a >= 1e3) return `$${trim(n / 1e3, 1)}K`;
  if (a >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(a >= 0.01 ? 4 : 6)}`;
}

/** Sub-cent prices get the subscript-zero treatment traders expect: $0.0₄3211 */
export function price(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  if (n >= 0.01) return `$${n.toFixed(n >= 1 ? 4 : 5)}`;
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  const digits = (n * 10 ** (zeros + 4)).toFixed(0);
  const sub = "₀₁₂₃₄₅₆₇₈₉";
  const marker = String(zeros)
    .split("")
    .map((d) => sub[Number(d)])
    .join("");
  return `$0.0${marker}${digits}`;
}

export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
}

/**
 * `now` is a parameter, not `Date.now()`, so a server render and the first client
 * render agree. Calling the clock during render is the classic hydration mismatch.
 */
export function age(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.floor(m))}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

export function since(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return `${Math.max(1, Math.floor(s))}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function short(addr: string, head = 4, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, 2 + head)}…${addr.slice(-tail)}`;
}

/** Deterministic hue → the emoji-token fallback avatar, so a token always looks the same. */
export function hueFrom(seed: string, given?: number | null): number {
  if (typeof given === "number") return (given * 11) % 360;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
