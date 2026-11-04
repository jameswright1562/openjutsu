# Distributed ComfyUI workers (experimental)

This fork is configured to run the OpenJutsu web application on the **Windows desktop** (RTX 3060 12 GB) and use an optional **Windows laptop** (RTX 4070 class, GPU VRAM to be verified) as a second ComfyUI worker. There is no Mac orchestrator.

## Currently implemented

- **From Picture** only: FLUX image preparation and Qwen vision description run on the desktop's ComfyUI; the **video render stage** can be assigned to the desktop or laptop from a UI dropdown.
- ComfyUI model/LoRA/encoder/VAE pickers for video render reflect the selected worker's installed files.
- The prepared image and original source video are sent to the selected video worker. The server relays source video through a temporary file rather than loading the entire video in RAM.
- Job IDs retain their origin worker so polling, previews and video downloads still work after refresh.
- The visual describer can be any installed **compatible VLM**. Selectable abliterated filenames are grouped above other installed models in the Welcome and model-component pickers.
- The FLUX prompt upsampler is selectable from the desktop's installed text encoders; an abliterated variant can be tried if it is compatible with `CLIPLoader(type=flux3)` and the image-aware `TextGenerate` node.
- Existing Simple/Advanced/Object/Face/Mask/Montage jobs continue using the desktop and its existing comfy-api-proxy. Those workflows are not yet distributed.

## Setup

On the desktop:

1. Install and start ComfyUI as usual on port 8188. Install the OpenJutsu prerequisites, including the FLUX 3 image-edit models for From Picture, and the chosen visual describer.
2. Start `comfy-api-proxy` on port 8189 as described in the main README, for the main swap workflows.
3. Set in `.env.local`:

   ```env
   COMFY_BASE_URL=http://127.0.0.1:8189
   COMFYUI_URL=http://127.0.0.1:8188
   OPENJUTSU_LAPTOP_COMFYUI_URL=http://<laptop-ip>:8188
   OPENJUTSU_PICTURE_RENDER_BACKEND=desktop
   ```

4. Start OpenJutsu on your desktop. Open **Object swap → From picture**. Prepare a frame using FLUX on the desktop. Under **Video render settings**, select **Windows laptop** and choose the installed video model, encoder, LoRAs and VAEs. Submit a short, low-resolution test first.

On the laptop:

1. Install ComfyUI and **all nodes required by the selected From Picture render workflow** (Metric3D, H3/SolarRenderer, KJNodes, VideoHelperSuite, etc.). Install the exact model files and compatible quantizations shown in the main README.
2. Bind ComfyUI to an interface accessible only on the trusted LAN/VPN, e.g. `python main.py --listen 0.0.0.0 --port 8188`.
3. Use Windows Firewall to restrict incoming port 8188 to the desktop (or a private VPN). Do not expose ComfyUI on a public internet interface.
4. Confirm the desktop can reach `http://<laptop-ip>:8188/system_stats` before rendering.

## Abliterated models

This fork **does not ship or download abliterated checkpoints**. Place appropriate model files in the ComfyUI `models/text_encoders` directory on whichever worker will use them, then refresh model lists.

The UI groups installed filenames containing `ablit` or `abliterat`. This is a **filename hint only**, not verification of actual abliteration, vision support, checkpoint safety, tokenizer compatibility or loader support.

- **Visual describer**: choose a full vision-capable single-file model supported by ComfyUI's `CLIPLoader` and `TextGenerate`. Many GGUF or generic language-only models cannot run here without new loader nodes or an API adapter.
- **FLUX prompt upsampler**: an abliterated replacement must support the specialized `flux3` loader type and multimodal input. A generic Qwen3.5 9B checkpoint is not necessarily interchangeable with the special FLUX prompt upsampler.
- **H3 text encoder**: the H3-specialized Qwen3-VL encoder is not a general chat/VLM slot. Using an unrelated abliterated Qwen file may fail or alter video conditioning. Keep the H3-specific version unless you have a compatible alternate.
- **H3 diffusion and VAEs**: abliteration of a chat/VLM does not apply automatically to diffusion model weights.

## Known limitations / next implementation steps

1. The standard **Simple**, **Advanced** and **Montage** workflows still interleave person tracking and prompt descriptions with H3 clip-loop execution. To split them, export the required track/mask/mannequin/shot-list artifacts and implement imports on the generation worker; don't silently move the whole workflow.
2. No GPU memory pooling: each node executes wholly on one worker. Neither machine gains 24 GB combined VRAM.
3. Both GPUs may have 12 GB VRAM (verify the laptop). H3's reference setup was tested on a **16 GB VRAM / 64 GB RAM** machine. The laptop's 32 GB system RAM may not be sufficient for some model configurations. Begin at 480p with quantized models, monitor RAM/VRAM, and consider running H3 on the desktop if the laptop fails.
4. Transfers use HTTP; video transfer creates a temporary file on the orchestrator, which is deleted after upload. Transfers currently have no resumable chunk protocol.
5. The basic model picker validates the file exists but cannot prove architecture compatibility. ComfyUI may reject an incompatible selection at prompt submission.
6. Backend status/latency and memory gauges, retry scheduling, cross-worker checkpointing and full pipeline parallelism remain future work.

Run `npm test` and `npm run build` before deploying. Use the branch's CI checks for regressions.
