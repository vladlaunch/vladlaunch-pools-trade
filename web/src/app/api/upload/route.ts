import { NextResponse } from "next/server";

/**
 * Pin a launch image to IPFS.
 *
 * The Pinata JWT stays on the server. Handing it to the browser — even inside a
 * NEXT_PUBLIC_ variable — would publish an account-level write credential to every
 * visitor, and scoped keys are still keys. The browser posts a file here and gets back
 * a URI; it never sees the token.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "Image uploads are not configured on this deployment." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Send the image as multipart form data." }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, WebP, or GIF." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Keep the image under 5 MB." }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", file, file.name || "token-image");
  upstream.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: upstream,
    });

    if (!res.ok) {
      // Never forward Pinata's body — it can echo account details.
      return NextResponse.json(
        { error: `Pinning failed (${res.status}). Try again in a moment.` },
        { status: 502 },
      );
    }

    const { IpfsHash } = (await res.json()) as { IpfsHash?: string };
    if (!IpfsHash) {
      return NextResponse.json({ error: "Pinning returned no CID." }, { status: 502 });
    }

    const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY;
    return NextResponse.json({
      cid: IpfsHash,
      // Stored on-chain. A gateway URL would rot; ipfs:// stays resolvable by anyone.
      uri: `ipfs://${IpfsHash}`,
      // Only for the preview in this browser session.
      previewUrl: gateway ? `https://${gateway}/ipfs/${IpfsHash}` : `https://ipfs.io/ipfs/${IpfsHash}`,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the pinning service." }, { status: 502 });
  }
}
