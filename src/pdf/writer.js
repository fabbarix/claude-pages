/* A small PDF 1.4 writer.

   Emits real PDF objects — vector paths and Type1 text in content streams —
   so the output is selectable, searchable and sharp at any zoom, rather than a
   screenshot wrapped in a page. Only the base-14 fonts are used, so nothing
   has to be embedded and the whole thing costs a few KB.

   Coordinates here are top-left origin with y increasing downwards, which is
   how the layout code wants to think; toY() flips into PDF's bottom-left space
   at the moment of writing. */

/* Advance widths, 1/1000 em, for character codes 32..126. These are the Adobe
   metrics for the two faces; accented Latin-1 letters share the width of their
   base letter, which widthOf() relies on. */
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/* Unicode that WinAnsi keeps in the 0x80-0x9F block, plus the width to bill it. */
const WINANSI_HIGH = {
  "€": [0x80, 556], "‚": [0x82, 222], "ƒ": [0x83, 556],
  "„": [0x84, 333], "…": [0x85, 1000], "†": [0x86, 556],
  "‡": [0x87, 556], "ˆ": [0x88, 333], "‰": [0x89, 1000],
  "Š": [0x8a, 667], "‹": [0x8b, 333], "Œ": [0x8c, 1000],
  "Ž": [0x8e, 611], "‘": [0x91, 222], "’": [0x92, 222],
  "“": [0x93, 333], "”": [0x94, 333], "•": [0x95, 350],
  "–": [0x96, 556], "—": [0x97, 1000], "˜": [0x98, 333],
  "™": [0x99, 1000], "š": [0x9a, 500], "›": [0x9b, 333],
  "œ": [0x9c, 944], "ž": [0x9e, 500], "Ÿ": [0x9f, 667],
};

/* Symbols the app itself uses that WinAnsi has no slot for. Anything else
   outside Latin-1 becomes '?' — the price of not embedding a Unicode font. */
const TRANSLITERATE = {
  "×": "x", "−": "-", "→": "->", "←": "<-",
  "≥": ">=", "≤": "<=", "⚡": "", "✓": "y", "✗": "n",
  "▸": ">", "─": "-", "·": "-",
};

/* Latin-1 letters map onto the width of the letter they decorate. */
function baseLetter(code) {
  if (code >= 0xc0 && code <= 0xc5) return 65;        // A-grave .. A-ring
  if (code === 0xc6) return -1;                        // AE, handled below
  if (code === 0xc7) return 67;                        // C-cedilla
  if (code >= 0xc8 && code <= 0xcb) return 69;         // E-*
  if (code >= 0xcc && code <= 0xcf) return 73;         // I-*
  if (code === 0xd0) return 68;
  if (code === 0xd1) return 78;
  if (code >= 0xd2 && code <= 0xd6) return 79;         // O-*
  if (code >= 0xd8 && code <= 0xd8) return 79;
  if (code >= 0xd9 && code <= 0xdc) return 85;         // U-*
  if (code === 0xdd) return 89;
  if (code >= 0xe0 && code <= 0xe5) return 97;         // a-*
  if (code === 0xe7) return 99;
  if (code >= 0xe8 && code <= 0xeb) return 101;        // e-*
  if (code >= 0xec && code <= 0xef) return 105;        // i-*
  if (code === 0xf1) return 110;
  if (code >= 0xf2 && code <= 0xf6) return 111;        // o-*
  if (code === 0xf8) return 111;
  if (code >= 0xf9 && code <= 0xfc) return 117;        // u-*
  if (code === 0xfd || code === 0xff) return 121;
  return -1;
}

/* One source of truth for both measuring and drawing: every character
   resolves to a list of WinAnsi byte codes. */
function toCodes(str) {
  const out = [];
  for (const ch of String(str == null ? "" : str)) {
    const high = WINANSI_HIGH[ch];
    if (high) { out.push(high[0]); continue; }
    const swap = TRANSLITERATE[ch];
    if (swap !== undefined) {
      for (const c of swap) out.push(c.charCodeAt(0));
      continue;
    }
    const code = ch.codePointAt(0);
    if (code >= 32 && code <= 126) { out.push(code); continue; }
    if (code >= 0xa0 && code <= 0xff) { out.push(code); continue; }
    if (code === 9) { out.push(32); continue; }
    if (code < 32) continue;
    out.push(63); // '?'
  }
  return out;
}

/* code -> width, for the WinAnsi high block. */
const HIGH_WIDTH = new Map(Object.values(WINANSI_HIGH).map(([code, w]) => [code, w]));

function codeWidth(code, bold) {
  const table = bold ? W_BOLD : W_REGULAR;
  if (code >= 32 && code <= 126) return table[code - 32];
  const high = HIGH_WIDTH.get(code);
  if (high !== undefined) return high;
  if (code === 0xa0) return table[0];             // non-breaking space
  if (code === 0xdf) return bold ? 611 : 500;     // sharp s
  if (code === 0xe6) return 889;                  // ae
  if (code === 0xc6) return 1000;                 // AE
  const base = baseLetter(code);
  if (base > 0) return table[base - 32];
  return table[63 - 32];                          // '?'
}

const hex = (h) => {
  const s = String(h).replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255,
  ];
};
const n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

export class PDFDoc {
  constructor(opts = {}) {
    this.width = opts.width || 595.28;   // A4 portrait, points
    this.height = opts.height || 841.89;
    this.margin = opts.margin || 48;
    this.info = opts.info || {};
    this.pages = [];
    this.ops = null;
    this.y = 0;
    this.addPage();
  }

  /* ---- pages ---- */

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = this.margin;
    return this.pages.length;
  }
  get pageCount() { return this.pages.length; }
  get contentWidth() { return this.width - this.margin * 2; }
  get bottom() { return this.height - this.margin; }

  /* Start a new page when `need` points would overflow the text area. */
  ensure(need, onNewPage) {
    if (this.y + need <= this.bottom) return false;
    this.addPage();
    if (onNewPage) onNewPage();
    return true;
  }

  toY(y) { return this.height - y; }
  push(op) { this.ops.push(op); }

  /* ---- graphics state ---- */

  save() { this.push("q"); }
  restore() { this.push("Q"); }
  fill(color) { const [r, g, b] = hex(color); this.push(`${n(r)} ${n(g)} ${n(b)} rg`); }
  stroke(color) { const [r, g, b] = hex(color); this.push(`${n(r)} ${n(g)} ${n(b)} RG`); }
  lineWidth(w) { this.push(`${n(w)} w`); }
  dash(on, off) { this.push(off ? `[${n(on)} ${n(off)}] 0 d` : "[] 0 d"); }
  alpha(a) { this.push(`/GS${a === 1 ? "1" : String(Math.round(a * 100))} gs`); }

  /* ---- shapes ---- */

  rect(x, y, w, h, style = "f") {
    this.push(`${n(x)} ${n(this.toY(y + h))} ${n(w)} ${n(h)} re`);
    this.push(style === "f" ? "f" : style === "s" ? "S" : "B");
  }

  roundRect(x, y, w, h, r, style = "f") {
    const k = 0.5523 * r;
    const y0 = this.toY(y + h), y1 = this.toY(y);
    this.push(`${n(x + r)} ${n(y0)} m`);
    this.push(`${n(x + w - r)} ${n(y0)} l`);
    this.push(`${n(x + w - r + k)} ${n(y0)} ${n(x + w)} ${n(y0 + r - k)} ${n(x + w)} ${n(y0 + r)} c`);
    this.push(`${n(x + w)} ${n(y1 - r)} l`);
    this.push(`${n(x + w)} ${n(y1 - r + k)} ${n(x + w - r + k)} ${n(y1)} ${n(x + w - r)} ${n(y1)} c`);
    this.push(`${n(x + r)} ${n(y1)} l`);
    this.push(`${n(x + r - k)} ${n(y1)} ${n(x)} ${n(y1 - r + k)} ${n(x)} ${n(y1 - r)} c`);
    this.push(`${n(x)} ${n(y0 + r)} l`);
    this.push(`${n(x)} ${n(y0 + r - k)} ${n(x + r - k)} ${n(y0)} ${n(x + r)} ${n(y0)} c`);
    this.push("h");
    this.push(style === "f" ? "f" : style === "s" ? "S" : "B");
  }

  line(x1, y1, x2, y2) {
    this.push(`${n(x1)} ${n(this.toY(y1))} m ${n(x2)} ${n(this.toY(y2))} l S`);
  }

  poly(points, style = "f", close = true) {
    if (!points.length) return;
    points.forEach(([x, y], i) => {
      this.push(`${n(x)} ${n(this.toY(y))} ${i ? "l" : "m"}`);
    });
    if (close) this.push("h");
    this.push(style === "f" ? "f" : style === "s" ? "S" : "B");
  }

  circle(cx, cy, r, style = "f") {
    const k = 0.5523 * r, y = this.toY(cy);
    this.push(`${n(cx + r)} ${n(y)} m`);
    this.push(`${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c`);
    this.push(`${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c`);
    this.push(`${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c`);
    this.push(`${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c`);
    this.push("h");
    this.push(style === "f" ? "f" : style === "s" ? "S" : "B");
  }

  /* ---- text ---- */

  widthOf(str, size, bold = false) {
    let total = 0;
    for (const code of toCodes(str)) total += codeWidth(code, bold);
    return (total * size) / 1000;
  }

  /* Greedy wrap. Words longer than the column are broken rather than allowed
     to run into the margin. */
  wrap(str, size, bold, maxWidth) {
    const lines = [];
    for (const para of String(str == null ? "" : str).split(/\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let line = "";
      for (let word of words) {
        while (this.widthOf(word, size, bold) > maxWidth) {
          let cut = word.length - 1;
          while (cut > 1 && this.widthOf(word.slice(0, cut) + "-", size, bold) > maxWidth) cut--;
          if (line) { lines.push(line); line = ""; }
          lines.push(word.slice(0, cut) + "-");
          word = word.slice(cut);
        }
        const candidate = line ? line + " " + word : word;
        if (line && this.widthOf(candidate, size, bold) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  /* Truncate to fit, appending an ellipsis when something had to go. */
  clip(str, size, bold, maxWidth) {
    if (this.widthOf(str, size, bold) <= maxWidth) return str;
    let out = String(str);
    while (out.length > 1 && this.widthOf(out + "…", size, bold) > maxWidth) {
      out = out.slice(0, -1);
    }
    return out.replace(/[\s,;:.-]+$/, "") + "…";
  }

  text(str, x, y, opts = {}) {
    const size = opts.size || 9;
    const bold = !!opts.bold;
    const codes = toCodes(str);
    if (!codes.length) return;
    let tx = x;
    if (opts.align === "right") tx = x - this.widthOf(str, size, bold);
    else if (opts.align === "center") tx = x - this.widthOf(str, size, bold) / 2;
    if (opts.color) this.fill(opts.color);
    let esc = "";
    for (const code of codes) {
      if (code === 40 || code === 41 || code === 92) esc += "\\";
      esc += String.fromCharCode(code);
    }
    this.push(`BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(tx)} ${n(this.toY(y))} Td (${esc}) Tj ET`);
  }

  /* ---- serialise ---- */

  build() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };

    const catalogId = add(null);          // reserved, filled once ids are known
    const pagesId = add(null);
    const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    /* Two alpha states, enough for the translucent radar fills. */
    const gs20 = add("<< /Type /ExtGState /ca 0.2 /CA 1 >>");
    const gs12 = add("<< /Type /ExtGState /ca 0.12 /CA 1 >>");
    const gs1 = add("<< /Type /ExtGState /ca 1 /CA 1 >>");

    const pageIds = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> ` +
        `/ExtGState << /GS20 ${gs20} 0 R /GS12 ${gs12} 0 R /GS1 ${gs1} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`,
      );
      pageIds.push(pageId);
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    const infoId = add(
      "<< " +
      Object.entries(this.info)
        .filter(([, v]) => v)
        .map(([k, v]) => `/${k} (${String(v).replace(/([()\\])/g, "\\$1")})`)
        .join(" ") +
      " >>",
    );

    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [0];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`;
    out += `startxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/* PDF wants D:YYYYMMDDHHmmSS with a signed UTC offset. */
export function pdfDate(d) {
  const p = (v, w = 2) => String(Math.abs(v)).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  return (
    `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
    `${off >= 0 ? "+" : "-"}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`
  );
}
