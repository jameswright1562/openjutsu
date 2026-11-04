import assert from "node:assert/strict";
import test from "node:test";
import { comfyUrl, parsePictureJobId, pictureJobId, pictureVideoWorker } from "../lib/backends.ts";
import { abliteratedVisionModels, isAbliteratedModel } from "../lib/model.ts";

test("worker registry keeps desktop as the default and accepts explicit worker selection", () => {
  const previous = process.env.OPENJUTSU_PICTURE_RENDER_BACKEND;
  try {
    delete process.env.OPENJUTSU_PICTURE_RENDER_BACKEND;
    assert.equal(pictureVideoWorker(), "desktop");
    assert.equal(pictureVideoWorker("laptop"), "laptop");
    assert.throws(() => pictureVideoWorker("other"), /must be desktop or laptop/);
    process.env.OPENJUTSU_PICTURE_RENDER_BACKEND = "laptop";
    assert.equal(pictureVideoWorker(), "laptop");
    assert.equal(pictureVideoWorker("desktop"), "desktop");
  } finally {
    if (previous === undefined) delete process.env.OPENJUTSU_PICTURE_RENDER_BACKEND;
    else process.env.OPENJUTSU_PICTURE_RENDER_BACKEND = previous;
  }
});

test("worker URLs are configured server-side and must be clean HTTP(S) origins", () => {
  const oldDesktop = process.env.COMFYUI_URL, oldLaptop = process.env.OPENJUTSU_LAPTOP_COMFYUI_URL;
  try {
    delete process.env.COMFYUI_URL;
    delete process.env.OPENJUTSU_LAPTOP_COMFYUI_URL;
    assert.equal(comfyUrl("desktop"), "http://127.0.0.1:8188");
    assert.throws(() => comfyUrl("laptop"), /OPENJUTSU_LAPTOP_COMFYUI_URL/);
    process.env.OPENJUTSU_LAPTOP_COMFYUI_URL = "http://192.168.1.100:8188/";
    assert.equal(comfyUrl("laptop"), "http://192.168.1.100:8188");
    for (const bad of ["file:///tmp/comfy", "http://host/path", "http://user:pass@host:8188", "http://host?x=1"]) {
      process.env.OPENJUTSU_LAPTOP_COMFYUI_URL = bad;
      assert.throws(() => comfyUrl("laptop"), /ComfyUI URL/);
    }
  } finally {
    if (oldDesktop === undefined) delete process.env.COMFYUI_URL;
    else process.env.COMFYUI_URL = oldDesktop;
    if (oldLaptop === undefined) delete process.env.OPENJUTSU_LAPTOP_COMFYUI_URL;
    else process.env.OPENJUTSU_LAPTOP_COMFYUI_URL = oldLaptop;
  }
});

test("worker-tagged job IDs survive reloads and reject malformed IDs", () => {
  assert.equal(pictureJobId("desktop", "picture-12"), "picture-12");
  assert.equal(pictureJobId("laptop", "picture-12"), "laptop__picture-12");
  assert.deepEqual(parsePictureJobId("picture-12"), { worker: "desktop", id: "picture-12" });
  assert.deepEqual(parsePictureJobId("laptop__picture-12"), { worker: "laptop", id: "picture-12" });
  for (const bad of ["laptop__", "../path", "https://host"]) assert.throws(() => parsePictureJobId(bad));
});

test("abliterated filenames are labeled, with likely visual models preferred only by name", () => {
  assert.equal(isAbliteratedModel("Qwen3-VL-8B-abliterated.safetensors"), true);
  assert.equal(isAbliteratedModel("qwen3vl_8b_int8_convrot.safetensors"), false);
  assert.deepEqual(abliteratedVisionModels(["Qwen3-VL-8B-abliterated.safetensors", "Qwen3-8B-abliterated.safetensors", "Gemma4-ablit.safetensors"]),
    ["Qwen3-VL-8B-abliterated.safetensors", "Gemma4-ablit.safetensors"]);
});
