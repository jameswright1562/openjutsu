// Server-only ComfyUI worker registry. No worker URLs are accepted from browser input.
import { HttpError, validateJobId } from "./http.ts";

export type WorkerId = "desktop" | "laptop";

export function pictureVideoWorker(): WorkerId {
  const configured = process.env.OPENJUTSU_PICTURE_RENDER_BACKEND?.trim() || "desktop";
  if (configured !== "desktop" && configured !== "laptop") {
    throw new HttpError(503, "OPENJUTSU_PICTURE_RENDER_BACKEND must be desktop or laptop.");
  }
  return configured;
}

export function comfyUrl(worker: WorkerId = "desktop"): string {
  const raw = worker === "desktop"
    ? process.env.COMFYUI_URL?.trim() || "http://127.0.0.1:8188"
    : process.env.OPENJUTSU_LAPTOP_COMFYUI_URL?.trim();
  if (!raw) throw new HttpError(503, "Set OPENJUTSU_LAPTOP_COMFYUI_URL to enable the laptop worker.");
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new HttpError(503, `Invalid ComfyUI URL for ${worker}.`); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new HttpError(503, `ComfyUI URL for ${worker} must be an HTTP(S) origin without a path, credentials or query.`);
  }
  return parsed.origin;
}

// Unprefixed IDs are existing desktop jobs; laptop IDs carry their routing across reloads.
const LAPTOP_PREFIX = "laptop__";
export function pictureJobId(worker: WorkerId, id: string): string {
  validateJobId(id);
  return worker === "laptop" ? LAPTOP_PREFIX + id : id;
}
export function parsePictureJobId(id: string): { worker: WorkerId; id: string } {
  validateJobId(id);
  if (!id.startsWith(LAPTOP_PREFIX)) return { worker: "desktop", id };
  const raw = id.slice(LAPTOP_PREFIX.length);
  validateJobId(raw);
  return { worker: "laptop", id: raw };
}
