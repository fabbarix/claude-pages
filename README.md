# Test drive scorecard

A two-person scorecard for EV test drives: score each car right after the drive,
compare weighted totals, and hand your data to the other phone over QR codes —
no network, no account, nothing leaves the devices.

Live site: **https://fabbarix.github.io/claude-pages/**

## Running it locally

```bash
npm install
npm run dev
```

`npm run build` produces a static `dist/`. The site is served from a
subdirectory on GitHub Pages, so the build reads `BASE_PATH` for Vite's `base`:

```bash
BASE_PATH=/claude-pages/ npm run build
npm run preview
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`, and can be run by hand from the Actions tab.

One-time setup: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

## Notes

- Scores are kept in `localStorage` on the device that entered them
  (`src/storage.js` adapts the component's async storage API). Clearing site
  data clears the scorecard.
- The transfer screen's camera needs a secure context. Pages is HTTPS, so it
  works there; over plain `http://` on a LAN address the browser will refuse
  and you can paste codes instead.
- The QR encoder and decoder are in `src/EVScorecard.jsx` with no dependencies;
  the decoder is only used on browsers without a built-in `BarcodeDetector`
  (Safari).
