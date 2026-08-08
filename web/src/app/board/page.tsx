import { fetchLaunches } from "@/lib/pools";
import { Board } from "@/components/Board";

export const revalidate = 10;

export const metadata = {
  title: "Board",
  description: "Every live Robinhood Chain launch in one sortable table.",
};

export default async function BoardPage() {
  let launches;
  try {
    launches = await fetchLaunches("volume");
  } catch (err) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-5 py-24 sm:px-8">
        <h1 className="display text-5xl text-ink">The board is empty.</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
          Launch data isn&apos;t reachable right now. Nothing is shown rather than something stale.
        </p>
        <p className="num mt-6 text-xs text-ink-faint">
          {err instanceof Error ? err.message : "unknown error"}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1400px] px-5 pt-12 sm:px-8">
      <h1 className="display text-5xl text-ink">Board</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-dim">
        All {launches.length} live launches, every column sortable. Heat is 24h volume divided by
        pool liquidity — how many times the book turned over.
      </p>
      <div className="mt-10">
        <Board launches={launches} now={Date.now()} />
      </div>
    </section>
  );
}
