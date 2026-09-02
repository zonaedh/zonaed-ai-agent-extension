// Build script — bundles the MV3 sources into dist/ with esbuild.
//   src/background.ts  -> dist/background.js      (service worker)
//   src/options/*.ts   -> dist/options/*.js       (options page)
//   src/content/*.ts   -> dist/content/*.js       (per-feature content scripts)
// manifest.json is copied verbatim; its file paths point at dist/.
import { build, context } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const base = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome110",
  sourcemap: "inline",
  outdir: resolve(root, "dist"),
  logLevel: "info",
};

const entries = [
  resolve(root, "src/background.ts"),
  resolve(root, "src/options/options.ts"),
  resolve(root, "src/content/whatsapp.ts"),
];

async function buildOnce() {
  await mkdir(resolve(root, "dist"), { recursive: true });
  await build({ ...base, entryPoints: entries });
  await cp(resolve(root, "manifest.json"), resolve(root, "dist/manifest.json"));
  await cp(resolve(root, "src/options/options.html"), resolve(root, "dist/options/options.html"));
  await cp(resolve(root, "icons"), resolve(root, "dist/icons"), { recursive: true });
  console.log("✓ extension built -> dist/");
}

if (watch) {
  const ctx = await context({ ...base, entryPoints: entries });
  await ctx.watch();
  console.log("watching…");
} else {
  await buildOnce();
}