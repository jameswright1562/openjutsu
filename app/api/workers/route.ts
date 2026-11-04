import { apiAccess } from "../../../lib/http.ts";
import { comfyUi } from "../../../lib/comfy.ts";
import type { WorkerId } from "../../../lib/backends.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connectivity and memory information is read from the server-side worker registry,
// never from a URL supplied by the browser.
export async function GET(request: Request) {
  const denied = apiAccess(request);
  if (denied) return denied;
  const workers: WorkerId[] = ["desktop", "laptop"];
  const statuses = await Promise.all(workers.map(async (id) => {
    try {
      const stats = await comfyUi("/system_stats", 5_000, id);
      const first = Array.isArray(stats?.devices) ? stats.devices[0] : null;
      return {
        id, online: true,
        gpu: typeof first?.name === "string" ? first.name : null,
        vramBytes: typeof first?.vram_total === "number" ? first.vram_total : null,
        ramBytes: typeof stats?.system?.ram_total === "number" ? stats.system.ram_total : null,
      };
    } catch {
      return { id, online: false, gpu: null, vramBytes: null, ramBytes: null };
    }
  }));
  return Response.json({ workers: statuses }, { headers: { "Cache-Control": "no-store" } });
}
