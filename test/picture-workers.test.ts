import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { GET, POST } from "../app/api/picture/route.ts";
import { DEFAULT_PICTURE_VIDEO } from "../lib/picture.ts";
import type { ApiGraph } from "../lib/simple.ts";

const desktopGraphs: ApiGraph[] = [], laptopGraphs: ApiGraph[] = [];
let desktopUploads = 0, laptopUploads = 0, laptopInputRead = false;
const abliterated = "qwen3.5_9b_flux3_prompt_upsampler_abliterated.safetensors";
const modelLists = {
  UNETLoader: { unet_name: [[DEFAULT_PICTURE_VIDEO.model]] },
  LoraLoaderModelOnly: { lora_name: [[DEFAULT_PICTURE_VIDEO.loras[0].name, "solarrenderer_4step_lora.safetensors", "solarrenderer_control_lora.safetensors"]] },
  CLIPLoader: { clip_name: [[DEFAULT_PICTURE_VIDEO.textEncoder, DEFAULT_PICTURE_VIDEO.audioVae, DEFAULT_PICTURE_VIDEO.videoVae, abliterated]] },
  VAELoader: { vae_name: [[DEFAULT_PICTURE_VIDEO.videoVae, DEFAULT_PICTURE_VIDEO.audioVae]] },
};
function handler(worker: "desktop" | "laptop") {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? "";
    const graphs = worker === "desktop" ? desktopGraphs : laptopGraphs;
    let result: unknown = {};
    if (path.startsWith("/object_info/")) {
      const node = decodeURIComponent(path.split("/").at(-1) ?? "");
      result = { [node]: { input: { required: modelLists[node as keyof typeof modelLists] ?? {} } } };
    } else if (path === "/upload/image") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const upload = Buffer.concat(chunks).toString("latin1");
      const extension = upload.match(/filename="[^"]+\.(mp4|png|jpg|jpeg|webp)"/i)?.[1]?.toLowerCase() ?? "png";
      const count = worker === "desktop" ? ++desktopUploads : ++laptopUploads;
      result = { name: `file-${count}.${extension}`, subfolder: "picture" };
    } else if (path === "/prompt") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      graphs.push(JSON.parse(Buffer.concat(chunks).toString()).prompt);
      result = { prompt_id: `${worker}-job-${graphs.length}` };
    } else if (path.startsWith("/history/")) {
      const id = path.split("/").at(-1);
      if (worker === "desktop" && id === "desktop-job-1") result = {
        [id]: { prompt: [0, id, desktopGraphs[0]], status: { status_str: "success", completed: true },
          outputs: { "21": { images: [{ filename: "prepared.png", type: "output" }] } } },
      };
      else if (worker === "laptop" && id === "laptop-job-1") result = {
        [id]: { prompt: [0, id, laptopGraphs[0]], status: { status_str: "success", completed: true },
          outputs: { "63": { gifs: [{ filename: "result.mp4", type: "output" }] } } },
      };
    } else if (path.startsWith("/view?")) {
      if (worker === "desktop" && path.includes("type=input")) laptopInputRead = true;
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(worker === "desktop" ? "prepared-or-source" : "rendered-video");
      return;
    } else if (path === "/queue") {
      result = { queue_running: [], queue_pending: [] };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  };
}

const desktop = createServer(handler("desktop")), laptop = createServer(handler("laptop"));
desktop.listen(0, "127.0.0.1");
laptop.listen(0, "127.0.0.1");
await Promise.all([once(desktop, "listening"), once(laptop, "listening")]);
const envDesktop = process.env.COMFYUI_URL, envLaptop = process.env.OPENJUTSU_LAPTOP_COMFYUI_URL;
process.env.COMFYUI_URL = `http://127.0.0.1:${(desktop.address() as AddressInfo).port}`;
process.env.OPENJUTSU_LAPTOP_COMFYUI_URL = `http://127.0.0.1:${(laptop.address() as AddressInfo).port}`;
delete process.env.OPENJUTSU_PASSWORD;

test.after(() => {
  if (envDesktop === undefined) delete process.env.COMFYUI_URL; else process.env.COMFYUI_URL = envDesktop;
  if (envLaptop === undefined) delete process.env.OPENJUTSU_LAPTOP_COMFYUI_URL; else process.env.OPENJUTSU_LAPTOP_COMFYUI_URL = envLaptop;
  for (const srv of [desktop, laptop]) { srv.closeAllConnections(); srv.close(); }
});
const url = "http://127.0.0.1:3000/api/picture";

test("From Picture routes preparation to desktop and selected H3 render to laptop with transferred inputs", async () => {
  const form = new FormData();
  form.set("video", new File([new Uint8Array([0, 0, 0, 0x18]), "ftypisom"], "clip.mp4"));
  form.set("picture", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "character.png"));
  form.set("width", "1280"); form.set("height", "720");
  form.set("seed", "42"); form.set("upsampler", abliterated);
  const prepare = await POST(new Request(url, { method: "POST", body: form }));
  assert.equal(prepare.status, 202);
  assert.deepEqual(await prepare.json(), { id: "desktop-job-1" });
  assert.equal(desktopGraphs[0]["9"].inputs.clip_name, abliterated);
  assert.equal(laptopGraphs.length, 0);

  const settings = { ...DEFAULT_PICTURE_VIDEO, renderer: "h3", steps: 6 };
  const render = await POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepared: "desktop-job-1", worker: "laptop", settings }) }));
  assert.equal(render.status, 202);
  assert.deepEqual(await render.json(), { id: "laptop__laptop-job-1" });
  assert.equal(laptopGraphs.length, 1);
  assert.equal(laptopGraphs[0]["1"].inputs.video, "picture/file-2.mp4");
  assert.equal(laptopGraphs[0]["20"].class_type, "LoadImage");
  assert.equal(laptopInputRead, true);
  assert.equal(laptopUploads, 2); // prepared reference frame and original video
  assert.equal(desktopGraphs.length, 1); // FLUX was not rerun

  const poll = await GET(new Request(`${url}?id=laptop__laptop-job-1`));
  assert.deepEqual(await poll.json(), { status: "ready", url: "/api/picture?id=laptop__laptop-job-1&media=result" });
  const media = await GET(new Request(`${url}?id=laptop__laptop-job-1&media=result`));
  assert.equal(media.status, 200);
  assert.equal(await media.text(), "rendered-video");
});

test("invalid worker selection is not dispatched to ComfyUI", async () => {
  const attempted = await POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepared: "desktop-job-1", worker: "unknown", settings: DEFAULT_PICTURE_VIDEO }) }));
  assert.equal(attempted.status, 503);
  assert.equal(laptopGraphs.length, 1);
});
