import { apiAccess } from "../../../lib/http.ts";
import { NextResponse } from "next/server";
import { listModels, MODELS_UNAVAILABLE } from "../../../lib/comfy.ts";
import { pictureVideoWorker } from "../../../lib/backends.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = apiAccess(request);
  if (denied) return denied;
  try {
    const backend = new URL(request.url).searchParams.get("backend");
    if (backend && backend !== "picture-video") return NextResponse.json({ error: "Unknown model backend." }, { status: 400 });
    const requested = new URL(request.url).searchParams.get("worker");
    if (requested && backend !== "picture-video") return NextResponse.json({ error: "Select a backend to choose its worker." }, { status: 400 });
    return NextResponse.json(await listModels(backend === "picture-video" ? pictureVideoWorker(requested ?? undefined) : "desktop"));
  } catch {
    // Empty lists turn the pickers into text fields.
    return NextResponse.json({ models: [], loras: [], textEncoders: [], vaes: [], error: MODELS_UNAVAILABLE }, { status: 502 });
  }
}
