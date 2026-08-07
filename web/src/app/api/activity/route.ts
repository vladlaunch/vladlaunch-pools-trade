import { NextResponse } from "next/server";
import { fetchTrades, fetchLeaderboard } from "@/lib/pools";

/**
 * Server-side proxy for the live panels. The browser polls this, never the upstream
 * API — so there is one place to add caching, one place that breaks if the upstream
 * shape changes, and no third-party host in the user's network tab.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
    return NextResponse.json({ error: "token must be a 20-byte hex address" }, { status: 400 });
  }

  try {
    const [trades, traders] = await Promise.all([
      fetchTrades(token).then((r) => r.trades),
      fetchLeaderboard(token).then((r) => r.traders),
    ]);
    return NextResponse.json({ trades, traders });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upstream unavailable" },
      { status: 502 },
    );
  }
}
