/* Regenerates every PNG in public/ from the SVG sources in this directory,
   and copies favicon.svg across. Run after editing any source:

     npm run icons

   Needs Playwright's Chromium for rasterising (npx playwright install chromium).
   It is not a project dependency: the generated files are committed, so CI
   never runs this. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "public");

const JOBS = [
  ["icon.svg", "icon-192.png", 192, 192],
  ["icon.svg", "icon-512.png", 512, 512],
  ["icon-maskable.svg", "icon-maskable-512.png", 512, 512],
  ["favicon.svg", "apple-touch-icon.png", 180, 180],
  ["favicon.svg", "favicon-32.png", 32, 32],
  ["og.svg", "og.png", 1200, 630],
];

const browser = await chromium.launch();
for (const [src, out, width, height] of JOBS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const svg = readFileSync(join(HERE, src), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:#10161C}` +
    `svg{display:block;width:${width}px;height:${height}px}</style>` + svg,
    { waitUntil: "load" },
  );
  writeFileSync(join(PUBLIC, out), await page.screenshot({ type: "png" }));
  await page.close();
  console.log(`${out}  ${width}x${height}`);
}
await browser.close();

copyFileSync(join(HERE, "favicon.svg"), join(PUBLIC, "favicon.svg"));
console.log("favicon.svg");
