"use client";

import { useState } from "react";

/**
 * The signature element of the docs page.
 *
 * Documentation normally hides its sources: prose asserts, and a footnote points at a
 * repo somewhere. This launchpad's whole posture is the opposite — the token page shows
 * custody with its evidence, the board shows the pool fee with its evidence — so the
 * docs carry the same rule. Every claim on that page sits above the exact command,
 * address, or test name that would catch it lying.
 *
 * A command you cannot copy is a picture of a command, which is why this has the copy
 * button and `CopyAddress` exists at all. The label says "Check it", not "Example":
 * these snippets are not usage, they are falsification.
 */
export function Receipt({
  label = "Check it",
  cmd,
  out,
  note,
}: {
  label?: string;
  cmd: string;
  /** What a truthful chain returns. Its absence is as informative as its value. */
  out?: string;
  /** What a different answer would mean. Only worth writing when it is not obvious. */
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="receipt mt-5 rounded-r-lg bg-void/55 py-3 pl-4 pr-3">
      <div className="flex items-start justify-between gap-3">
        <span className="label pt-0.5 !text-mint/70">{label}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(cmd);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* clipboard blocked — the text is selectable, which is the fallback */
            }
          }}
          aria-label={copied ? "Copied" : "Copy this command"}
          className={`num shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            copied ? "bg-mint/15 text-mint" : "text-ink-faint hover:bg-line/60 hover:text-ink"
          }`}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {/* A long cast invocation must scroll in its own box rather than widen the page. */}
      <pre className="num no-scrollbar mt-2 overflow-x-auto text-[12px] leading-relaxed text-ink-dim">
        {cmd}
      </pre>

      {out && (
        // A 42-character address is one unbreakable word: at 320px it pushed the page
        // wider than the phone. Wrapping beats scrolling here — you can read the whole
        // address at once, which is the only reason it is printed.
        <div className="num mt-1.5 break-all text-[12px] leading-relaxed text-mint">
          <span className="select-none text-ink-faint">→ </span>
          {out}
        </div>
      )}

      {note && <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{note}</p>}
    </div>
  );
}

/**
 * The same idea where the evidence is a file rather than a call: a named test that would
 * fail if the claim above it stopped being true. Cheaper to read than a command, and it
 * is the only honest way to source a claim about what the code *cannot* do.
 */
export function TestReceipt({ name, asserts }: { name: string; asserts: string }) {
  return (
    <div className="receipt mt-5 rounded-r-lg bg-void/55 py-3 pl-4 pr-3">
      <span className="label !text-mint/70">Backed by a test</span>
      <div className="num mt-2 text-[12px] leading-relaxed text-ink-dim">{name}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">{asserts}</p>
    </div>
  );
}
