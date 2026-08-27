# Test drive scorecard

A two-person scorecard for EV test drives: score each car right after the drive,
compare weighted totals, and hand your data to the other phone over QR codes —
no network, no account, nothing leaves the devices.

Live site: **https://ev.orksu.com/**

## Running it locally

```bash
npm install
npm run dev
```

`npm run build` produces a static `dist/`, with assets absolute from `/`
because the custom domain serves the site at the domain root.

```bash
npm run build
npm run preview
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`, and can be run by hand from the Actions tab.

The site is served from `ev.orksu.com`. `public/CNAME` carries that domain into
every build, so the custom domain survives redeploys; DNS is a `CNAME` record
for `ev` pointing at `fabbarix.github.io`.

One-time setup:

- **Settings → Pages → Build and deployment → Source: GitHub Actions**
- **Settings → Pages → Enforce HTTPS**, once the certificate provisions

To publish at `fabbarix.github.io/claude-pages/` instead, drop `public/CNAME`
and set Vite's `base` to `/claude-pages/` — a project site without a custom
domain lives under `/<repo>/`, and root-absolute assets would 404 there.

## Installing it as an app

The site is a PWA: `public/manifest.webmanifest` plus the icons and
`public/sw.js` make it installable and usable offline.

- **Android / Chrome** — "Install app" from the browser menu. The install
  dialog shows the screenshots listed in the manifest.
- **iOS / Safari** — Share → "Add to Home Screen". iOS reads the
  `apple-touch-icon` and `apple-mobile-web-app-*` tags in `index.html` rather
  than the manifest.

The service worker fetches navigations network-first, so a deploy is picked up
on the next launch. Hashed files under `/assets/` are cache-first, since their
names change whenever their contents do. Bump `CACHE` in `sw.js` when the
caching rules themselves change.

## Icons

`design/` holds the SVG sources; everything in `public/` is generated from
them. After editing a source:

```bash
npm run icons
```

That needs Playwright's Chromium (`npx playwright install chromium`) to
rasterise. It is deliberately not a project dependency — the PNGs are
committed, so CI never runs it. The manifest screenshots are captured from the
running app and are refreshed by hand when the UI changes materially.

## Notes

- Scores are kept in `localStorage` on the device that entered them
  (`src/storage.js` adapts the component's async storage API). Clearing site
  data clears the scorecard.
- The transfer screen's camera needs a secure context. The deployed site is
  HTTPS, so it works there; over plain `http://` on a LAN address the browser
  will refuse and you can paste codes instead.
- Installed or not, everything stays on the device; the app makes no network
  requests of its own.
- The QR encoder and decoder are in `src/EVScorecard.jsx` with no dependencies;
  the decoder is only used on browsers without a built-in `BarcodeDetector`
  (Safari).
