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

## Who is scoring on which phone

Each device keeps a random `deviceId` and remembers which of the two scorers it
is set to. That claim travels in the transfer payload, so after a sync each
phone knows which slot the other one owns and marks it "other phone": switching
into it takes a confirmation rather than a tap. If both phones turn out to be
set to the same person, the receive screen says so and offers to move this
phone to the other slot before merging.

It is a guard rail, not a lock — taking over a slot is always one confirmation
away, so a flat battery on the other phone can never strand you. Solo use is
untouched: with no partner known, switching is free.

The wire format is versioned (`EVS1`/`EVS2`/`EVS3`), and each version records
how many header fields precede the cars, so codes from older builds still
import.

## The PDF report

The Results tab has a **Download PDF** button. `src/pdf/writer.js` is a small
PDF 1.4 writer and `src/pdf/report.js` lays the document out: the pages are
real PDF content streams — vector paths and Type1 text — rather than a
rendered page wrapped in a PDF, so the text is selectable and the charts stay
sharp at any zoom. Nothing is rasterised and no font is embedded, which keeps a
report to a few hundred KB.

The document runs: a cover with the verdict, standings and method; a comparison
page with a category spiderweb, per-category averages, facts side by side and
where the two of you disagree; a page per car with its own spiderweb, facts,
equipment and every criterion scored side by side with notes; and an appendix
listing every split.

Two limits worth knowing:

- Only the base-14 fonts are used, so text is limited to what WinAnsi encodes —
  Latin-1 plus smart quotes and dashes. Notes in other scripts come out as `?`.
  Embedding a Unicode font would fix it at the cost of a much larger bundle.
- A radar needs a value on every spoke, so a car (or a scorer) without a rating
  in all four categories is named rather than plotted. Plotting an unrated
  category as zero would claim something different from "not yet scored".

The generator is a separate chunk, fetched when the page goes idle so the
report still builds offline.

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
