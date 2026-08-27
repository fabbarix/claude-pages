/* Lays out the scorecard as a printable report.

   Chart choices, in the order the data-viz method asks for them:
     - Standings are a magnitude comparison of one measure, so they are a
       sorted horizontal bar chart in a single hue. One series needs no legend;
       the heading names it.
     - The category comparison is a radar, which is only defensible because
       every axis is the same 1-5 scale. Overlapping polygons make every pair
       adjacent, so the overlay is capped at three cars — past that no
       categorical set clears the all-pairs separation floors. Every car still
       appears in the table underneath and in its own per-car radar.
     - Per-car scoring is two series (the two scorers), so it keeps the app's
       own blue and pink and always carries a legend.

   Palettes were checked with the method's validator against a white page:
   the three car hues pass all-pairs, and the scorer pair passes outright.
   The aqua slot lands under 3:1 against white, so it is never the only cue —
   direct labels and the category table carry the same numbers. */

import { PDFDoc, pdfDate } from "./writer.js";
import {
  GROUPS, FACTS, KIT, KITIDS, ORDER, PENALTY, REQLABEL,
  groupAvg, kitHit, totalFor, combined, countDone,
} from "../EVScorecard.jsx";

/* ---- design tokens ---- */

const INK = "#10161C";
const BODY = "#2B343C";
const MUTED = "#68727C";
const FAINT = "#9AA3AA";
const RULE = "#DCE0E2";
const WASH = "#F4F6F7";
const WHITE = "#FFFFFF";
const WARM = "#B4531B";
const GOOD = "#1B6B4A";

/* Scorer identity, matching the app. */
const SCORER = { a: "#3A2FD6", b: "#C2255C" };

/* Car identity for the radar overlay: slots 1-3 of the reference categorical
   palette, the largest set that clears the all-pairs floors. */
const CAR_HUES = ["#2a78d6", "#eb6834", "#1baf7a"];

const PAGE = { width: 595.28, height: 841.89, margin: 46 };

const round1 = (v) => Math.round(v * 10) / 10;
const fmtScore = (v) => (v === null || v === undefined ? "–" : String(Math.round(v)));

/* Share of the 2 x ORDER.length possible ratings actually entered. A car can
   top the standings on a handful of ratings, because the app averages whatever
   it has; the report says so rather than letting the number stand alone. */
const coverage = (car) => (countDone(car, "a") + countDone(car, "b")) / (ORDER.length * 2);
const THIN = 0.5;

/* Both scorers averaged for one category, or null when neither rated it. */
function categoryValue(car, gid) {
  const both = ["a", "b"].map((w) => groupAvg(car, w, gid)).filter((v) => v !== null);
  return both.length ? both.reduce((s, v) => s + v, 0) / both.length : null;
}

/* A radar needs a value on every spoke. Plotting a missing category as zero
   would draw it as a rating of zero, which is a different claim entirely, so
   incomplete series are left off and named instead. */
const hasEveryCategory = (values) => values.every((v) => v !== null);

/* ---- shared furniture ---- */

function header(doc, title, sub) {
  doc.y = PAGE.margin;
  doc.fill(INK);
  doc.text(title, PAGE.margin, doc.y + 9, { size: 10, bold: true, color: INK });
  if (sub) doc.text(sub, PAGE.width - PAGE.margin, doc.y + 9, { size: 8.5, color: FAINT, align: "right" });
  doc.y += 16;
  doc.stroke(RULE); doc.lineWidth(0.7);
  doc.line(PAGE.margin, doc.y, PAGE.width - PAGE.margin, doc.y);
  doc.y += 22;
}

function sectionTitle(doc, text, note) {
  doc.ensure(46);
  doc.text(text.toUpperCase(), PAGE.margin, doc.y + 9, { size: 9.5, bold: true, color: INK });
  doc.y += 14;
  if (note) {
    for (const line of doc.wrap(note, 8.5, false, doc.contentWidth)) {
      doc.text(line, PAGE.margin, doc.y + 7, { size: 8.5, color: MUTED });
      doc.y += 11;
    }
  }
  doc.y += 6;
}

/* Footers are stamped once at the end, when the page count is known. */
function stampFooters(doc, label) {
  const total = doc.pageCount;
  doc.pages.forEach((ops, i) => {
    const saved = doc.ops;
    doc.ops = ops;
    const y = PAGE.height - PAGE.margin + 18;
    doc.stroke(RULE); doc.lineWidth(0.7);
    doc.line(PAGE.margin, y - 12, PAGE.width - PAGE.margin, y - 12);
    doc.text(label, PAGE.margin, y, { size: 7.5, color: FAINT });
    doc.text(`${i + 1} of ${total}`, PAGE.width - PAGE.margin, y, { size: 7.5, color: FAINT, align: "right" });
    doc.ops = saved;
  });
}

/* ---- charts ---- */

/* Sorted horizontal bars, one hue, value labelled at the end of each bar. */
function barChart(doc, rows, opts = {}) {
  const labelW = opts.labelW || 132;
  const valueW = 34;
  const x = PAGE.margin + labelW + 8;
  const w = doc.contentWidth - labelW - 8 - valueW;
  const rowH = 19;
  const max = opts.max || 100;

  rows.forEach((row) => {
    doc.ensure(rowH + 4);
    const cy = doc.y + rowH / 2;
    doc.text(doc.clip(row.label, 9, false, labelW), PAGE.margin + labelW, cy + 3,
      { size: 9, color: BODY, align: "right" });

    doc.fill(WASH);
    doc.roundRect(x, cy - 5, w, 10, 2.5, "f");

    const frac = Math.max(0, Math.min(1, (row.value || 0) / max));
    if (frac > 0) {
      doc.fill(row.color || INK);
      doc.roundRect(x, cy - 5, Math.max(4, w * frac), 10, 2.5, "f");
    }
    if (row.note) {
      doc.text(row.note, x + w * frac + 6, cy + 3, { size: 7, color: MUTED });
    }
    doc.text(fmtScore(row.value), PAGE.width - PAGE.margin, cy + 3,
      { size: 9.5, bold: true, color: row.note ? MUTED : INK, align: "right" });
    doc.y += rowH;
  });
}

/* Radar. `series` is [{ label, color, values }] with values on 0..5 in the
   order of `axes`. Rings are drawn at every whole point so the reader can
   count rather than estimate. */
function radar(doc, cx, cy, radius, axes, series) {
  const rings = 5;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const point = (i, v) => [
    cx + Math.cos(angle(i)) * radius * (v / rings),
    cy + Math.sin(angle(i)) * radius * (v / rings),
  ];

  doc.save();
  doc.lineWidth(0.6);
  doc.stroke(RULE);
  for (let r = 1; r <= rings; r++) {
    doc.poly(axes.map((_, i) => point(i, r)), "s", true);
  }
  doc.stroke("#E8EBEC");
  axes.forEach((_, i) => {
    const [px, py] = point(i, rings);
    doc.line(cx, cy, px, py);
  });

  series.forEach((s) => {
    const pts = s.values.map((v, i) => point(i, Math.max(0, Math.min(rings, v || 0))));
    doc.alpha(series.length > 1 ? 0.12 : 0.2);
    doc.fill(s.color);
    doc.poly(pts, "f", true);
    doc.alpha(1);
    doc.stroke(s.color);
    doc.lineWidth(1.8);
    doc.poly(pts, "s", true);
    pts.forEach(([px, py]) => {
      doc.fill(WHITE);
      doc.circle(px, py, 2.9, "f");
      doc.fill(s.color);
      doc.circle(px, py, 1.9, "f");
    });
  });

  /* Ring scale last, on a small white chip, so a polygon edge never sits on
     top of the numbers. */
  for (let r = 1; r <= rings; r++) {
    const [, py] = point(0, r);
    doc.fill(WHITE);
    doc.rect(cx + 2.5, py - 3.5, 8, 7, "f");
    doc.text(String(r), cx + 4.5, py + 2.5, { size: 6, color: FAINT });
  }
  doc.restore();

  /* Axis labels, nudged outward and aligned by which side they sit on. */
  axes.forEach((axis, i) => {
    const a = angle(i);
    const lx = cx + Math.cos(a) * (radius + 13);
    const ly = cy + Math.sin(a) * (radius + 13) + 3;
    const cos = Math.cos(a);
    const align = Math.abs(cos) < 0.25 ? "center" : cos > 0 ? "left" : "right";
    doc.text(axis, lx, ly, { size: 8, bold: true, color: BODY, align });
  });
}

function legend(doc, items, x, y, opts = {}) {
  let cx = x;
  const size = opts.size || 8.5;
  items.forEach((item) => {
    doc.fill(item.color);
    doc.roundRect(cx, y - 5, 9, 9, 2, "f");
    doc.text(item.label, cx + 13, y + 2.5, { size, color: BODY });
    cx += 13 + doc.widthOf(item.label, size, false) + (opts.gap || 16);
  });
}

/* ---- tables ---- */

function tableHead(doc, cols) {
  doc.fill(WASH);
  doc.rect(PAGE.margin, doc.y, doc.contentWidth, 18, "f");
  cols.forEach((c) => {
    doc.text(c.title, c.align === "right" ? c.x + c.w : c.x + 4, doc.y + 12,
      { size: 7.5, bold: true, color: MUTED, align: c.align === "right" ? "right" : "left" });
  });
  doc.y += 18;
}

function tableRow(doc, cols, cells, opts = {}) {
  const h = opts.height || 17;
  if (opts.zebra) {
    doc.fill("#FAFBFB");
    doc.rect(PAGE.margin, doc.y, doc.contentWidth, h, "f");
  }
  cols.forEach((c, i) => {
    const cell = cells[i];
    if (cell === null || cell === undefined || cell === "") return;
    const value = typeof cell === "object" ? cell.text : cell;
    const color = (typeof cell === "object" && cell.color) || BODY;
    const bold = typeof cell === "object" && !!cell.bold;
    const size = opts.size || 8.5;
    doc.text(doc.clip(String(value), size, bold, c.w - 6),
      c.align === "right" ? c.x + c.w : c.x + 4, doc.y + h / 2 + 3,
      { size, bold, color, align: c.align === "right" ? "right" : "left" });
  });
  doc.y += h;
  doc.stroke(RULE); doc.lineWidth(0.5);
  doc.line(PAGE.margin, doc.y, PAGE.width - PAGE.margin, doc.y);
}

/* Call before each row: starts a new page and repeats the column header when
   the row would otherwise run under the footer. */
function rowGuard(doc, cols, height, onBreak) {
  doc.ensure(height, () => {
    if (onBreak) onBreak();
    tableHead(doc, cols);
  });
}

function columns(spec) {
  let x = PAGE.margin;
  return spec.map((s) => {
    const col = { ...s, x, w: s.w };
    x += s.w;
    return col;
  });
}

/* ---- report ---- */

export function buildReport(state, now = new Date()) {
  const { cars, names, weights, req } = state;
  const doc = new PDFDoc({
    ...PAGE,
    info: {
      Title: "Test drive scorecard report",
      Author: `${asciiish(names.a)} and ${asciiish(names.b)}`,
      Subject: "Side-by-side test drive scoring",
      Creator: "Test drive scorecard",
      Producer: "Test drive scorecard",
      CreationDate: pdfDate(now),
    },
  });

  const dateLabel = now.toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const scored = cars.filter((c) => combined(c, weights, req) !== null);
  const ranked = [...scored].sort((x, y) => combined(y, weights, req) - combined(x, weights, req));

  coverPage(doc, { cars, ranked, names, weights, req, dateLabel, now });
  if (ranked.length) comparisonPage(doc, { ranked, cars, names, weights, req });
  ranked.forEach((car, i) => carPages(doc, car, i, { ranked, names, weights, req }));
  if (cars.length) appendixPage(doc, { cars, names, weights, req });

  stampFooters(doc, `Test drive scorecard  ·  ${dateLabel}`);
  return doc.build();
}

/* The Info dictionary is a plain byte string; keep it to characters that
   survive without an encoding prefix. */
function asciiish(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, "");
}

function coverPage(doc, { cars, ranked, names, weights, req, dateLabel }) {
  doc.y = PAGE.margin;

  /* Masthead */
  doc.fill(INK);
  doc.rect(PAGE.margin, doc.y, doc.contentWidth, 92, "f");
  doc.text("TEST DRIVE SCORECARD", PAGE.margin + 20, doc.y + 30,
    { size: 10.5, bold: true, color: "#8E97A0" });
  doc.text("Comparison report", PAGE.margin + 20, doc.y + 58, { size: 22, bold: true, color: WHITE });
  doc.text(dateLabel, PAGE.width - PAGE.margin - 20, doc.y + 58,
    { size: 9.5, color: "#8E97A0", align: "right" });
  doc.text(`${names.a} and ${names.b}`, PAGE.width - PAGE.margin - 20, doc.y + 30,
    { size: 9.5, color: "#8E97A0", align: "right" });
  doc.y += 92 + 26;

  if (!ranked.length) {
    doc.text("Nothing has been scored yet.", PAGE.margin, doc.y + 12, { size: 12, bold: true, color: INK });
    doc.y += 24;
    doc.text("Add a car and rate it, then generate the report again.",
      PAGE.margin, doc.y + 10, { size: 9.5, color: MUTED });
    return;
  }

  /* Verdict */
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const top = combined(winner, weights, req);
  const gap = runnerUp ? top - combined(runnerUp, weights, req) : null;

  doc.fill(WASH);
  doc.roundRect(PAGE.margin, doc.y, doc.contentWidth, 76, 4, "f");
  doc.text(coverage(ranked[0]) < THIN ? "TOP SCORE SO FAR" : "LEADING",
    PAGE.margin + 18, doc.y + 22, { size: 8, bold: true, color: MUTED });
  doc.text(doc.clip(winner.name, 19, true, doc.contentWidth - 150), PAGE.margin + 18, doc.y + 48,
    { size: 19, bold: true, color: INK });
  doc.text(fmtScore(top), PAGE.width - PAGE.margin - 18, doc.y + 45,
    { size: 30, bold: true, color: INK, align: "right" });
  doc.text("out of 100", PAGE.width - PAGE.margin - 18, doc.y + 66,
    { size: 7.5, color: MUTED, align: "right" });
  const thin = coverage(winner) < THIN;
  const verdict = thin
    ? `Rated on only ${countDone(winner, "a") + countDone(winner, "b")} of ${ORDER.length * 2} scores — not yet comparable.`
    : gap === null
      ? "The only car scored so far."
      : gap < 2
        ? `Effectively tied with ${runnerUp.name} — ${round1(gap)} points in it.`
        : `Ahead of ${runnerUp.name} by ${round1(gap)} points.`;
  doc.text(doc.clip(verdict, 9, false, doc.contentWidth - 150), PAGE.margin + 18, doc.y + 64,
    { size: 9, color: thin ? WARM : MUTED });
  doc.y += 76 + 28;

  /* Standings */
  sectionTitle(doc, "Standings",
    "Weighted score out of 100, averaged across both scorers, after equipment deductions.");
  barChart(doc, ranked.map((c) => ({
    label: c.name,
    value: combined(c, weights, req),
    color: coverage(c) < THIN ? "#B6BEC4" : c === winner ? INK : "#5A646E",
    note: coverage(c) < THIN ? "part-rated" : "",
  })));
  if (ranked.some((c) => coverage(c) < THIN)) {
    doc.y += 4;
    doc.text("Pale bars are part-rated: their score comes from a fraction of the criteria and will move.",
      PAGE.margin, doc.y + 8, { size: 8, color: MUTED });
    doc.y += 12;
  }
  doc.y += 16;

  /* Per-scorer split */
  sectionTitle(doc, "How each of you scored it", null);
  const cols = columns([
    { title: "Car", w: 176 },
    { title: names.a, w: 68, align: "right" },
    { title: names.b, w: 68, align: "right" },
    { title: "Combined", w: 74, align: "right" },
    { title: "Rated", w: 60, align: "right" },
    { title: "Kit penalty", w: 57, align: "right" },
  ]);
  tableHead(doc, cols);
  ranked.forEach((c, i) => {
    rowGuard(doc, cols, 17, () => header(doc, "Standings", "continued"));
    const hit = kitHit(c, req);
    const done = countDone(c, "a") + countDone(c, "b");
    tableRow(doc, cols, [
      { text: `${i + 1}.  ${c.name}`, bold: i === 0 },
      { text: fmtScore(totalFor(c, "a", weights, req)), color: SCORER.a },
      { text: fmtScore(totalFor(c, "b", weights, req)), color: SCORER.b },
      { text: fmtScore(combined(c, weights, req)), bold: true },
      `${done} of ${ORDER.length * 2}`,
      hit.points ? { text: `-${hit.points}`, color: WARM } : "—",
    ], { zebra: i % 2 === 1 });
  });
  doc.y += 20;

  /* Method */
  sectionTitle(doc, "What this score means", null);
  const weightLine = GROUPS.map((g) => `${g.name} ${weights[g.id]}x`).join("   ·   ");
  doc.text(weightLine, PAGE.margin, doc.y + 8, { size: 8.5, color: BODY });
  doc.y += 16;
  const wanted = KITIDS.filter((k) => (req[k] || 0) > 0);
  const kitName = Object.fromEntries(KIT);
  const kitLine = wanted.length
    ? wanted.map((k) => `${kitName[k]} (${REQLABEL[req[k]].toLowerCase()})`).join(", ")
    : "No equipment requirements set.";
  for (const line of doc.wrap(
    `Each category is averaged, weighted as above, and rescaled to 100. ` +
    `A missing "nice to have" costs ${PENALTY[1]} points and a missing "must" costs ${PENALTY[2]}. ` +
    `Equipment asked for: ${kitLine}`,
    8.5, false, doc.contentWidth)) {
    doc.text(line, PAGE.margin, doc.y + 8, { size: 8.5, color: MUTED });
    doc.y += 11;
  }
  const unscored = cars.length - ranked.length;
  if (unscored > 0) {
    doc.y += 6;
    doc.text(`${unscored} car${unscored === 1 ? "" : "s"} had no ratings yet and ${unscored === 1 ? "is" : "are"} left out of the standings.`,
      PAGE.margin, doc.y + 8, { size: 8.5, color: WARM });
  }
}

function comparisonPage(doc, { ranked, cars, names, weights, req }) {
  doc.addPage();
  header(doc, "Comparison", "How the cars differ");

  const axes = GROUPS.map((g) => g.name);
  const plottable = ranked.filter((c) => hasEveryCategory(GROUPS.map((g) => categoryValue(c, g.id))));
  const overlay = plottable.slice(0, 3);
  const series = overlay.map((c, i) => ({
    label: c.name,
    color: CAR_HUES[i],
    values: GROUPS.map((g) => categoryValue(c, g.id)),
  }));

  const left = ranked.length - plottable.length;
  const note = [
    "Average of both scorers, 1 to 5 on each axis.",
    plottable.length > overlay.length
      ? `Showing the top ${overlay.length} of ${plottable.length} — three is the most that stay reliably distinguishable.`
      : "",
    left > 0
      ? `${left} car${left === 1 ? "" : "s"} cannot be plotted: a radar needs a rating in every category.`
      : "",
  ].filter(Boolean).join(" ");
  sectionTitle(doc, "Category profile", note);

  if (series.length) {
    const cx = PAGE.width / 2;
    const radius = 104;
    doc.y += 14;
    radar(doc, cx, doc.y + radius, radius, axes, series);
    doc.y += radius * 2 + 34;
    legend(doc, series.map((s) => ({ label: s.label, color: s.color })), PAGE.margin, doc.y);
    doc.y += 26;
  } else {
    doc.text("No car yet has a rating in all four categories.", PAGE.margin, doc.y + 10,
      { size: 9, color: MUTED });
    doc.y += 26;
  }

  /* The table is the relief for the low-contrast hue, and covers every car. */
  sectionTitle(doc, "Category averages", null);
  const cols = columns([
    { title: "Car", w: 155 },
    ...GROUPS.map((g) => ({ title: g.name, w: 74, align: "right" })),
    { title: "Overall", w: 51, align: "right" },
  ]);
  tableHead(doc, cols);
  ranked.forEach((c, i) => {
    rowGuard(doc, cols, 17, () => header(doc, "Category averages", "continued"));
    const vals = GROUPS.map((g) => {
      const v = categoryValue(c, g.id);
      return v === null ? null : round1(v);
    });
    tableRow(doc, cols, [
      { text: `${i + 1}.  ${c.name}`, bold: i === 0 },
      ...vals.map((v) => (v === null ? { text: "—", color: FAINT } : { text: v.toFixed(1) })),
      { text: fmtScore(combined(c, weights, req)), bold: true },
    ], { zebra: i % 2 === 1 });
  });
  doc.y += 22;

  /* Facts across every car, transposed so cars are columns. */
  sectionTitle(doc, "Facts side by side", "Best value in each row is marked.");
  const shown = cars.slice(0, 5);
  const carW = Math.min(84, (doc.contentWidth - 150) / Math.max(1, shown.length));
  const fcols = columns([
    { title: "", w: doc.contentWidth - carW * shown.length },
    ...shown.map((c) => ({ title: doc.clip(c.name, 7.5, true, carW - 6), w: carW, align: "right" })),
  ]);
  tableHead(doc, fcols);
  FACTS.forEach((f, i) => {
    rowGuard(doc, fcols, 17, () => header(doc, "Facts side by side", "continued"));
    const nums = shown.map((c) => parseFloat(c.facts[f.id]));
    const valid = nums.filter((v) => !isNaN(v));
    const best = valid.length > 1 ? (f.better === "low" ? Math.min(...valid) : Math.max(...valid)) : null;
    tableRow(doc, fcols, [
      { text: `${f.label}${f.unit ? " (" + f.unit + ")" : ""}`, color: MUTED },
      ...shown.map((c, ci) => {
        const raw = c.facts[f.id];
        if (!raw) return { text: "—", color: FAINT };
        return { text: String(raw), bold: best !== null && nums[ci] === best,
          color: best !== null && nums[ci] === best ? GOOD : BODY };
      }),
    ], { zebra: i % 2 === 1 });
  });
  if (cars.length > shown.length) {
    doc.y += 8;
    doc.text(`${cars.length - shown.length} further car${cars.length - shown.length === 1 ? "" : "s"} omitted from this table for width; each has its own page.`,
      PAGE.margin, doc.y + 8, { size: 8, color: MUTED });
    doc.y += 12;
  }
  doc.y += 20;

  /* Where the two scorers pull apart, per car. */
  sectionTitle(doc, "Agreement", "Gap between the two scorers on each car's final number.");
  const gapRows = ranked.map((c) => {
    const a = totalFor(c, "a", weights, req);
    const b = totalFor(c, "b", weights, req);
    return { label: c.name, a, b, gap: a === null || b === null ? null : Math.abs(a - b) };
  });
  const gcols = columns([
    { title: "Car", w: 168 },
    { title: names.a, w: 62, align: "right" },
    { title: names.b, w: 62, align: "right" },
    { title: "Gap", w: 44, align: "right" },
    { title: "", w: 167 },
  ]);
  tableHead(doc, gcols);
  gapRows.forEach((r, i) => {
    rowGuard(doc, gcols, 17, () => header(doc, "Agreement", "continued"));
    tableRow(doc, gcols, [
      r.label,
      { text: fmtScore(r.a), color: SCORER.a },
      { text: fmtScore(r.b), color: SCORER.b },
      r.gap === null ? "—" : { text: String(Math.round(r.gap)), bold: r.gap >= 10 },
      r.gap === null ? { text: "   only one of you has scored it", color: FAINT }
        : r.gap >= 10 ? { text: "   worth talking through", color: WARM }
          : r.gap <= 3 ? { text: "   close agreement", color: GOOD } : "",
    ], { zebra: i % 2 === 1 });
  });
}

function carPages(doc, car, index, { ranked, names, weights, req }) {
  doc.addPage();
  const thin = coverage(car) < THIN;
  const sub = thin
    ? `part-rated · ${countDone(car, "a") + countDone(car, "b")} of ${ORDER.length * 2} scores`
    : `${index + 1} of ${ranked.length} scored`;
  const repeat = () => header(doc, doc.clip(car.name, 10, true, 300), sub);
  repeat();

  /* Title block with both scores */
  doc.text(doc.clip(car.name, 20, true, doc.contentWidth - 140), PAGE.margin, doc.y + 18,
    { size: 20, bold: true, color: INK });
  doc.text(fmtScore(combined(car, weights, req)), PAGE.width - PAGE.margin, doc.y + 20,
    { size: 26, bold: true, color: INK, align: "right" });
  doc.y += 28;
  doc.text(`${names.a} ${fmtScore(totalFor(car, "a", weights, req))}`, PAGE.margin, doc.y + 8,
    { size: 9, bold: true, color: SCORER.a });
  doc.text(`${names.b} ${fmtScore(totalFor(car, "b", weights, req))}`,
    PAGE.margin + 74, doc.y + 8, { size: 9, bold: true, color: SCORER.b });
  doc.y += 22;

  /* Radar of this car alone, both scorers */
  const axes = GROUPS.map((g) => g.name);
  /* Only a scorer who rated every category can be drawn; a partial series
     would put zeros on the spokes they skipped. */
  const series = ["a", "b"].map((w) => ({
    label: names[w],
    color: SCORER[w],
    values: GROUPS.map((g) => groupAvg(car, w, g.id)),
  })).filter((s) => hasEveryCategory(s.values));

  if (series.length) {
    const radius = 84;
    const cx = PAGE.margin + 150;
    const top = doc.y + 8;
    radar(doc, cx, top + radius + 8, radius, axes, series);

    /* Facts sit beside the radar rather than under it. */
    const fx = cx + radius + 84;   // clear of the right-hand axis label
    const fy = factsBlock(doc, car, fx, top + 10, PAGE.width - PAGE.margin - fx);
    doc.y = Math.max(top + radius * 2 + 30, fy + 6);
    const missing = ["a", "b"].filter((w) => !series.some((s) => s.label === names[w]));
    legend(doc, series.map((s) => ({ label: s.label, color: s.color })), PAGE.margin, doc.y);
    if (missing.length) {
      doc.text(`${missing.map((w) => names[w]).join(" and ")} ` +
        `${missing.length === 1 ? "has" : "have"} not rated every category yet, so ` +
        `${missing.length === 1 ? "that profile is" : "those profiles are"} not plotted.`,
        PAGE.margin, doc.y + 18, { size: 8, color: MUTED });
      doc.y += 18;
    }
    doc.y += 24;
  } else {
    doc.y = factsBlock(doc, car, PAGE.margin, doc.y + 12, doc.contentWidth) + 4;
    doc.text("Neither of you has rated every category yet, so there is no profile to plot.",
      PAGE.margin, doc.y + 8, { size: 8.5, color: MUTED });
    doc.y += 22;
  }

  /* Equipment the pair actually asked for */
  const wanted = KITIDS.filter((k) => (req[k] || 0) > 0);
  if (wanted.length) {
    const kitName = Object.fromEntries(KIT);
    sectionTitle(doc, "Equipment", null);
    const cols = columns([
      { title: "Item", w: 300 },
      { title: "Wanted", w: 90, align: "right" },
      { title: "On this car", w: 113, align: "right" },
    ]);
    tableHead(doc, cols);
    wanted.forEach((k, i) => {
      rowGuard(doc, cols, 17, repeat);
      const has = car.kit[k];
      tableRow(doc, cols, [
        kitName[k],
        REQLABEL[req[k]],
        has === 1 ? { text: "yes", color: GOOD, bold: true }
          : has === 2 ? { text: `no  (-${PENALTY[req[k]]})`, color: WARM, bold: true }
            : { text: "not checked", color: FAINT },
      ], { zebra: i % 2 === 1 });
    });
    doc.y += 20;
  }

  /* Criterion by criterion, both scorers side by side */
  sectionTitle(doc, "Scores in detail",
    `Each criterion rated 1 to 5. ${names.a} on the left of each pair, ${names.b} on the right; ` +
    "gaps of two points or more are marked.");
  legend(doc, [{ label: names.a, color: SCORER.a }, { label: names.b, color: SCORER.b }],
    PAGE.margin, doc.y);
  doc.y += 18;

  const labelW = 190;
  const cellW = 15;
  const gridX = PAGE.margin + labelW + 10;

  const ROW_H = 15.5;
  GROUPS.forEach((g) => {
    /* Ask for the whole group when it is short, otherwise the header plus
       enough rows that a break never leaves one or two behind. */
    const wanted = 15 + Math.min(g.items.length, 4) * ROW_H;
    doc.ensure(wanted, repeat);
    doc.text(`${g.name}   ${weights[g.id]}x`, PAGE.margin, doc.y + 9,
      { size: 8.5, bold: true, color: INK });
    doc.y += 15;

    g.items.forEach(([id, label]) => {
      doc.ensure(ROW_H + 3, repeat);
      const a = car.scores.a[id];
      const b = car.scores.b[id];
      const split = typeof a === "number" && typeof b === "number" && Math.abs(a - b) >= 2;
      const rowY = doc.y;

      doc.text(doc.clip(label, 8.5, false, labelW), PAGE.margin, rowY + 10.5,
        { size: 8.5, color: split ? INK : BODY });

      /* Five cells per scorer: filled to the rating, like the app's own bar. */
      ["a", "b"].forEach((who, wi) => {
        const value = who === "a" ? a : b;
        for (let s = 1; s <= 5; s++) {
          const x = gridX + wi * (cellW * 5 + 14) + (s - 1) * cellW;
          const on = typeof value === "number" && s <= value;
          doc.fill(on ? SCORER[who] : "#E8EBEC");
          doc.roundRect(x, rowY + 3.5, cellW - 2.5, 9, 1.5, "f");
        }
        doc.text(typeof value === "number" ? String(value) : "–",
          gridX + wi * (cellW * 5 + 14) + cellW * 5 + 4, rowY + 11.5,
          { size: 8, bold: true, color: typeof value === "number" ? SCORER[who] : FAINT });
      });

      if (split) {
        doc.text("split", PAGE.width - PAGE.margin, rowY + 11.5,
          { size: 7.5, bold: true, color: WARM, align: "right" });
      }
      doc.y += ROW_H;
    });
    doc.y += 6;
  });

  /* Notes and deal-breakers */
  const hasNotes = car.notes.a || car.notes.b || car.flag.a || car.flag.b;
  if (hasNotes) {
    doc.ensure(60, repeat);
    sectionTitle(doc, "Notes", null);
    ["a", "b"].forEach((w) => {
      if (!car.notes[w]) return;
      doc.ensure(34, repeat);
      doc.text(names[w], PAGE.margin, doc.y + 8, { size: 8.5, bold: true, color: SCORER[w] });
      doc.y += 13;
      for (const line of doc.wrap(car.notes[w], 9, false, doc.contentWidth - 12)) {
        doc.ensure(13, repeat);
        doc.text(line, PAGE.margin + 12, doc.y + 8, { size: 9, color: BODY });
        doc.y += 12;
      }
      doc.y += 8;
    });
    ["a", "b"].forEach((w) => {
      if (!car.flag[w]) return;
      doc.ensure(34, repeat);
      const lines = doc.wrap(car.flag[w], 9, false, doc.contentWidth - 34);
      const boxH = 20 + lines.length * 12;
      doc.fill("#FDF3EA");
      doc.rect(PAGE.margin, doc.y, doc.contentWidth, boxH, "f");
      doc.fill(WARM);
      doc.rect(PAGE.margin, doc.y, 2.5, boxH, "f");
      doc.text(`DEAL-BREAKER · ${names[w]}`, PAGE.margin + 12, doc.y + 13,
        { size: 7.5, bold: true, color: WARM });
      lines.forEach((line, i) => {
        doc.text(line, PAGE.margin + 12, doc.y + 27 + i * 12, { size: 9, color: "#7A3A12" });
      });
      doc.y += boxH + 10;
    });
  }
}

/* Recorded facts as a label/value list. Returns the y it finished at. */
function factsBlock(doc, car, x, y, width) {
  doc.text("RECORDED FACTS", x, y, { size: 7.5, bold: true, color: MUTED });
  y += 14;
  let any = false;
  FACTS.forEach((f) => {
    const raw = car.facts[f.id];
    if (!raw) return;
    any = true;
    doc.text(f.label, x, y, { size: 8, color: MUTED });
    doc.text(`${raw}${f.unit ? " " + f.unit : ""}`, x + width, y,
      { size: 8.5, bold: true, color: BODY, align: "right" });
    y += 13;
  });
  if (!any) {
    doc.text("None recorded.", x, y, { size: 8, color: FAINT });
    y += 13;
  }
  return y;
}

function appendixPage(doc, { cars, names, weights, req }) {
  doc.addPage();
  header(doc, "Appendix", "Every split, widest first");

  /* Every split, in one place. */
  const splits = [];
  cars.forEach((c) => GROUPS.forEach((g) => g.items.forEach(([id, label]) => {
    const a = c.scores.a[id], b = c.scores.b[id];
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) >= 2) {
      splits.push({ car: c.name, group: g.name, label, a, b, gap: Math.abs(a - b) });
    }
  })));
  splits.sort((x, y) => y.gap - x.gap);

  sectionTitle(doc, "Where you disagree",
    splits.length
      ? "Two points apart or more, widest first."
      : "Nothing two points apart — you are rating these cars the same way.");

  if (splits.length) {
    const scols = columns([
      { title: "Car", w: 118 },
      { title: "Category", w: 92 },
      { title: "Criterion", w: 145 },
      { title: names.a, w: 50, align: "right" },
      { title: names.b, w: 50, align: "right" },
      { title: "Gap", w: 48, align: "right" },
    ]);
    tableHead(doc, scols);
    splits.forEach((s, i) => {
      rowGuard(doc, scols, 17, () => header(doc, "Appendix", "Where you disagree"));
      tableRow(doc, scols, [
        s.car, { text: s.group, color: MUTED }, s.label,
        { text: String(s.a), color: SCORER.a, bold: true },
        { text: String(s.b), color: SCORER.b, bold: true },
        { text: String(s.gap), bold: s.gap >= 3 },
      ], { zebra: i % 2 === 1 });
    });
  }
}

/* Hands the finished document to the browser as a download. */
export function downloadReport(state, now = new Date()) {
  const bytes = buildReport(state, now);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = `test-drive-scorecard-${stamp}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return bytes.length;
}
