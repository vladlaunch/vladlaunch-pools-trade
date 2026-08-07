"use client";

import { useRef, useState } from "react";

/* Launch art is pinned before the transaction is built, so the ipfs:// URI written
   into the token contract already resolves by the time anyone reads it. Asking a
   creator to go find a hosting URL first is how launches end up with broken images. */

export type PinnedImage = { uri: string; previewUrl: string } | null;

export function ImageUpload({
  value,
  onChange,
}: {
  value: PinnedImage;
  onChange: (v: PinnedImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      onChange({ uri: json.uri, previewUrl: json.previewUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink">Token image</span>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={`flex items-center gap-4 rounded-lg border border-dashed p-4 transition-colors ${
          dragging ? "border-mint bg-mint/5" : "border-line"
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- freshly pinned, arbitrary CID
          <img
            src={value.previewUrl}
            alt=""
            className="size-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-line/50 text-[11px] text-ink-faint">
            none
          </div>
        )}

        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <p className="num truncate text-[12px] text-mint">{value.uri}</p>
              <p className="mt-1 text-[12px] text-ink-faint">
                Pinned to IPFS. This exact URI goes into the token contract.
              </p>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-faint">
              Drop a square image here, or choose a file. PNG, JPEG, WebP, or GIF up to 5 MB.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
            >
              {busy ? "Pinning…" : value ? "Replace" : "Choose file"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-full px-2 py-1.5 text-[12px] text-muted transition-colors hover:text-down"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-[12px] text-down">{error}</p>}
    </div>
  );
}
