// Run after a build, outside verify. Task 29 records the author's real-clock result.
import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";

const url = "http://127.0.0.1:4175";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4175", "--strictPort"], { stdio: "ignore", windowsHide: true });

async function measure(args) {
  const browser = await chromium.launch(args ? { args } : undefined);
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url);
    const renderer = await page.evaluate(() => {
      const gl = globalThis.document.createElement("canvas").getContext("webgl");
      if (!gl) return "WebGL unavailable";
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "WEBGL_debug_renderer_info unavailable";
    });
    await page.locator("#light").click();
    const intervals = await page.evaluate(() => new Promise((resolve) => {
      const samples = []; let previous;
      function frame(now) {
        if (previous !== undefined) samples.push(now - previous);
        previous = now;
        if (samples.length >= 600) resolve(samples);
        else globalThis.requestAnimationFrame(frame);
      }
      globalThis.requestAnimationFrame(frame);
    }));
    intervals.sort((a, b) => a - b);
    return { renderer, frames: intervals.length, median: intervals[299], p95: intervals[569] };
  } finally { await browser.close(); }
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await globalThis.fetch(url)).ok) { ready = true; break; } } catch { /* Wait for preview. */ }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("preview did not start");

  try {
    const gpu = await measure(["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-gpu"]);
    process.stdout.write(`GPU renderer: ${gpu.renderer}; frames ${gpu.frames}; median ${gpu.median.toFixed(3)} ms (limit 17.5); p95 ${gpu.p95.toFixed(3)} ms (limit 25)\n`);
    if (/SwiftShader|unavailable/i.test(gpu.renderer)) {
      process.stderr.write("GPU measurement invalid: WebGL reports SwiftShader or no identifiable GPU renderer.\n");
      process.exitCode = 1;
    } else if (gpu.median > 17.5 || gpu.p95 > 25) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`GPU measurement failed: ${error}\n`);
    process.exitCode = 1;
  }

  try {
    const software = await measure();
    process.stdout.write(`software (information only, not judged): renderer ${software.renderer}; frames ${software.frames}; median ${software.median.toFixed(3)} ms; p95 ${software.p95.toFixed(3)} ms\n`);
  } catch (error) {
    process.stderr.write(`software measurement unavailable (information only): ${error}\n`);
  }
} catch (error) {
  process.stderr.write(`Frame measurement failed: ${error}\n`);
  process.exitCode = 1;
} finally { server.kill(); }
