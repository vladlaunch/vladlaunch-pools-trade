import { AdminPanel } from "@/components/AdminPanel";
import { FEE_SPLIT } from "@/lib/launchpad";

export const metadata = {
  title: "Treasury — VladLaunch",
  description: "Protocol fee earnings across every launch.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pt-12 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="max-w-2xl">
          <h1 className="display text-5xl text-ink">Treasury</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            Every launch on this pad, and what the protocol&apos;s quarter of the fees has
            come to.
          </p>
          <AdminPanel feeSplit={FEE_SPLIT} />
        </div>

        <aside className="flex flex-col gap-5 lg:pt-4">
          <div className="card p-5">
            <div className="label">There is no admin key</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              The treasury address is fixed at deploy time and cannot be changed, and the
              contract has no owner and no withdrawal function. The 25% is paid out as part
              of each claim, straight to that address.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              So this page holds no power the chain does not already give everyone. It reads
              public logs, and its Collect button is the same permissionless call a creator
              makes from their own page.
            </p>
          </div>

          <div className="card p-5">
            <div className="label">Why collect at all</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              Fees sit inside the pool until someone triggers a collection. Nothing is lost
              by waiting — but nothing arrives either, for the creator or for the treasury.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
