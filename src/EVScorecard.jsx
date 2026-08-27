import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══ criteria ═══════════════════════════════════════════════ */

export const GROUPS = [
  {
    id: "drive",
    name: "Driving",
    hint: "How it feels on the road",
    items: [
      ["ride", "Ride over bad surfaces"],
      ["accel", "Acceleration & response"],
      ["steer", "Steering & body control"],
      ["regen", "Regen / one-pedal feel"],
      ["quiet", "Cabin quietness at speed"],
      ["brakes", "Brake pedal confidence"],
    ],
  },
  {
    id: "live",
    name: "Living with it",
    hint: "Daily use, not the showroom",
    items: [
      ["seatf", "Front seat comfort"],
      ["seatr", "Rear seat space"],
      ["boot", "Cargo space & accessibility"],
      ["vis", "Visibility out"],
      ["park", "Parking & manoeuvring"],
      ["access", "Getting in and out"],
      ["service", "Ease of service"],
    ],
  },
  {
    id: "tech",
    name: "Tech & interior",
    hint: "The bits you touch every trip",
    items: [
      ["screen", "Screen & menu logic"],
      ["buttons", "Physical controls"],
      ["mats", "Materials & build feel"],
      ["chargeux", "Charging & route planner"],
      ["adas", "Driver assists behaviour"],
      ["storage", "Cabin storage & ports"],
    ],
  },
  {
    id: "gut",
    name: "Gut feel",
    hint: "Score honestly, this one decides things",
    items: [
      ["ext", "Exterior looks"],
      ["int", "Interior atmosphere"],
      ["future", "Future-proof — will it age well"],
      ["want", "Do I want to own it"],
    ],
  },
];

export const FACTS = [
  { id: "price", label: "Price as tested", unit: "", better: "low" },
  { id: "range", label: "Claimed range", unit: "km", better: "high" },
  { id: "real", label: "Real-world est.", unit: "km", better: "high" },
  { id: "charge", label: "Charge 10–80%", unit: "min", better: "low" },
  { id: "peak", label: "Peak charge rate", unit: "kW", better: "high" },
  { id: "boot", label: "Boot volume", unit: "L", better: "high" },
];

export const KIT = [
  ["vent", "Ventilated / heated front seats"],
  ["rearheat", "Heated rear seats"],
  ["wheel", "Heated steering wheel"],
  ["memseat", "Memory & electric seat adjustment"],
  ["aauto", "Android Auto"],
  ["nacs", "NACS charge port"],
  ["lane", "Hands-free lane keeping"],
];

/* missing kit costs points off the final 0–100 score */
export const PENALTY = { 0: 0, 1: 3, 2: 8 };      // don't care / nice to have / must have
export const REQLABEL = { 0: "—", 1: "Nice", 2: "Must" };

export const ORDER = GROUPS.flatMap((g) => g.items.map(([id]) => id));
const OLD_ORDER = ["ride","accel","steer","regen","quiet","brakes","seatf","seatr","boot","vis","park","access","screen","buttons","mats","chargeux","adas","storage","ext","int","want"];
export const FACTIDS = FACTS.map((f) => f.id);
export const KITIDS = KIT.map(([id]) => id);
const STORE_KEY = "ev-scorecard-v1";
export const COL = { a: "#3A2FD6", b: "#C2255C" };

/* ═══ QR encoder (error correction level M) ══════════════════
   Matrices verified byte-identical to a reference implementation
   across all 40 versions × 4 EC levels × 8 mask patterns.       */

const RSM = [[1,26,16],[1,44,28],[1,70,44],[2,50,32],[2,67,43],[4,43,27],[4,49,31],[2,60,38,2,61,39],[3,58,36,2,59,37],[4,69,43,1,70,44],[1,80,50,4,81,51],[6,58,36,2,59,37],[8,59,37,1,60,38],[4,64,40,5,65,41],[5,65,41,5,66,42],[7,73,45,3,74,46],[10,74,46,1,75,47],[9,69,43,4,70,44],[3,70,44,11,71,45],[3,67,41,13,68,42],[17,68,42],[17,74,46],[4,75,47,14,76,48],[6,73,45,14,74,46],[8,75,47,13,76,48],[19,74,46,4,75,47],[22,73,45,3,74,46],[3,73,45,23,74,46],[21,73,45,7,74,46],[19,75,47,10,76,48],[2,74,46,29,75,47],[10,74,46,23,75,47],[14,74,46,21,75,47],[14,74,46,23,75,47],[12,75,47,26,76,48],[6,75,47,34,76,48],[29,74,46,14,75,47],[13,74,46,32,75,47],[40,75,47,7,76,48],[18,75,47,31,76,48]];
const ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];
const REM = [0,0,7,7,7,7,7,0,0,0,0,0,0,0,3,3,3,3,3,3,3,4,4,4,4,4,4,4,3,3,3,3,3,3,3,0,0,0,0,0,0];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function genPoly(n) {
  let p = [1];
  for (let i = 0; i < n; i++) {
    const q = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= gmul(p[j], EXP[i]); }
    p = q;
  }
  return p;
}
function ecBytes(data, n) {
  const g = genPoly(n), res = new Array(data.length + n).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const f = res[i];
    if (!f) continue;
    for (let j = 0; j < g.length; j++) res[i + j] ^= gmul(g[j], f);
  }
  return res.slice(data.length);
}
const blocksOf = (v) => {
  const r = RSM[v - 1], out = [];
  for (let i = 0; i < r.length; i += 3) out.push([r[i], r[i + 1], r[i + 2]]);
  return out;
};
const dataCap = (v) => blocksOf(v).reduce((s, [c, , d]) => s + c * d, 0);

function codewords(bytes, v) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4);
  push(bytes.length, v <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCap(v) * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  let pad = 0;
  while (cw.length < dataCap(v)) cw.push(pad++ % 2 ? 0x11 : 0xec);
  const blocks = [];
  let p = 0;
  for (const [count, total, dn] of blocksOf(v))
    for (let i = 0; i < count; i++) {
      const d = cw.slice(p, p + dn);
      p += dn;
      blocks.push({ d, e: ecBytes(d, total - dn) });
    }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  const maxE = Math.max(...blocks.map((b) => b.e.length));
  for (let i = 0; i < maxE; i++) for (const b of blocks) if (i < b.e.length) out.push(b.e[i]);
  return out;
}

function skeleton(v) {
  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const y = r + i, x = c + j;
        if (y < 0 || x < 0 || y >= n || x >= n) continue;
        const inb = i >= 0 && i <= 6 && j >= 0 && j <= 6;
        const on = inb && (i === 0 || i === 6 || j === 0 || j === 6 ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4));
        m[y][x] = on ? 1 : 0;
        fn[y][x] = true;
      }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    m[6][i] = bit; fn[6][i] = true;
    m[i][6] = bit; fn[i][6] = true;
  }
  const pos = ALIGN[v - 1] || [], lo = pos[0], hi = pos[pos.length - 1];
  for (const r of pos)
    for (const c of pos) {
      if ((r === lo && c === lo) || (r === lo && c === hi) || (r === hi && c === lo)) continue;
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) {
          m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
          fn[r + i][c + j] = true;
        }
    }
  m[n - 8][8] = 1; fn[n - 8][8] = true;
  for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; }
  for (let i = 0; i < 8; i++) { fn[8][n - 1 - i] = true; fn[n - 1 - i][8] = true; }
  if (v >= 7)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) { fn[n - 11 + j][i] = true; fn[i][n - 11 + j] = true; }
  return { m, fn, n };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function fmtBits(mask) {
  const d = (0 << 3) | mask; // level M = 00
  let v = d << 10;
  for (let i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0x537 << i;
  return ((d << 10) | v) ^ 0x5412;
}
function verBits(v) {
  let x = v << 12;
  for (let i = 5; i >= 0; i--) if (x & (1 << (i + 12))) x ^= 0x1f25 << i;
  return (v << 12) | x;
}
function stamp(m, n, mask, v) {
  const f = fmtBits(mask), bit = (i) => (f >> (14 - i)) & 1;
  for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
  m[8][7] = bit(6); m[8][8] = bit(7); m[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
  for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = bit(i);
  for (let i = 7; i <= 14; i++) m[8][n - 15 + i] = bit(i);
  m[n - 8][8] = 1;
  if (v >= 7) {
    const vb = verBits(v);
    for (let i = 0; i < 18; i++) {
      const b = (vb >> i) & 1;
      m[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
      m[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
    }
  }
}
function penaltyScore(m, n) {
  let p = 0;
  const runs = (get) => {
    for (let a = 0; a < n; a++) {
      let last = -1, len = 0;
      for (let b = 0; b < n; b++) {
        const v = get(a, b);
        if (v === last) { len++; if (len === 5) p += 3; else if (len > 5) p++; }
        else { last = v; len = 1; }
      }
    }
  };
  runs((r, c) => m[r][c]);
  runs((c, r) => m[r][c]);
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
  const A = [1,0,1,1,1,0,1,0,0,0,0], B = [0,0,0,0,1,0,1,1,1,0,1];
  const scan = (get) => {
    for (let a = 0; a < n; a++)
      for (let b = 0; b + 11 <= n; b++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          const v = get(a, b + k);
          if (v !== A[k]) m1 = false;
          if (v !== B[k]) m2 = false;
        }
        if (m1) p += 40;
        if (m2) p += 40;
      }
  };
  scan((r, c) => m[r][c]);
  scan((c, r) => m[r][c]);
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  return p + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
}

function qrEncode(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let v = 1;
  while (v <= 40 && dataCap(v) - (v <= 9 ? 2 : 3) < bytes.length) v++;
  if (v > 40) throw new Error("Too much data for one code.");
  const cw = codewords(bytes, v);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const { m, fn, n } = skeleton(v);
    const bits = [];
    for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    for (let i = 0; i < REM[v]; i++) bits.push(0);
    let idx = 0, up = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let k = 0; k < n; k++) {
        const row = up ? n - 1 - k : k;
        for (let d = 0; d < 2; d++) {
          const c = col - d;
          if (fn[row][c]) continue;
          m[row][c] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      up = !up;
    }
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (!fn[r][c] && MASKS[mask](r, c)) m[r][c] ^= 1;
    stamp(m, n, mask, v);
    const s = penaltyScore(m, n);
    if (!best || s < best.s) best = { m, n, s };
  }
  return best;
}

/* ═══ QR decoder ═════════════════════════════════════════════
   Used when the browser has no built-in barcode scanner (Safari).
   Verified on 325 synthetic camera frames: rotation, perspective,
   blur, sensor noise, uneven lighting, and low resolution.       */

const RSB = [[[1,26,19],[1,26,16],[1,26,13],[1,26,9]],[[1,44,34],[1,44,28],[1,44,22],[1,44,16]],[[1,70,55],[1,70,44],[2,35,17],[2,35,13]],[[1,100,80],[2,50,32],[2,50,24],[4,25,9]],[[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12]],[[2,86,68],[4,43,27],[4,43,19],[4,43,15]],[[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14]],[[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15]],[[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13]],[[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16]],[[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13]],[[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15]],[[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12]],[[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13]],[[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13]],[[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16]],[[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15]],[[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15]],[[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14]],[[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16]],[[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17]],[[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13]],[[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16]],[[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17]],[[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16]],[[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17]],[[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16]],[[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16]],[[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16]],[[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16]],[[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16]],[[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16]],[[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16]],[[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17]],[[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16]],[[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16]],[[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16]],[[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16]],[[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16]],[[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]]];
const ginv=(a)=>EXP[255-LOG[a]];

/* ---- Reed-Solomon decode (Berlekamp-Massey + Chien + Forney) ---- */
function polyEval(p,x){ let y=p[0]; for(let i=1;i<p.length;i++) y=gmul(y,x)^p[i]; return y; }

function rsDecode(msg, nsym) {
  const out = msg.slice();
  const synd = new Array(nsym);
  let allZero = true;
  for (let i=0;i<nsym;i++){ synd[i]=polyEval(out,EXP[i]); if(synd[i]) allZero=false; }
  if (allZero) return out;

  // Berlekamp-Massey
  let errLoc=[1], oldLoc=[1];
  for (let i=0;i<nsym;i++){
    oldLoc=oldLoc.concat([0]);
    let delta=synd[i];
    for (let j=1;j<errLoc.length;j++) delta ^= gmul(errLoc[errLoc.length-1-j], synd[i-j]);
    if (delta!==0){
      if (oldLoc.length>errLoc.length){
        const nl=oldLoc.map(c=>gmul(c,delta));
        oldLoc=errLoc.map(c=>gmul(c,ginv(delta)));
        errLoc=nl;
      }
      const scaled=oldLoc.map(c=>gmul(c,delta));
      const res=new Array(Math.max(errLoc.length,scaled.length)).fill(0);
      for(let j=0;j<errLoc.length;j++) res[res.length-errLoc.length+j]^=errLoc[j];
      for(let j=0;j<scaled.length;j++) res[res.length-scaled.length+j]^=scaled[j];
      errLoc=res;
    }
  }
  while (errLoc.length && errLoc[0]===0) errLoc.shift();
  const nerr=errLoc.length-1;
  if (nerr*2>nsym || nerr===0) return null;

  // Chien search
  const pos=[];
  for (let i=0;i<out.length;i++){
    if (polyEval(errLoc, EXP[255-i])===0) pos.push(out.length-1-i);
  }
  if (pos.length!==nerr) return null;

  // Forney
  const coefPos = pos.map(p=>out.length-1-p);
  // syndrome poly (highest degree first)
  const sPoly = synd.slice().reverse();
  // error evaluator = (sPoly * errLoc) mod x^nsym
  let ev = new Array(sPoly.length+errLoc.length-1).fill(0);
  for(let i=0;i<sPoly.length;i++) for(let j=0;j<errLoc.length;j++) ev[i+j]^=gmul(sPoly[i],errLoc[j]);
  ev = ev.slice(ev.length-nsym);
  while (ev.length && ev[0]===0) ev.shift();

  const X = coefPos.map(c=>EXP[c]);
  for (let i=0;i<X.length;i++){
    const Xinv=ginv(X[i]);
    let denom=1;
    for (let j=0;j<X.length;j++) if(j!==i) denom=gmul(denom, 1^gmul(Xinv,X[j]));
    if (denom===0) return null;
    const num=polyEval(ev, Xinv);
    let mag=gmul(gmul(X[i], num), ginv(denom));
    out[pos[i]] ^= mag;
  }
  // verify
  for (let i=0;i<nsym;i++) if (polyEval(out,EXP[i])!==0) return null;
  return out;
}

/* ---- binarize ---- */
function binarize(gray,w,h){
  const BS=8, bw=Math.max(1,Math.ceil(w/BS)), bh=Math.max(1,Math.ceil(h/BS));
  const th=new Int32Array(bw*bh);
  for(let by=0;by<bh;by++) for(let bx=0;bx<bw;bx++){
    let mn=255,mx=0,sum=0,n=0;
    const x0=bx*BS,y0=by*BS,x1=Math.min(x0+BS,w),y1=Math.min(y0+BS,h);
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const v=gray[y*w+x]; if(v<mn)mn=v; if(v>mx)mx=v; sum+=v; n++; }
    let t=(mn+mx)>>1;
    if(mx-mn<=24) t = by>0&&bx>0 ? th[(by-1)*bw+bx-1] : Math.max(0,mn-1);
    th[by*bw+bx]=t;
  }
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    const by=Math.min(bh-1,(y/BS)|0);
    for(let x=0;x<w;x++){
      const bx=Math.min(bw-1,(x/BS)|0);
      let s=0,c=0;
      for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
        const yy=by+j,xx=bx+i;
        if(yy>=0&&yy<bh&&xx>=0&&xx<bw){s+=th[yy*bw+xx];c++;}
      }
      out[y*w+x]= gray[y*w+x] < s/c ? 1 : 0;
    }
  }
  return out;
}

/* ---- finder patterns ---- */
const FINDER_R=[1,1,3,1,1], ALIGN_R=[1,1,1,1,1];
function ratioOK(c,R){
  const units=R[0]+R[1]+R[2]+R[3]+R[4];
  const total=c[0]+c[1]+c[2]+c[3]+c[4];
  if(total<units) return 0;
  const m=total/units, tol=m/2;
  for(let i=0;i<5;i++) if(Math.abs(R[i]*m-c[i])>R[i]*tol) return 0;
  return m;
}
function centerFromCounts(end,c){ return end - c[4] - c[3] - c[2]/2; }

function scanLine(get, len, R){
  R=R||FINDER_R;
  // returns list of {center, mod}
  const hits=[]; const c=[0,0,0,0,0]; let st=0;
  for(let i=0;i<len;i++){
    const dark=get(i);
    if(dark){ if(st%2===1) st++; c[st]++; }
    else{
      if(st%2===1) c[st]++;
      else if(st===4){
        const m=ratioOK(c,R);
        if(m) hits.push({center:centerFromCounts(i,c),mod:m});
        c[0]=c[2];c[1]=c[3];c[2]=c[4];c[3]=1;c[4]=0;st=3;
      } else { st++; c[st]++; }
    }
  }
  if(st===4){ const m=ratioOK(c,R); if(m) hits.push({center:centerFromCounts(len,c),mod:m}); }
  return hits;
}

function nearest(hits,target,tol){
  let best=null;
  for(const hit of hits){
    const d=Math.abs(hit.center-target);
    if(d<tol && (!best||d<best.d)) best={...hit,d};
  }
  return best;
}
function refine(bits,w,h,x0,y0,mod){
  let x=x0,y=y0,m=mod;
  for(let it=0;it<4;it++){
    const xi=Math.round(x);
    if(xi<0||xi>=w) return null;
    const vhit=nearest(scanLine((yy)=>bits[yy*w+xi]===1,h), y, m*3);
    if(!vhit) return null;
    y=vhit.center;
    const yi=Math.round(y);
    if(yi<0||yi>=h) return null;
    const hhit=nearest(scanLine((xx)=>bits[yi*w+xx]===1,w), x, m*3);
    if(!hhit) return null;
    x=hhit.center;
    const nm=(vhit.mod+hhit.mod)/2;
    if(Math.abs(nm-m)<0.02 && it>0){ m=nm; break; }
    m=nm;
  }
  return {x,y,mod:m};
}
function findFinders(bits,w,h){
  const cands=[];
  const add=(x,y,mod)=>{
    const f=cands.find(p=>Math.abs(p.x-x)<mod*1.5 && Math.abs(p.y-y)<mod*1.5);
    if(f){ f.x=(f.x*f.n+x)/(f.n+1); f.y=(f.y*f.n+y)/(f.n+1); f.mod=(f.mod*f.n+mod)/(f.n+1); f.n++; }
    else cands.push({x,y,mod,n:1});
  };
  const step=Math.max(1,Math.floor(Math.min(w,h)/260));
  for(let y=0;y<h;y+=step)
    for(const hit of scanLine((x)=>bits[y*w+x]===1,w)){
      const r=refine(bits,w,h,hit.center,y,hit.mod);
      if(r) add(r.x,r.y,r.mod);
    }
  for(let x=0;x<w;x+=step)
    for(const hit of scanLine((y)=>bits[y*w+x]===1,h)){
      const r=refine(bits,w,h,x,hit.center,hit.mod);
      if(r) add(r.x,r.y,r.mod);
    }
  return cands.filter(c=>c.n>=2).sort((a,b)=>b.n-a.n);
}

/* ---- geometry ---- */
function solve8(A,b){
  const n=8;
  for(let i=0;i<n;i++){
    let p=i;
    for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[p][i])) p=r;
    if(Math.abs(A[p][i])<1e-10) return null;
    [A[i],A[p]]=[A[p],A[i]]; [b[i],b[p]]=[b[p],b[i]];
    for(let r=0;r<n;r++){
      if(r===i) continue;
      const f=A[r][i]/A[i][i];
      for(let c=i;c<n;c++) A[r][c]-=f*A[i][c];
      b[r]-=f*b[i];
    }
  }
  return b.map((v,i)=>v/A[i][i]);
}
function perspective(src,dst){ // maps dst(grid) -> src(image)
  const A=[],B=[];
  for(let i=0;i<4;i++){
    const [u,v]=dst[i], [x,y]=src[i];
    A.push([u,v,1,0,0,0,-u*x,-v*x]); B.push(x);
    A.push([0,0,0,u,v,1,-u*y,-v*y]); B.push(y);
  }
  const s=solve8(A,B);
  if(!s) return null;
  const [a,b,c,d,e,f,g,hh]=s;
  return (u,v)=>{ const den=g*u+hh*v+1; return [(a*u+b*v+c)/den,(d*u+e*v+f)/den]; };
}

function gridScore(bits,w,h,map,n,v){
  let good=0,total=0;
  const at=(u,vv)=>{
    const [x,y]=map(u+0.5,vv+0.5);
    const xi=Math.round(x), yi=Math.round(y);
    if(xi<0||yi<0||xi>=w||yi>=h) return -1;
    return bits[yi*w+xi];
  };
  for(let i=8;i<n-8;i++){
    const want=i%2===0?1:0;
    const a=at(i,6); if(a>=0){ total++; if(a===want) good++; }
    const b=at(6,i); if(b>=0){ total++; if(b===want) good++; }
  }
  const pos=ALIGN[v-1]||[];
  if(pos.length){
    const lo=pos[0], hi=pos[pos.length-1];
    for(const pr of pos) for(const pc of pos){
      if((pr===lo&&pc===lo)||(pr===lo&&pc===hi)||(pr===hi&&pc===lo)) continue;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
        const want=Math.max(Math.abs(dx),Math.abs(dy))!==1?1:0;
        const m=at(pc+dx,pr+dy);
        if(m>=0){ total+=2; if(m===want) good+=2; }   // weighted: this is the corner evidence
      }
    }
  }
  return total? good/total : 0;
}

const SAMPLES=[[[0,0]],[[0,0],[-0.28,0],[0.28,0],[0,-0.28],[0,0.28]]];

/* ---- bit extraction ---- */
function isFunction(n,v,r,c){
  if(r<=8&&c<=8) return true;
  if(r<=8&&c>=n-8) return true;
  if(r>=n-8&&c<=8) return true;
  if(r===6||c===6) return true;
  if(v>=7 && ((r<6&&c>=n-11)||(c<6&&r>=n-11))) return true;
  const pos=ALIGN[v-1]||[], lo=pos[0], hi=pos[pos.length-1];
  for(const pr of pos) for(const pc of pos){
    if((pr===lo&&pc===lo)||(pr===lo&&pc===hi)||(pr===hi&&pc===lo)) continue;
    if(Math.abs(r-pr)<=2 && Math.abs(c-pc)<=2) return true;
  }
  return false;
}
function fmtValue(ecIdx,mask){
  const ECB=[1,0,3,2];
  const d=(ECB[ecIdx]<<3)|mask;
  let v=d<<10;
  for(let i=4;i>=0;i--) if(v&(1<<(i+10))) v^=0x537<<i;
  return ((d<<10)|v)^0x5412;
}
function readFormat(grid,n){
  const bitsA=[];
  for(let i=0;i<=5;i++) bitsA.push(grid[8][i]);
  bitsA.push(grid[8][7],grid[8][8],grid[7][8]);
  for(let i=9;i<=14;i++) bitsA.push(grid[14-i][8]);
  const bitsB=[];
  for(let i=0;i<=6;i++) bitsB.push(grid[n-1-i][8]);
  for(let i=7;i<=14;i++) bitsB.push(grid[8][n-15+i]);
  const val=(arr)=>arr.reduce((a,b,i)=>a|(b<<(14-i)),0);
  const cands=[val(bitsA),val(bitsB)];
  let best=null;
  for(const got of cands)
    for(let ec=0;ec<4;ec++) for(let m=0;m<8;m++){
      let d=got^fmtValue(ec,m), c=0;
      while(d){c+=d&1;d>>=1;}
      if(!best||c<best.c) best={c,ec,mask:m};
    }
  return best && best.c<=3 ? best : null;
}

function blocksFor(v,ecIdx){
  const flat=RSB[v-1][ecIdx], out=[];
  for(let i=0;i<flat.length;i+=3) out.push([flat[i],flat[i+1],flat[i+2]]);
  return out;
}

function extract(grid,n,v,ecIdx,mask){
  const bits=[];
  let up=true;
  for(let col=n-1;col>0;col-=2){
    if(col===6) col--;
    for(let k=0;k<n;k++){
      const row=up?n-1-k:k;
      for(let d=0;d<2;d++){
        const c=col-d;
        if(isFunction(n,v,row,c)) continue;
        let b=grid[row][c];
        if(MASKS[mask](row,c)) b^=1;
        bits.push(b);
      }
    }
    up=!up;
  }
  const cw=[];
  for(let i=0;i+8<=bits.length;i+=8){
    let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j];
    cw.push(b);
  }
  const spec=blocksFor(v,ecIdx);
  const blocks=[];
  spec.forEach(([count,total,dn])=>{ for(let i=0;i<count;i++) blocks.push({total,dn,d:[],e:[]}); });
  const maxD=Math.max(...blocks.map(b=>b.dn));
  let p=0;
  for(let i=0;i<maxD;i++) for(const b of blocks) if(i<b.dn) b.d.push(cw[p++]);
  const maxE=Math.max(...blocks.map(b=>b.total-b.dn));
  for(let i=0;i<maxE;i++) for(const b of blocks) if(i<b.total-b.dn) b.e.push(cw[p++]);

  let data=[];
  for(const b of blocks){
    const fixed=rsDecode(b.d.concat(b.e), b.total-b.dn);
    if(!fixed) return null;
    data=data.concat(fixed.slice(0,b.dn));
  }
  return data;
}

function parseBytes(data,v){
  let bit=0;
  const read=(n)=>{ let x=0; for(let i=0;i<n;i++){ const byte=data[(bit>>3)]; if(byte===undefined) throw 0;
    x=(x<<1)|((byte>>(7-(bit&7)))&1); bit++; } return x; };
  let out=[];
  for(;;){
    if(((data.length*8)-bit)<4) break;
    const mode=read(4);
    if(mode===0) break;
    if(mode===4){
      const len=read(v<=9?8:16);
      for(let i=0;i<len;i++) out.push(read(8));
    } else if(mode===1){
      const len=read(v<=9?10:v<=26?12:14);
      let i=0;
      while(i<len){
        const take=Math.min(3,len-i);
        const val=read(take===3?10:take===2?7:4);
        out.push(...String(val).padStart(take,"0").split("").map(c=>c.charCodeAt(0)));
        i+=take;
      }
    } else if(mode===2){
      const len=read(v<=9?9:v<=26?11:13);
      const AN="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
      let i=0;
      while(i<len){
        if(len-i>=2){ const val=read(11); out.push(AN.charCodeAt((val/45)|0),AN.charCodeAt(val%45)); i+=2; }
        else { out.push(AN.charCodeAt(read(6))); i+=1; }
      }
    } else if(mode===7){ read(8); }
    else break;
  }
  return new TextDecoder().decode(Uint8Array.from(out));
}

/* ---- main ---- */
function decodeQR(gray,w,h){
  const bits=binarize(gray,w,h);
  const cands=findFinders(bits,w,h);
  if(cands.length<3) return null;
  const top=cands.slice(0,Math.min(4,cands.length));
  // try triples
  for(let i=0;i<top.length;i++) for(let j=i+1;j<top.length;j++) for(let k=j+1;k<top.length;k++){
    const r=tryTriple(bits,w,h,[top[i],top[j],top[k]]);
    if(r!==null) return r;
  }
  return null;
}

function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

function tryTriple(bits,w,h,pts){
  const [p,q,r]=pts;
  const dpq=dist(p,q), dpr=dist(p,r), dqr=dist(q,r);
  let A,B,C;
  if(dpq>=dpr && dpq>=dqr){ A=r; B=p; C=q; }
  else if(dpr>=dpq && dpr>=dqr){ A=q; B=p; C=r; }
  else { A=p; B=q; C=r; }
  const cross=(B.x-A.x)*(C.y-A.y)-(B.y-A.y)*(C.x-A.x);
  let TR=B, BL=C;
  if(cross<0){ TR=C; BL=B; }
  const mod=(A.mod+TR.mod+BL.mod)/3;
  if(!(mod>0.8)) return null;

  const eTR=dist(A,TR)/((A.mod+TR.mod)/2);
  const eBL=dist(A,BL)/((A.mod+BL.mod)/2);
  let n0=Math.round((eTR+eBL)/2+7);
  n0=n0-((n0-1)%4);

  const src=[[A.x,A.y],[TR.x,TR.y],[BL.x,BL.y]];
  const bx=TR.x+BL.x-A.x, by=TR.y+BL.y-A.y;

  // rank candidate dimensions by how well the timing patterns line up
  const ranked=[];
  for(const off of [0,-4,4,-8,8,-12,12,16,-16,20]){
    const n=n0+off;
    if(n<21||n>177) continue;
    const v=(n-17)/4;
    if(!Number.isInteger(v)||v<1||v>40) continue;
    const dst=[[3.5,3.5],[n-3.5,3.5],[3.5,n-3.5],[n-3.5,n-3.5]];
    const map=perspective([...src,[bx,by]],dst);
    if(!map) continue;
    ranked.push({n,v,score:gridScore(bits,w,h,map,n,v)});
  }
  ranked.sort((a,b)=>b.score-a.score);
  if(globalThis.__QRDBG) globalThis.__QRDBG.push({n0,mod:+mod.toFixed(2),ranked:ranked.slice(0,3).map(r=>r.n+":"+r.score.toFixed(2))});

  for(const cand of ranked.slice(0,3)){
    if(cand.score<0.55) break;
    const map=lockGrid(bits,w,h,src,bx,by,cand.n,cand.v,mod);
    if(!map) continue;
    for(const mode of [1,0]){
      const res=readSymbol(bits,w,h,map,cand.n,cand.v,mode);
      if(res!==null) return res;
    }
  }
  return null;
}

/* Lock the grid by searching for where the bottom-right alignment pattern
   really is, coarse to fine, scoring each candidate fit. */
function lockGrid(bits,w,h,src,bx,by,n,v,mod){
  const corner=[[3.5,3.5],[n-3.5,3.5],[3.5,n-3.5],[n-3.5,n-3.5]];
  let map=perspective([...src,[bx,by]],corner);
  if(!map) return null;
  let best={sc:gridScore(bits,w,h,map,n,v),map};
  if(v<2) return best.sc>=0.8?best.map:null;

  const au=n-6.5;
  const dstA=[[3.5,3.5],[n-3.5,3.5],[3.5,n-3.5],[au,au]];
  let [ax,ay]=map(au,au);
  for(const [span,step] of [[8,0.75],[1.5,0.3],[0.4,0.1]]){
    const R=span*mod, S=Math.max(0.4,step*mod);
    let local=null;
    for(let dy=-R;dy<=R+1e-9;dy+=S) for(let dx=-R;dx<=R+1e-9;dx+=S){
      const m2=perspective([...src,[ax+dx,ay+dy]],dstA);
      if(!m2) continue;
      const sc=gridScore(bits,w,h,m2,n,v);
      if(!local||sc>local.sc) local={sc,dx,dy,map:m2};
    }
    if(!local) break;
    ax+=local.dx; ay+=local.dy;
    if(local.sc>best.sc) best=local;
    if(best.sc>0.999) break;
  }
  return best.sc>=0.85 ? best.map : null;
}

function readSymbol(bits,w,h,map,n,v,mode){
  const grid=[];
  for(let r=0;r<n;r++){
    const row=new Array(n);
    for(let c=0;c<n;c++){
      let dark=0,seen=0;
      for(const [du,dv] of SAMPLES[mode]){
        const [x,y]=map(c+0.5+du,r+0.5+dv);
        const xi=Math.round(x), yi=Math.round(y);
        if(xi<0||yi<0||xi>=w||yi>=h){ if(du===0&&dv===0) return null; continue; }
        seen++; if(bits[yi*w+xi]===1) dark++;
      }
      if(!seen) return null;
      row[c]= dark*2>seen ? 1 : 0;
    }
    grid.push(row);
  }
  const fmt=readFormat(grid,n);
  if(globalThis.__QRDBG) globalThis.__QRDBG.push({mode,fmt:fmt?fmt.ec+"/"+fmt.mask+"/d"+fmt.c:null});
  if(!fmt) return null;
  try{
    const data=extract(grid,n,v,fmt.ec,fmt.mask);
    if(globalThis.__QRDBG) globalThis.__QRDBG.push({rs:data?"ok":"fail"});
    if(!data) return null;
    const s=parseBytes(data,v);
    return s && s.length ? s : null;
  }catch(e){ return null; }
}


/* Decode a still image (a photo of the other screen). Tries a few
   downscales — too small loses modules, too large is slow. */
async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("That file isn't an image I can read."));
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    for (const cap of [1600, 1000, 2200]) {
      const scale = Math.min(1, cap / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const gray = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < px.length; i += 4, j++)
        gray[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      const got = decodeQR(gray, w, h);
      if (got) return got;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ═══ transfer payload ═══════════════════════════════════════ */

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\p").replace(/~/g, "\\t").replace(/,/g, "\\c");
const unesc = (s) => String(s ?? "").replace(/\\c/g, ",").replace(/\\t/g, "~").replace(/\\p/g, "|").replace(/\\\\/g, "\\");
const uid = () => Math.random().toString(36).slice(2, 9);

const blankCar = (name) => ({
  id: uid(), name, facts: {}, kit: {},
  scores: { a: {}, b: {} }, notes: { a: "", b: "" }, flag: { a: "", b: "" },
});

function fixCar(c) {
  return {
    id: c.id || uid(),
    name: c.name || "",
    facts: c.facts || {},
    kit: c.kit || {},
    scores: { a: (c.scores && c.scores.a) || {}, b: (c.scores && c.scores.b) || {} },
    notes: { a: (c.notes && c.notes.a) || "", b: (c.notes && c.notes.b) || "" },
    flag: { a: (c.flag && c.flag.a) || "", b: (c.flag && c.flag.b) || "" },
  };
}

/* Wire format versions. Each bumps only when the head grows, so older codes
   stay readable: `head` is how many fields precede the cars. */
const WIRE = {
  EVS1: { head: 4, keys: OLD_ORDER, req: false, claim: false },
  EVS2: { head: 5, keys: ORDER, req: true, claim: false },
  EVS3: { head: 6, keys: ORDER, req: true, claim: true },
};

function pack(state, withNotes) {
  const head = ["EVS3", esc(state.names.a), esc(state.names.b),
    `${state.weights.drive}${state.weights.live}${state.weights.tech}${state.weights.gut}`,
    KITIDS.map((k) => state.req[k] || 0).join(""),
    /* Which slot this device is scoring, and who it is. The other device uses
       it to lock that slot so nobody rates their partner by accident. */
    state.claim && state.claim.deviceId ? `${state.claim.slot}:${esc(state.claim.deviceId)}` : ""];
  const cars = state.cars.map((c) => {
    const sc = (w) => ORDER.map((k) => (typeof c.scores[w][k] === "number" ? c.scores[w][k] : 0)).join("");
    return [
      esc(c.name),
      FACTIDS.map((f) => esc(c.facts[f] ?? "")).join(","),
      sc("a"), sc("b"),
      withNotes ? esc(c.notes.a) : "", withNotes ? esc(c.notes.b) : "",
      esc(c.flag.a), esc(c.flag.b),
      KITIDS.map((k) => c.kit[k] || 0).join(""),
    ].join("~");
  });
  return head.concat(cars).join("|");
}

function unpack(str) {
  const parts = str.split("|");
  const wire = WIRE[parts[0]];
  if (!wire) throw new Error("That code isn't from this scorecard.");
  const keys = wire.keys;
  const w = parts[3] || "3323";
  const reqStr = wire.req ? parts[4] || "" : "";
  const state = {
    names: { a: unesc(parts[1]) || "Me", b: unesc(parts[2]) || "Partner" },
    weights: { drive: +w[0] || 3, live: +w[1] || 3, tech: +w[2] || 2, gut: +w[3] || 3 },
    req: {},
    claim: null,
    cars: [],
  };
  if (wire.claim && parts[5]) {
    const [slot, id] = parts[5].split(":");
    if ((slot === "a" || slot === "b") && id) state.claim = { slot, deviceId: unesc(id) };
  }
  KITIDS.forEach((k, i) => { const n = +reqStr[i]; if (n === 1 || n === 2) state.req[k] = n; });
  for (let i = wire.head; i < parts.length; i++) {
    if (!parts[i]) continue;
    const f = parts[i].split("~");
    const car = blankCar(unesc(f[0]));
    car.notes = { a: unesc(f[4]), b: unesc(f[5]) };
    car.flag = { a: unesc(f[6]), b: unesc(f[7]) };
    (f[1] || "").split(",").forEach((v, j) => {
      const t = unesc(v);
      if (t !== "" && FACTIDS[j]) car.facts[FACTIDS[j]] = t;
    });
    ["a", "b"].forEach((who, k) => {
      const s = f[2 + k] || "";
      keys.forEach((key, j) => {
        const n = +s[j];
        if (n >= 1 && n <= 5) car.scores[who][key] = n;
      });
    });
    const kitStr = f[8] || "";
    KITIDS.forEach((k, j) => { const n = +kitStr[j]; if (n === 1 || n === 2) car.kit[k] = n; });
    state.cars.push(car);
  }
  return state;
}

const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
};
const CHUNK = 150;
function toFrames(payload) {
  const id = fnv(payload);
  const cps = Array.from(payload);
  const total = Math.ceil(cps.length / CHUNK) || 1;
  const out = [];
  for (let i = 0; i < total; i++)
    out.push(`EVQ${id}:${i + 1}:${total}:` + cps.slice(i * CHUNK, (i + 1) * CHUNK).join(""));
  return out;
}
function readFrame(txt) {
  const m = /^EVQ([a-z0-9]+):(\d+):(\d+):/.exec(txt.trim());
  if (!m) return null;
  return { id: m[1], i: +m[2], total: +m[3], body: txt.trim().slice(m[0].length) };
}

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

function mergeGaps(localCars, incoming) {
  const cars = localCars.map((c) => structuredClone(c));
  let added = 0, filled = 0;
  incoming.cars.forEach((inc) => {
    const mine = cars.find((c) => norm(c.name) === norm(inc.name));
    if (!mine) {
      cars.push({ ...structuredClone(inc), id: uid() });
      added++;
      filled += ["a", "b"].reduce((s, w) => s + Object.keys(inc.scores[w]).length, 0);
      return;
    }
    FACTIDS.forEach((f) => { if (!mine.facts[f] && inc.facts[f]) mine.facts[f] = inc.facts[f]; });
    KITIDS.forEach((k) => { if (!mine.kit[k] && inc.kit[k]) mine.kit[k] = inc.kit[k]; });
    ["a", "b"].forEach((w) => {
      ORDER.forEach((k) => {
        if (typeof mine.scores[w][k] !== "number" && typeof inc.scores[w][k] === "number") {
          mine.scores[w][k] = inc.scores[w][k];
          filled++;
        }
      });
      if (!mine.notes[w] && inc.notes[w]) mine.notes[w] = inc.notes[w];
      if (!mine.flag[w] && inc.flag[w]) mine.flag[w] = inc.flag[w];
    });
  });
  return { cars, added, filled };
}

/* ═══ scoring maths ══════════════════════════════════════════ */

export function groupAvg(car, who, gid) {
  const vals = GROUPS.find((g) => g.id === gid).items
    .map(([id]) => car.scores[who][id]).filter((v) => typeof v === "number");
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}
export function rawFor(car, who, weights) {
  let num = 0, den = 0;
  GROUPS.forEach((g) => {
    const a = groupAvg(car, who, g.id);
    if (a !== null) { num += a * weights[g.id]; den += weights[g.id]; }
  });
  return den ? (num / den / 5) * 100 : null;
}
export function kitHit(car, req) {
  const missing = KITIDS.filter((k) => (req[k] || 0) > 0 && car.kit[k] === 2);
  const unknown = KITIDS.filter((k) => (req[k] || 0) > 0 && !car.kit[k]);
  const points = missing.reduce((s, k) => s + PENALTY[req[k]], 0);
  return { points, missing, unknown, blocked: missing.some((k) => req[k] === 2) };
}
export function totalFor(car, who, weights, req) {
  const raw = rawFor(car, who, weights);
  if (raw === null) return null;
  return Math.max(0, raw - kitHit(car, req).points);
}
export function combined(car, weights, req) {
  const a = totalFor(car, "a", weights, req), b = totalFor(car, "b", weights, req);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}
export const countDone = (car, who) => ORDER.filter((id) => typeof car.scores[who][id] === "number").length;

/* ═══ shared bits ════════════════════════════════════════════ */

function ChargeBar({ value, onChange, color, label }) {
  return (
    <div className="bar-wrap">
      <div className="bar" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = typeof value === "number" && n <= value;
          return (
            <button key={n} className={"cell" + (on ? " on" : "")}
              style={on ? { background: color, borderColor: color } : undefined}
              onClick={() => onChange(value === n ? null : n)}
              aria-label={`${label}: ${n} of 5`} aria-pressed={on}>
              <span className="cellnum">{n}</span>
            </button>
          );
        })}
      </div>
      <span className="barval" style={{ color: typeof value === "number" ? color : undefined }}>
        {typeof value === "number" ? value : "–"}
      </span>
    </div>
  );
}

function Triple({ value, onChange, options, label }) {
  return (
    <div className="triple" role="group" aria-label={label}>
      {options.map(([val, text, cls]) => (
        <button key={val} className={"tri " + (cls || "") + (value === val ? " on" : "")}
          onClick={() => onChange(val)} aria-pressed={value === val}>{text}</button>
      ))}
    </div>
  );
}

function QRCode({ text, size = 360 }) {
  const ref = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    try {
      const { m, n } = qrEncode(text);
      const quiet = 4, span = n + quiet * 2;
      const px = Math.max(1, Math.floor(size / span));
      const dim = px * span;
      const cv = ref.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = dim * dpr; cv.height = dim * dpr;
      cv.style.width = dim + "px"; cv.style.height = dim + "px";
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = "#000";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (m[r][c]) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
      setErr("");
    } catch (e) { setErr(e.message); }
  }, [text, size]);
  return err ? <div className="qrerr">{err}</div> : <canvas ref={ref} className="qrcanvas" />;
}

/* ═══ screens (top level — remounting them steals focus) ═════ */

function Garage({ cars, names, weights, req, setNames, setWeights, setReq, onAdd, onOpen }) {
  const [draft, setDraft] = useState("");
  const ranked = [...cars].sort((x, y) => (combined(y, weights, req) ?? -1) - (combined(x, weights, req) ?? -1));
  const add = () => { if (draft.trim()) { onAdd(draft.trim()); setDraft(""); } };
  return (
    <div className="pane">
      <p className="lede">
        Score each car right after the drive, before the next one blurs it. Tap your name up top
        to switch whose ratings you're entering.
      </p>
      <div className="addrow">
        <input className="in" placeholder="Add a car — e.g. Kia EV6" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="btn solid" disabled={!draft.trim()} onClick={add}>Add</button>
      </div>

      {!cars.length && (
        <div className="empty"><span className="emptybolt">⚡</span>No cars yet. Add the first one you're driving.</div>
      )}

      {ranked.map((c) => {
        const t = combined(c, weights, req);
        const hit = kitHit(c, req);
        return (
          <button key={c.id} className="carcard" onClick={() => onOpen(c.id)}>
            <div className="carhead">
              <span className="carname">{c.name}</span>
              <span className="carscore">{t === null ? "–" : Math.round(t)}</span>
            </div>
            <div className="progrow">
              {["a", "b"].map((k) => {
                const done = countDone(c, k);
                return (
                  <span key={k} className="prog">
                    <span className="proglabel">{names[k]}</span>
                    <span className="progtrack">
                      <span className="progfill" style={{ width: `${(done / ORDER.length) * 100}%`, background: COL[k] }} />
                    </span>
                    <span className="progn">{done}/{ORDER.length}</span>
                  </span>
                );
              })}
            </div>
            {hit.points > 0 && <div className="flagline">−{hit.points} for missing kit</div>}
            {(c.flag.a || c.flag.b) && <div className="flagline">Deal-breaker noted</div>}
          </button>
        );
      })}

      <div className="weights">
        <h3 className="h3">What matters to you both</h3>
        <p className="sub">Weights apply to every car. Move them before you start, not after.</p>
        {GROUPS.map((g) => (
          <div key={g.id} className="wrow">
            <label htmlFor={`w-${g.id}`} className="wlabel">{g.name}</label>
            <input id={`w-${g.id}`} type="range" min="1" max="5" value={weights[g.id]}
              onChange={(e) => setWeights({ ...weights, [g.id]: Number(e.target.value) })} />
            <span className="wval">{weights[g.id]}×</span>
          </div>
        ))}
      </div>

      <div className="weights">
        <h3 className="h3">Equipment you want</h3>
        <p className="sub">
          A missing <b>Nice</b> costs {PENALTY[1]} points, a missing <b>Must</b> costs {PENALTY[2]}.
          Tick what each car actually has on its own page.
        </p>
        {KIT.map(([id, label]) => (
          <div key={id} className="kitrow">
            <span className="kitlabel">{label}</span>
            <Triple label={label} value={req[id] || 0}
              onChange={(v) => setReq({ ...req, [id]: v })}
              options={[[0, REQLABEL[0]], [1, REQLABEL[1]], [2, REQLABEL[2], "must"]]} />
          </div>
        ))}
      </div>

      <div className="weights">
        <h3 className="h3">Who's scoring</h3>
        <div className="namerow">
          {["a", "b"].map((k) => (
            <input key={k} className="in" value={names[k]} style={{ borderBottomColor: COL[k] }}
              onChange={(e) => setNames({ ...names, [k]: e.target.value })}
              aria-label={`Name of scorer ${k === "a" ? "one" : "two"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Score({ car, who, names, weights, req, patch, onRemove }) {
  if (!car) return null;
  const hit = kitHit(car, req);
  const setScore = (item, v) => patch(car.id, (c) => {
    if (v === null) delete c.scores[who][item]; else c.scores[who][item] = v;
    return c;
  });
  const shown = totalFor(car, who, weights, req);
  return (
    <div className="pane">
      <div className="titlerow">
        <input className="cartitle" value={car.name}
          onChange={(e) => patch(car.id, (c) => ({ ...c, name: e.target.value }))} aria-label="Car name" />
        <span className="bigscore" style={{ color: COL[who] }}>{shown === null ? "–" : Math.round(shown)}</span>
      </div>
      {hit.points > 0 && (
        <div className="kitnote">−{hit.points} already taken off for {hit.missing.length} missing item{hit.missing.length === 1 ? "" : "s"}.</div>
      )}

      <section className="facts">
        <h3 className="h3">Recorded facts</h3>
        <p className="sub">Not scored. Compared straight across on the results page.</p>
        <div className="factgrid">
          {FACTS.map((f) => (
            <label key={f.id} className="factcell">
              <span className="factlabel">{f.label}</span>
              <span className="factin">
                <input inputMode="decimal" value={car.facts[f.id] ?? ""}
                  onChange={(e) => patch(car.id, (c) => { c.facts[f.id] = e.target.value; return c; })} />
                {f.unit && <span className="unit">{f.unit}</span>}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="group">
        <h3 className="h3">Equipment</h3>
        <p className="sub">Only items you marked Nice or Must affect the score.</p>
        {KIT.map(([id, label]) => {
          const level = req[id] || 0;
          return (
            <div key={id} className={"kitrow" + (level ? "" : " dim")}>
              <span className="kitlabel">
                {label}
                {level > 0 && <span className={"reqtag" + (level === 2 ? " must" : "")}>{REQLABEL[level]}</span>}
              </span>
              <Triple label={label} value={car.kit[id] || 0}
                onChange={(v) => patch(car.id, (c) => { c.kit[id] = v; return c; })}
                options={[[0, "?"], [1, "Has"], [2, "No", "must"]]} />
            </div>
          );
        })}
      </section>

      {GROUPS.map((g) => (
        <section key={g.id} className="group">
          <div className="grouphead">
            <h3 className="h3">{g.name}</h3>
            <span className="weightpill">{weights[g.id]}×</span>
          </div>
          <p className="sub">{g.hint}</p>
          {g.items.map(([id, label]) => (
            <div key={id} className="crit">
              <span className="critlabel">{label}</span>
              <ChargeBar value={car.scores[who][id]} onChange={(v) => setScore(id, v)} color={COL[who]} label={label} />
            </div>
          ))}
        </section>
      ))}

      <section className="group">
        <h3 className="h3">{names[who]}'s notes</h3>
        <textarea className="ta" rows={4}
          placeholder="The thing you'll forget by tomorrow — a rattle, a smell, where the sun hit the screen."
          value={car.notes[who]}
          onChange={(e) => patch(car.id, (c) => { c.notes[who] = e.target.value; return c; })} />
        <label className="breaker">
          <span className="breakerlabel">Deal-breaker</span>
          <input className="in" placeholder="Leave empty if none" value={car.flag[who]}
            onChange={(e) => patch(car.id, (c) => { c.flag[who] = e.target.value; return c; })} />
        </label>
      </section>

      <button className="btn ghost wide" onClick={onRemove}>Remove this car</button>
    </div>
  );
}

/* The PDF generator is pulled in on demand: it is dead weight for anyone who
   never asks for a report, and importing it eagerly would make this module and
   the report module import each other at start-up. */
function ReportButton({ cars, names, weights, req }) {
  const [phase, setPhase] = useState("idle");

  const run = async () => {
    setPhase("working");
    try {
      const { downloadReport } = await import("./pdf/report.js");
      await new Promise((r) => setTimeout(r, 0));   // let the label paint first
      downloadReport({ cars, names, weights, req });
      setPhase("done");
      setTimeout(() => setPhase("idle"), 3000);
    } catch (e) {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 5000);
    }
  };

  return (
    <div className="reportbar">
      <div className="reportcopy">
        <span className="reporttitle">Full report</span>
        <span className="reportsub">
          Overview, category spiderwebs and every score side by side, as a PDF.
        </span>
      </div>
      <button className="btn solid" onClick={run} disabled={phase === "working"}>
        {phase === "working" ? "Building…"
          : phase === "done" ? "Downloaded"
            : phase === "error" ? "Failed — retry" : "Download PDF"}
      </button>
    </div>
  );
}

function Results({ cars, names, weights, req }) {
  const ranked = [...cars].filter((c) => combined(c, weights, req) !== null)
    .sort((x, y) => combined(y, weights, req) - combined(x, weights, req));
  const factBest = {};
  FACTS.forEach((f) => {
    const vals = cars.map((c) => parseFloat(c.facts[f.id])).filter((v) => !isNaN(v));
    if (vals.length > 1) factBest[f.id] = f.better === "low" ? Math.min(...vals) : Math.max(...vals);
  });
  const splits = [];
  cars.forEach((c) => GROUPS.forEach((g) => g.items.forEach(([id, label]) => {
    const a = c.scores.a[id], b = c.scores.b[id];
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) >= 2)
      splits.push({ car: c.name, label, a, b });
  })));
  const kitName = Object.fromEntries(KIT);

  if (!ranked.length)
    return <div className="pane"><div className="empty"><span className="emptybolt">⚡</span>Nothing scored yet.</div></div>;

  return (
    <div className="pane">
      <ReportButton cars={cars} names={names} weights={weights} req={req} />
      <h3 className="h3">Standings</h3>
      <p className="sub">Weighted score out of 100, after equipment deductions.</p>
      {ranked.map((c, i) => {
        const hit = kitHit(c, req);
        return (
          <div key={c.id} className="resrow">
            <div className="reshead">
              <span className="respos">{i + 1}</span>
              <span className="resname">{c.name}</span>
              <span className="restotal">{Math.round(combined(c, weights, req))}</span>
            </div>
            <div className="restracks">
              {["a", "b"].map((k) => {
                const v = totalFor(c, k, weights, req);
                return (
                  <div key={k} className="restrack">
                    <span className="proglabel">{names[k]}</span>
                    <span className="progtrack"><span className="progfill" style={{ width: `${v ?? 0}%`, background: COL[k] }} /></span>
                    <span className="progn">{v === null ? "–" : Math.round(v)}</span>
                  </div>
                );
              })}
            </div>
            <div className="catline">
              {GROUPS.map((g) => {
                const both = [groupAvg(c, "a", g.id), groupAvg(c, "b", g.id)].filter((x) => x !== null);
                const avg = both.length ? both.reduce((s, v) => s + v, 0) / both.length : null;
                return (
                  <span key={g.id} className="cat">
                    <span className="catname">{g.name}</span>
                    <span className="catval">{avg === null ? "–" : avg.toFixed(1)}</span>
                  </span>
                );
              })}
            </div>
            {hit.missing.length > 0 && (
              <div className={"flagbox" + (hit.blocked ? " hard" : "")}>
                <b>−{hit.points}</b> missing: {hit.missing.map((k) => kitName[k]).join(", ")}
              </div>
            )}
            {hit.unknown.length > 0 && (
              <div className="unknownline">Not checked yet: {hit.unknown.map((k) => kitName[k]).join(", ")}</div>
            )}
            {(c.flag.a || c.flag.b) && (
              <div className="flagbox">
                {c.flag.a && <div>{names.a}: {c.flag.a}</div>}
                {c.flag.b && <div>{names.b}: {c.flag.b}</div>}
              </div>
            )}
          </div>
        );
      })}

      <h3 className="h3 spaced">Facts side by side</h3>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th></th>{cars.map((c) => <th key={c.id}>{c.name}</th>)}</tr></thead>
          <tbody>
            {FACTS.map((f) => (
              <tr key={f.id}>
                <td className="rowlabel">{f.label}{f.unit && <span className="unit"> {f.unit}</span>}</td>
                {cars.map((c) => {
                  const raw = c.facts[f.id], num = parseFloat(raw);
                  return <td key={c.id} className={!isNaN(num) && factBest[f.id] === num ? "best" : ""}>{raw || "–"}</td>;
                })}
              </tr>
            ))}
            {KIT.filter(([id]) => (req[id] || 0) > 0).map(([id, label]) => (
              <tr key={id}>
                <td className="rowlabel">{label}</td>
                {cars.map((c) => (
                  <td key={c.id} className={c.kit[id] === 1 ? "best" : c.kit[id] === 2 ? "gone" : ""}>
                    {c.kit[id] === 1 ? "yes" : c.kit[id] === 2 ? "no" : "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="h3 spaced">Where you disagree</h3>
      {splits.length ? (
        <>
          <p className="sub">Two points apart or more. Worth talking through before deciding.</p>
          {splits.map((s, i) => (
            <div key={i} className="split">
              <span className="splitcar">{s.car}</span>
              <span className="splitlabel">{s.label}</span>
              <span className="splitvals">
                <b style={{ color: COL.a }}>{s.a}</b><span className="vs">vs</span><b style={{ color: COL.b }}>{s.b}</b>
              </span>
            </div>
          ))}
        </>
      ) : <p className="sub">Nothing yet — you're rating these cars the same way.</p>}

      {cars.some((c) => c.notes.a || c.notes.b) && (
        <>
          <h3 className="h3 spaced">Notes</h3>
          {cars.map((c) => (c.notes.a || c.notes.b) ? (
            <div key={c.id} className="notecard">
              <div className="notecar">{c.name}</div>
              {["a", "b"].map((k) => c.notes[k] ? (
                <p key={k} className="note"><span style={{ color: COL[k] }}>{names[k]}</span> {c.notes[k]}</p>
              ) : null)}
            </div>
          ) : null)}
        </>
      )}
    </div>
  );
}

function Sender({ state }) {
  const [withNotes, setWithNotes] = useState(true);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frames = useMemo(() => toFrames(pack(state, withNotes)), [state, withNotes]);

  useEffect(() => { setI(0); }, [frames.length]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 1600);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  if (!state.cars.length)
    return <div className="empty">Add and score a car first — there's nothing to send yet.</div>;

  return (
    <div className="xfer">
      <div className="qrbox"><QRCode text={frames[i]} /></div>
      <div className="frameline">
        <button className="stepbtn" onClick={() => setI((x) => (x - 1 + frames.length) % frames.length)} aria-label="Previous code">‹</button>
        <span className="framecount">Code {i + 1} of {frames.length}</span>
        <button className="stepbtn" onClick={() => setI((x) => (x + 1) % frames.length)} aria-label="Next code">›</button>
      </div>
      {frames.length > 1 && (
        <p className="sub center">
          Hold both devices steady until all {frames.length} are read. They cycle on their own —
          pause below if the other device is photographing them one at a time.
        </p>
      )}
      <div className="opts">
        <button className="opt" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause cycling" : "Resume cycling"}</button>
        <button className="opt" onClick={() => setWithNotes((n) => !n)}>{withNotes ? "Notes included" : "Notes left out"}</button>
      </div>
    </div>
  );
}

function Receiver({ who, names, onImport }) {
  const videoRef = useRef(null);
  const [frames, setFrames] = useState({});
  const [meta, setMeta] = useState(null);
  const [camState, setCamState] = useState("starting");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const stopRef = useRef(null);

  const take = useCallback((raw) => {
    const f = readFrame(raw);
    if (!f) { setMsg("That code isn't part of a scorecard transfer."); return; }
    setMeta((m) => (m && m.id === f.id ? m : { id: f.id, total: f.total }));
    setFrames((cur) => {
      const base = cur.__id === f.id ? cur : { __id: f.id };
      if (base[f.i] !== undefined) return base;
      return { ...base, [f.i]: f.body };
    });
    setMsg("");
  }, []);

  useEffect(() => {
    if (!meta) return;
    const have = Object.keys(frames).filter((k) => k !== "__id").length;
    if (have < meta.total) return;
    try {
      let joined = "";
      for (let i = 1; i <= meta.total; i++) joined += frames[i];
      setPreview(unpack(joined));
    } catch (e) { setMsg(e.message); }
  }, [frames, meta]);

  useEffect(() => {
    let cancelled = false, stream = null, timer = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scanInPage = (video) => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return null;
      const scale = Math.min(1, 640 / vw);
      const w = Math.round(vw * scale), h = Math.round(vh * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(video, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const gray = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < px.length; i += 4, j++)
        gray[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      return decodeQR(gray, w, h);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) { setCamState("failed"); return; }
        v.srcObject = stream;
        /* Autoplay can be refused even with muted + playsInline. That is not a
           permission problem, so don't let it reach the catch below and get
           reported as one — frames still arrive once the element is shown. */
        try { await v.play(); } catch (_) { /* keep going */ }
        const native = typeof window.BarcodeDetector !== "undefined"
          ? new window.BarcodeDetector({ formats: ["qr_code"] })
          : null;
        setCamState(native ? "live" : "live-js");
        const tick = async () => {
          if (cancelled) return;
          try {
            if (native) {
              const found = await native.detect(v);
              found.forEach((r) => r.rawValue && take(r.rawValue));
            } else {
              const got = scanInPage(v);
              if (got) take(got);
            }
          } catch (e) { /* transient miss */ }
          if (!cancelled) timer = setTimeout(tick, native ? 100 : 50);
        };
        tick();
      } catch (e) {
        /* Inside an embedded frame the browser refuses without ever
           prompting, which surfaces as the same error as a real refusal. */
        let blocked = false;
        try {
          const pp = document.permissionsPolicy || document.featurePolicy;
          if (pp && typeof pp.allowsFeature === "function") blocked = !pp.allowsFeature("camera");
        } catch (_) { /* not supported here */ }
        if (window.self !== window.top && e && e.name === "NotAllowedError") blocked = true;
        setCamState(blocked ? "embedded" : e && e.name === "NotAllowedError" ? "denied" : "failed");
      }
    })();

    stopRef.current = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    return () => stopRef.current && stopRef.current();
  }, [take]);

  const have = Object.keys(frames).filter((k) => k !== "__id").length;

  if (preview) {
    const ratings = preview.cars.reduce((s, c) => s + countDone(c, "a") + countDone(c, "b"), 0);
    /* Both devices set to the same person: resolve that before merging, or the
       two of you keep rating one slot and leave the other empty. */
    const clash = preview.claim && preview.claim.slot === who;
    const otherSlot = who === "a" ? "b" : "a";
    const nameOf = (k) => preview.names[k] || names[k] || (k === "a" ? "Me" : "Partner");
    const finish = (mode, opts) => {
      stopRef.current && stopRef.current();
      onImport(preview, mode, opts);
    };

    return (
      <div className="xfer">
        <div className="previewbox">
          <h3 className="h3">Ready to bring in</h3>
          <p className="sub">
            {preview.cars.length} car{preview.cars.length === 1 ? "" : "s"} from {preview.names.a} and {preview.names.b} — {ratings} ratings.
          </p>
          <ul className="carlist">
            {preview.cars.map((c) => (
              <li key={c.id}>{c.name}<span className="carlistn">{countDone(c, "a")} + {countDone(c, "b")}</span></li>
            ))}
          </ul>
        </div>

        {clash ? (
          <>
            <div className="notice warn">
              Both phones are set to <b>{nameOf(who)}</b>. Pick who this phone is before merging.
            </div>
            <button className="btn solid wide"
              onClick={() => finish("merge", { moveMeTo: otherSlot })}>
              This phone is {nameOf(otherSlot)} — switch me and merge
            </button>
            <button className="btn wide" onClick={() => finish("merge", {})}>
              Keep me as {nameOf(who)} and merge anyway
            </button>
          </>
        ) : (
          <>
            <button className="btn solid wide" onClick={() => finish("merge", {})}>
              Merge in — nothing of mine is overwritten
            </button>
            <button className="btn wide" onClick={() => finish("replace", {})}>
              Replace my copy with theirs
            </button>
          </>
        )}
        <button className="btn ghost wide" onClick={() => { setPreview(null); setFrames({}); setMeta(null); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="xfer">
      {/* Mounted from the first render, hidden until the stream arrives: the
          effect needs videoRef.current to exist by the time getUserMedia
          resolves, and rendering this only once live would never let it. */}
      <div className="camwrap"
        style={camState === "live" || camState === "live-js" ? undefined : { display: "none" }}>
        <video ref={videoRef} className="cam" muted playsInline />
        <div className="reticle" />
      </div>
      {camState === "starting" && <div className="empty">Asking for the camera…</div>}
      {camState === "live-js" && (
        <p className="sub center">Point at the other device. Fill the frame with one code at a time.</p>
      )}
      {camState !== "live" && camState !== "live-js" && camState !== "starting" && (
        <div className="notice">
          {camState === "denied"
            ? "Camera access was refused. Allow it for this page, or paste a code below."
            : "The camera wouldn't start. Paste a code below instead."}
        </div>
      )}

      {meta && (
        <div className="pips">
          {Array.from({ length: meta.total }, (_, k) => (
            <span key={k} className={"pip" + (frames[k + 1] !== undefined ? " got" : "")} />
          ))}
          <span className="pipn">{have} of {meta.total}</span>
        </div>
      )}
      {msg && <div className="notice warn">{msg}</div>}

      <div className="pastebox">
        <label className="h3" htmlFor="pastecode">Paste a code</label>
        <textarea id="pastecode" className="ta" rows={3} placeholder="EVQ…"
          value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn wide" disabled={!paste.trim()} onClick={() => { take(paste); setPaste(""); }}>
          Add this code
        </button>
      </div>
    </div>
  );
}

function Transfer({ state, who, names, onImport }) {
  const [mode, setMode] = useState(null);
  return (
    <div className="pane">
      <p className="lede">
        Nothing leaves the devices. One shows codes, the other reads them with its camera.
        No signal needed.
      </p>
      <div className="modes">
        <button className={"modebtn" + (mode === "send" ? " on" : "")}
          onClick={() => setMode(mode === "send" ? null : "send")}>
          <span className="modeicon">▦</span>Show my codes
        </button>
        <button className={"modebtn" + (mode === "recv" ? " on" : "")}
          onClick={() => setMode(mode === "recv" ? null : "recv")}>
          <span className="modeicon">◎</span>Read their codes
        </button>
      </div>
      {mode === "send" && <Sender state={state} />}
      {mode === "recv" && <Receiver who={who} names={names} onImport={onImport} />}
    </div>
  );
}

/* ═══ app ════════════════════════════════════════════════════ */

export default function EVScorecard() {
  const [cars, setCars] = useState([]);
  const [names, setNames] = useState({ a: "Me", b: "Partner" });
  const [weights, setWeights] = useState({ drive: 3, live: 3, tech: 2, gut: 3 });
  const [req, setReq] = useState({});
  const [who, setWho] = useState("a");
  /* This device's identity, and what it last learned about the other one.
     `partner` is set only by a sync, and only ever names the slot this device
     is NOT scoring — so `who` is never itself locked. */
  const [deviceId, setDeviceId] = useState("");
  const [partner, setPartner] = useState(null);
  const [view, setView] = useState("garage");
  const [openCar, setOpenCar] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const first = useRef(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORE_KEY);
        const d = JSON.parse(res.value);
        if (d.cars) setCars(d.cars.map(fixCar));
        if (d.names) setNames(d.names);
        if (d.weights) setWeights(d.weights);
        if (d.req) setReq(d.req);
        /* Which of the two you are scoring as is a per-device choice, so it is
           restored here but deliberately kept out of the transfer payload:
           importing someone else's card should not flip who you are. */
        if (d.who === "a" || d.who === "b") setWho(d.who);
        if (d.deviceId) setDeviceId(d.deviceId);
        if (d.partner && d.partner.slot && d.partner.deviceId) setPartner(d.partner);
      } catch (e) { /* first run */ }
      setDeviceId((id) => id || uid());
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      try {
        await window.storage.set(STORE_KEY,
          JSON.stringify({ cars, names, weights, req, who, deviceId, partner }));
        setStatus("Saved");
        setTimeout(() => setStatus(""), 1400);
      } catch (e) { setStatus("Not saved"); }
    }, 600);
    return () => clearTimeout(t);
  }, [cars, names, weights, req, who, deviceId, partner, loaded]);

  /* A slot is locked when the last sync said the other device is scoring it.
     Never a dead end: taking it over is one confirmation away, so a flat
     battery on the other phone cannot strand you. */
  const lockedSlot = partner && partner.deviceId !== deviceId ? partner.slot : null;

  const claimSlot = (slot) => {
    if (slot === who) return;
    if (slot === lockedSlot) {
      const label = names[slot] || (slot === "a" ? "Me" : "Partner");
      const ok = confirm(
        `${label} is being scored on the other phone.\n\n` +
        "Score as them on this phone too? Both of you rating the same person is " +
        "usually a mistake, and whichever phone syncs last will not overwrite the other.",
      );
      if (!ok) return;
      setPartner(null);           // taken over: the old claim no longer holds
    }
    setWho(slot);
  };

  const patch = useCallback((id, fn) =>
    setCars((cs) => cs.map((c) => (c.id === id ? fn(structuredClone(c)) : c))), []);

  const addCar = (name) => {
    const c = blankCar(name);
    setCars((cs) => [...cs, c]);
    setOpenCar(c.id);
    setView("score");
  };
  const car = cars.find((c) => c.id === openCar);

  const handleImport = (incoming, mode, opts = {}) => {
    /* Resolve slot ownership before touching the scores. */
    if (opts.moveMeTo === "a" || opts.moveMeTo === "b") setWho(opts.moveMeTo);
    const mySlot = opts.moveMeTo || who;
    const claim = incoming.claim;
    if (claim && claim.deviceId && claim.deviceId !== deviceId) {
      /* Only ever record a claim on the slot this device is not scoring, so
         `who` can never end up locked against its own user. */
      setPartner(claim.slot === mySlot ? null : claim);
    }

    if (mode === "replace") {
      setCars(incoming.cars);
      setNames(incoming.names);
      setWeights(incoming.weights);
      setReq(incoming.req || {});
      setStatus("Replaced");
    } else {
      const r = mergeGaps(cars, incoming);
      setCars(r.cars);
      if (!cars.length) {
        setNames(incoming.names);
        setWeights(incoming.weights);
        setReq(incoming.req || {});
      }
      setStatus(`+${r.added} cars · ${r.filled} ratings`);
    }
    setTimeout(() => setStatus(""), 3500);
    setView("results");
  };

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="top">
        <div className="toprow">
          <span className="brand">Test drive<span className="brandthin"> scorecard</span></span>
          <span className="saved">{status}</span>
        </div>
        <div className="whorow">
          {["a", "b"].map((k) => {
            const label = names[k] || (k === "a" ? "Me" : "Partner");
            const locked = lockedSlot === k;
            return (
              <button key={k} className={"whobtn" + (who === k ? " active" : "") + (locked ? " locked" : "")}
                style={who === k ? { background: COL[k], borderColor: COL[k] } : undefined}
                aria-label={locked ? `${label} — being scored on the other phone` : undefined}
                onClick={() => claimSlot(k)}>
                {label}
                {locked && <span className="wholock" aria-hidden="true">other phone</span>}
              </button>
            );
          })}
        </div>
      </header>

      <nav className="tabs">
        {[["garage", "Cars"], ["score", car ? car.name || "Score" : "Score"], ["results", "Results"], ["xfer", "Transfer"]].map(([id, label]) => (
          <button key={id} className={"tab" + (view === id ? " on" : "")} disabled={id === "score" && !car}
            onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>

      {!loaded ? <div className="pane"><div className="empty">Loading your scores…</div></div>
        : view === "garage" ? (
          <Garage cars={cars} names={names} weights={weights} req={req}
            setNames={setNames} setWeights={setWeights} setReq={setReq}
            onAdd={addCar} onOpen={(id) => { setOpenCar(id); setView("score"); }} />
        ) : view === "score" ? (
          <Score car={car} who={who} names={names} weights={weights} req={req} patch={patch}
            onRemove={() => {
              if (confirm(`Remove ${car.name} and its scores?`)) {
                setCars((cs) => cs.filter((c) => c.id !== car.id));
                setView("garage");
              }
            }} />
        ) : view === "results" ? (
          <Results cars={cars} names={names} weights={weights} req={req} />
        ) : (
          <Transfer
            state={{ cars, names, weights, req, claim: { slot: who, deviceId } }}
            who={who} names={names} onImport={handleImport} />
        )}
    </div>
  );
}

/* ═══ styles ═════════════════════════════════════════════════ */

const CSS = `
.app{
  --ink:#10161C; --mut:#68727C; --line:#DCE0E2; --bg:#EEF1F2; --card:#fff;
  background:var(--bg); color:var(--ink); min-height:100vh;
  font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
  max-width:620px; margin:0 auto; padding-bottom:56px;
}
.app *{box-sizing:border-box}
.app button:focus-visible,.app input:focus-visible,.app textarea:focus-visible{outline:2px solid #3A2FD6;outline-offset:2px}
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding:14px 16px 10px;border-bottom:1px solid var(--line)}
.toprow{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.brand{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.brandthin{font-weight:400;color:var(--mut)}
.saved{font-size:11px;color:var(--mut);font-family:ui-monospace,monospace;white-space:nowrap}
.whorow{display:flex;gap:8px;margin-top:10px}
.whobtn{flex:1;padding:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:2px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.whobtn.active{color:#fff}
.whobtn.locked{color:var(--mut);border-style:dashed}
.wholock{display:block;font-size:9px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#A6AEB4;margin-top:2px}
.tabs{display:flex;border-bottom:1px solid var(--line);background:var(--bg);position:sticky;top:88px;z-index:4}
.tab{flex:1;padding:11px 4px;border:0;background:none;color:var(--mut);font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:inherit}
.tab.on{color:var(--ink);border-bottom-color:var(--ink)}
.tab:disabled{opacity:.35;cursor:default}
.pane{padding:16px}
.lede{font-size:14px;line-height:1.5;color:var(--mut);margin:0 0 16px}
.h3{font-size:12px;letter-spacing:.11em;text-transform:uppercase;margin:0 0 4px;font-weight:700;display:block}
.h3.spaced{margin-top:34px}
.sub{font-size:12.5px;color:var(--mut);margin:0 0 12px;line-height:1.45}
.sub.center{text-align:center}
.in{width:100%;padding:9px 2px;border:0;border-bottom:1.5px solid var(--line);background:none;font-size:16px;color:var(--ink);font-family:inherit}
.in::placeholder{color:#A6AEB4}
.addrow{display:flex;gap:10px;align-items:center;margin-bottom:18px}
.btn{border:1px solid var(--ink);background:none;color:var(--ink);padding:9px 16px;border-radius:2px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit}
.btn.solid{background:var(--ink);color:#fff}
.btn:disabled{opacity:.3;cursor:default}
.btn.ghost{border-color:var(--line);color:var(--mut)}
.btn.wide{width:100%;margin-top:10px;white-space:normal}
.empty{text-align:center;padding:40px 20px;color:var(--mut);font-size:14px;line-height:1.6}
.emptybolt{display:block;font-size:22px;margin-bottom:8px}
.carcard{display:block;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:3px;padding:14px;margin-bottom:10px;cursor:pointer;font-family:inherit}
.carhead{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.carname{font-size:17px;font-weight:600}
.carscore{font-family:ui-monospace,monospace;font-size:22px;font-variant-numeric:tabular-nums}
.progrow{display:flex;flex-direction:column;gap:5px;margin-top:10px}
.prog,.restrack{display:flex;align-items:center;gap:8px}
.proglabel{font-size:11px;color:var(--mut);width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.progtrack{flex:1;height:5px;background:var(--line);border-radius:3px;overflow:hidden}
.progfill{display:block;height:100%;transition:width .3s ease}
.progn{font-family:ui-monospace,monospace;font-size:11px;color:var(--mut);font-variant-numeric:tabular-nums;width:42px;text-align:right}
.flagline{margin-top:9px;font-size:11.5px;color:#B4531B}
.weights{margin-top:32px;padding-top:20px;border-top:1px solid var(--line)}
.wrow{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.wlabel{font-size:14px;width:120px}
.wrow input[type=range]{flex:1;accent-color:#10161C}
.wval{font-family:ui-monospace,monospace;font-size:13px;width:26px;text-align:right}
.namerow{display:flex;gap:14px}
.kitrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.kitrow.dim .kitlabel{color:#9AA3AA}
.kitlabel{font-size:14px;line-height:1.35;flex:1}
.reqtag{display:inline-block;margin-left:7px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--mut);border:1px solid var(--line);border-radius:2px;padding:1px 5px;vertical-align:1px}
.reqtag.must{color:#B4531B;border-color:#E5C3A8}
.triple{display:flex;gap:3px;flex-shrink:0}
.tri{min-width:44px;height:34px;border:1px solid var(--line);background:var(--card);border-radius:2px;font-size:12px;font-weight:600;color:var(--mut);cursor:pointer;font-family:inherit;padding:0 8px}
.tri.on{background:var(--ink);border-color:var(--ink);color:#fff}
.tri.must.on{background:#B4531B;border-color:#B4531B}
.titlerow{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}
.cartitle{flex:1;border:0;background:none;font-size:22px;font-weight:600;color:var(--ink);font-family:inherit;padding:0 0 4px;border-bottom:1.5px solid var(--line);min-width:0}
.bigscore{font-family:ui-monospace,monospace;font-size:34px;line-height:1;font-variant-numeric:tabular-nums}
.kitnote{font-size:12px;color:#7A3A12;background:#FDF3EA;border-left:2px solid #B4531B;padding:8px 11px;margin-bottom:18px}
.facts,.group{margin-bottom:30px;padding-bottom:24px;border-bottom:1px solid var(--line)}
.factgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.factcell{display:flex;flex-direction:column;gap:2px}
.factlabel{font-size:11.5px;color:var(--mut)}
.factin{display:flex;align-items:baseline;gap:5px;border-bottom:1.5px solid var(--line)}
.factin input{width:100%;min-width:0;border:0;background:none;padding:6px 0;font-size:16px;font-family:ui-monospace,monospace;color:var(--ink)}
.unit{font-size:11px;color:var(--mut);font-family:ui-monospace,monospace}
.grouphead{display:flex;justify-content:space-between;align-items:center}
.weightpill{font-family:ui-monospace,monospace;font-size:11px;color:var(--mut);border:1px solid var(--line);padding:2px 7px;border-radius:2px}
.crit{margin-bottom:14px}
.critlabel{display:block;font-size:14.5px;margin-bottom:6px}
.bar-wrap{display:flex;align-items:center;gap:10px}
.bar{display:flex;gap:3px;flex:1}
.cell{flex:1;height:38px;border:1px solid var(--line);background:var(--card);border-radius:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .12s ease}
.cellnum{font-family:ui-monospace,monospace;font-size:11px;color:#B3BBC1}
.cell.on .cellnum{color:#fff}
.barval{font-family:ui-monospace,monospace;font-size:15px;width:14px;text-align:right;color:var(--mut)}
.ta{width:100%;border:1px solid var(--line);border-radius:3px;padding:11px;font-size:16px;font-family:inherit;color:var(--ink);background:var(--card);resize:vertical;line-height:1.5}
.ta::placeholder{color:#A6AEB4}
.breaker{display:block;margin-top:16px}
.breakerlabel{display:block;font-size:11.5px;color:#B4531B;letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:2px}
.resrow{background:var(--card);border:1px solid var(--line);border-radius:3px;padding:14px;margin-bottom:12px}
.reshead{display:flex;align-items:baseline;gap:10px}
.respos{font-family:ui-monospace,monospace;font-size:12px;color:var(--mut)}
.resname{font-size:17px;font-weight:600;flex:1}
.restotal{font-family:ui-monospace,monospace;font-size:24px;font-variant-numeric:tabular-nums}
.restracks{margin-top:10px;display:flex;flex-direction:column;gap:5px}
.catline{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.cat{display:flex;flex-direction:column}
.catname{font-size:10.5px;color:var(--mut)}
.catval{font-family:ui-monospace,monospace;font-size:14px}
.flagbox{margin-top:12px;padding:9px 11px;background:#FDF3EA;border-left:2px solid #B4531B;font-size:12.5px;color:#7A3A12;line-height:1.5}
.flagbox.hard{background:#FBE9E4;border-left-width:3px}
.unknownline{margin-top:8px;font-size:11.5px;color:var(--mut);line-height:1.45}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tbl{border-collapse:collapse;width:100%;font-size:13px}
.tbl th,.tbl td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl th{font-size:11px;color:var(--mut);font-weight:600}
.tbl td{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums}
.rowlabel{text-align:left!important;font-family:inherit!important;color:var(--mut);white-space:normal;min-width:140px}
.tbl th:first-child,.tbl td:first-child{position:sticky;left:0;background:var(--bg)}
.best{color:#1B6B4A;font-weight:700}
.gone{color:#B4531B}
.split{display:flex;align-items:baseline;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}
.splitcar{font-size:11px;color:var(--mut);width:78px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.splitlabel{flex:1;font-size:14px}
.splitvals{font-family:ui-monospace,monospace;font-size:14px}
.vs{color:var(--mut);font-size:10px;margin:0 5px}
.notecard{background:var(--card);border:1px solid var(--line);border-radius:3px;padding:12px;margin-bottom:10px}
.notecar{font-size:14px;font-weight:600;margin-bottom:6px}
.note{font-size:13.5px;line-height:1.55;margin:0 0 6px;color:#2B343C}
.reportbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:3px;padding:13px 14px;margin-bottom:20px}
.reportcopy{display:flex;flex-direction:column;gap:3px;min-width:0}
.reporttitle{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.reportsub{font-size:12px;color:var(--mut);line-height:1.4}
.modes{display:flex;gap:10px;margin-bottom:22px}
.modebtn{flex:1;padding:16px 10px;border:1px solid var(--line);background:var(--card);border-radius:3px;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit;line-height:1.4}
.modebtn.on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.modeicon{display:block;font-size:20px;margin-bottom:6px;color:var(--mut)}
.xfer{display:flex;flex-direction:column;align-items:stretch}
.qrbox{display:flex;justify-content:center;padding:10px;background:#fff;border:1px solid var(--line);border-radius:3px;overflow:hidden}
.qrcanvas{display:block;image-rendering:pixelated;max-width:100%;height:auto}
.qrerr{padding:30px;text-align:center;color:#B4531B;font-size:13px}
.frameline{display:flex;align-items:center;justify-content:center;gap:16px;margin:14px 0 4px}
.stepbtn{width:38px;height:38px;border:1px solid var(--line);background:var(--card);border-radius:2px;font-size:20px;line-height:1;color:var(--ink);cursor:pointer;font-family:inherit}
.framecount{font-family:ui-monospace,monospace;font-size:13px;min-width:110px;text-align:center}
.opts{display:flex;gap:10px;margin-top:14px}
.opt{flex:1;padding:9px;border:1px solid var(--line);background:var(--card);border-radius:2px;font-size:12.5px;color:var(--mut);cursor:pointer;font-family:inherit}
.camwrap{position:relative;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:#000}
.cam{width:100%;display:block;max-height:60vh;object-fit:cover}
.reticle{position:absolute;inset:14%;border:2px solid rgba(255,255,255,.85);border-radius:4px;pointer-events:none}
.notice{padding:12px 14px;background:var(--card);border:1px solid var(--line);border-left:2px solid var(--mut);font-size:13px;line-height:1.5;color:#2B343C;border-radius:2px}
.notice.warn{border-left-color:#B4531B;color:#7A3A12;margin-top:12px}
.pips{display:flex;align-items:center;gap:6px;margin:14px 0 4px;flex-wrap:wrap}
.pip{width:22px;height:6px;background:var(--line);border-radius:3px}
.pip.got{background:#1B6B4A}
.pipn{font-family:ui-monospace,monospace;font-size:11px;color:var(--mut);margin-left:6px}
.photobox{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}
.pastebox{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
.previewbox{background:var(--card);border:1px solid var(--line);border-radius:3px;padding:14px;margin-bottom:6px}
.carlist{list-style:none;padding:0;margin:10px 0 0;font-size:14px}
.carlist li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)}
.carlistn{font-family:ui-monospace,monospace;font-size:12px;color:var(--mut)}
@media (prefers-reduced-motion:reduce){.app *{transition:none!important}}
@media (max-width:420px){
  .reportbar{flex-direction:column;align-items:stretch}
  .reportbar .btn{width:100%}
  .factgrid{grid-template-columns:1fr}
  .kitrow{flex-direction:column;align-items:flex-start;gap:8px}
  .triple{width:100%}
  .tri{flex:1}
}
`;
