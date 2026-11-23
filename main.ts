// news-image-20261122 — a one-day front page, drawn entirely from code.
// Sunday 22 November 2026: COP31 collapses in Antalya; Iran strikes Bahrain;
// a Russian missile hits Kryvyi Rih; Mexico captures "El Chapo Isidro";
// markets slide into correction. No assets, no network, no fonts from disk:
// a hand-built 5x7 bitmap font, a tiny PNG encoder, and a broadsheet layout.
// Deterministic: the same input always produces the same bytes.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER = [247, 242, 228, 255] as const;
const INK = [20, 18, 16, 255] as const;
const RED = [168, 30, 34, 255] as const;
const BLUE = [44, 74, 107, 255] as const;
const SKY = [198, 222, 235, 255] as const;
const LAND = [96, 140, 92, 255] as const;
const GREY = [120, 116, 106, 255] as const;
const GOLD = [176, 132, 52, 255] as const;
const WHITE = [255, 255, 255, 255] as const;
const DARK = [38, 38, 40, 255] as const;

type RGBA = readonly [number, number, number, number];

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  px[i * 4] = PAPER[0];
  px[i * 4 + 1] = PAPER[1];
  px[i * 4 + 2] = PAPER[2];
  px[i * 4 + 3] = 255;
}

function setPixel(x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c[3];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
}

function frame(x: number, y: number, w: number, h: number, c: RGBA, t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x: number, y: number, w: number, c: RGBA, t = 1): void {
  fillRect(x, y, w, t, c);
}

function vline(x: number, y: number, h: number, c: RGBA, t = 1): void {
  fillRect(x, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function poly(points: Array<[number, number]>, c: RGBA, thick = 1): void {
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    line(x0, y0, x1, y1, c);
    if (thick > 1) {
      line(x0, y0 + 1, x1, y1 + 1, c);
      line(x0 + 1, y0, x1 + 1, y1, c);
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) setPixel(cx + x, cy + y, c);
}

function ring(cx: number, cy: number, r: number, c: RGBA, t = 2): void {
  for (let a = 0; a < 720; a++) {
    const th = (a / 720) * Math.PI * 2;
    for (let k = 0; k < t; k++)
      setPixel(Math.round(cx + (r - k) * Math.cos(th)), Math.round(cy + (r - k) * Math.sin(th)), c);
  }
}

// filled circle clipped to a disc, used for the globe's land blobs
function blobInDisc(cx: number, cy: number, r: number, pts: Array<[number, number]>, c: RGBA): void {
  // scanline fill of a polygon, then clip to the disc
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) setPixel(x, y, c);
      }
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 bits, written as strings for readability.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "\u2013": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "\u2014": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "\u2019": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "\u2022": ["00000", "01100", "01100", "01100", "00000", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function glyph(ch: string): string[] {
  return FONT[ch] ?? FONT["?"];
}

function textWidth(text: string, scale: number): number {
  // 6 units per char (5 + 1 tracking), minus the trailing tracking
  return text.length === 0 ? 0 : (text.length * 6 - 1) * scale;
}

function drawText(x: number, y: number, text: string, scale: number, c: RGBA): void {
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (g[r][col] === "1") {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cx: number, y: number, text: string, scale: number, c: RGBA): void {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, text, scale, c);
}

// Greedy word wrap on pixel width.
function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (textWidth(next, scale) <= maxW) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawPara(x: number, y: number, text: string, scale: number, maxW: number, c: RGBA, leading: number): number {
  const lines = wrap(text, maxW, scale);
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += leading;
  }
  return yy;
}

// ---------------------------------------------------------------- the page
const M = 30; // outer margin
const CW = W - 2 * M; // 964 content width

function drawMasthead(): void {
  // double rule above the nameplate
  hline(M, 34, CW, INK, 3);
  hline(M, 40, CW, INK, 1);
  drawTextCentered(W / 2, 50, "ONE DAY'S NEWS  -  IN ONE IMAGE", 2, GREY);
  drawTextCentered(W / 2, 74, "THE WORLD TODAY", 8, INK);
  hline(M, 142, CW, INK, 1);
  // date line with side notes
  drawText(M, 152, "No. 22", 2, GREY);
  drawTextCentered(W / 2, 152, "SUNDAY, 22 NOVEMBER 2026", 3, RED);
  const right = "SUNDAY EDITION";
  drawText(W - M - textWidth(right, 2), 152, right, 2, GREY);
  hline(M, 178, CW, INK, 3);
}

// Lead story: the COP31 collapse, with a cracked globe illustration.
function drawLead(): void {
  const y0 = 192;
  drawText(M, y0, "CLIMATE  -  COP31 ENDS WITH NO DEAL, ANTALYA", 2, RED);
  drawText(M, y0 + 22, "CLIMATE TALKS", 7, INK);
  drawText(M, y0 + 74, "COLLAPSE", 7, INK);
  hline(M, y0 + 128, 560, INK, 1);
  drawPara(
    M,
    y0 + 140,
    "The EU rejects a draft with no mention of fossil fuels, and the COP31 summit ends in Antalya with no agreement at all.",
    2,
    540,
    INK,
    20,
  );
  drawPara(
    M,
    y0 + 206,
    "Two days past deadline, negotiators leave empty-handed. The final text never named fossil fuels - and Europe said no.",
    2,
    540,
    GREY,
    20,
  );

  // illustration panel: cracked globe under smoke, red NO DEAL tag
  const px0 = 610;
  const py0 = 196;
  const pw = W - M - px0; // 384
  const ph = 236;
  frame(px0, py0, pw, ph, INK, 2);
  fillRect(px0 + 2, py0 + 2, pw - 4, ph - 4, SKY);
  // smoke puffs
  disc(px0 + 90, py0 + 46, 16, GREY);
  disc(px0 + 118, py0 + 34, 20, GREY);
  disc(px0 + 150, py0 + 48, 14, GREY);
  disc(px0 + 262, py0 + 40, 15, GREY);
  disc(px0 + 290, py0 + 54, 11, GREY);
  // globe
  const gx = px0 + 192;
  const gy = py0 + 138;
  const gr = 62;
  disc(gx, gy, gr, [214, 231, 240, 255]);
  blobInDisc(gx, gy, gr, [[gx - 48, gy - 30], [gx - 18, gy - 44], [gx + 2, gy - 20], [gx - 8, gy + 2], [gx - 40, gy - 6]], LAND);
  blobInDisc(gx, gy, gr, [[gx + 8, gy + 12], [gx + 34, gy + 2], [gx + 48, gy + 26], [gx + 22, gy + 40], [gx + 2, gy + 30]], LAND);
  blobInDisc(gx, gy, gr, [[gx - 30, gy + 26], [gx - 6, gy + 20], [gx - 2, gy + 44], [gx - 26, gy + 50]], LAND);
  // latitude lines
  for (const dy of [-30, 0, 30]) {
    const half = Math.floor(Math.sqrt(gr * gr - dy * dy));
    hline(gx - half, gy + dy, half * 2, BLUE, 1);
  }
  ring(gx, gy, gr, INK, 3);
  // the crack, in red
  poly(
    [
      [gx - 46, gy - 58],
      [gx - 22, gy - 30],
      [gx - 38, gy - 6],
      [gx - 8, gy + 18],
      [gx - 26, gy + 42],
      [gx - 2, gy + 60],
    ],
    RED,
    3,
  );
  // NO DEAL tag
  fillRect(px0 + 96, py0 + 196, 192, 30, RED);
  drawTextCentered(px0 + 192, py0 + 203, "NO DEAL", 2, WHITE);
}

// Two-column story block.
function drawStory(
  x: number,
  y: number,
  w: number,
  kicker: string,
  head1: string,
  head2: string,
  body: string,
  art: () => void,
): number {
  drawText(x, y, kicker, 2, RED);
  drawText(x, y + 22, head1, 4, INK);
  drawText(x, y + 54, head2, 4, INK);
  hline(x, y + 88, w, INK, 1);
  const end = drawPara(x, y + 98, body, 2, w, INK, 20);
  art();
  return end;
}

function drawRow2(): void {
  const y0 = 462;
  const colW = 472;
  // left: Bahrain
  drawStory(
    M,
    y0,
    colW,
    "THE GULF  -  BAHRAIN",
    "IRAN STRIKES",
    "BAHRAIN SITE",
    "Iranian projectiles hit an industrial site in Bahrain, injuring two people. Gulf states condemn the attack as the region's war widens.",
    () => {
      // blast starburst
      const bx = M + 410;
      const by = y0 + 30;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        line(bx, by, Math.round(bx + 26 * Math.cos(a)), Math.round(by + 26 * Math.sin(a)), GOLD);
      }
      disc(bx, by, 10, RED);
      disc(bx, by, 5, GOLD);
    },
  );
  vline(W / 2, y0, 178, INK, 1);
  // right: Ukraine
  drawStory(
    W / 2 + 20,
    y0,
    colW,
    "UKRAINE  -  KRYVYI RIH",
    "MISSILE KILLS",
    "TWO, WOUNDS 60",
    "A Russian missile hits Zelenskyy's hometown, killing a 7-year-old boy and a 20-year-old woman. A drone strike near Kyiv leaves 14 missing.",
    () => {
      // broken skyline
      const bx = W - M - 96;
      const by = y0 + 16;
      fillRect(bx, by + 18, 18, 34, DARK);
      fillRect(bx + 24, by + 6, 18, 46, DARK);
      fillRect(bx + 48, by + 26, 18, 26, DARK);
      poly([[bx + 24, by + 6], [bx + 33, by - 6], [bx + 42, by + 6]], RED, 2);
      line(bx + 33, by - 6, bx + 60, by - 14, RED);
      disc(bx + 62, by - 16, 4, RED);
    },
  );
}

function drawRow3(): void {
  const y0 = 664;
  const colW = 472;
  // left: Mexico
  drawStory(
    M,
    y0,
    colW,
    "MEXICO  -  SINALOA",
    "CARTEL BOSS",
    "CAPTURED",
    "Special forces seize Fausto Isidro Meza Flores, 'El Chapo Isidro', in a raid that leaves 11 dead, including four soldiers.",
    () => {
      // handcuffs: two rings joined by a bar
      const bx = M + 396;
      const by = y0 + 30;
      ring(bx, by, 13, INK, 3);
      ring(bx + 34, by, 13, INK, 3);
      hline(bx + 10, by - 2, 16, INK, 4);
    },
  );
  vline(W / 2, y0, 178, INK, 1);
  // right: markets with a bar chart
  drawText(W / 2 + 20, y0, "MARKETS  -  NEW YORK", 2, RED);
  drawText(W / 2 + 20, y0 + 22, "STOCKS SLIDE", 4, INK);
  drawText(W / 2 + 20, y0 + 54, "INTO CORRECTION", 4, INK);
  hline(W / 2 + 20, y0 + 88, colW, INK, 1);
  // chart: three red bars, values as % falls, caption below
  const cx = W / 2 + 20;
  const base = y0 + 150;
  const bars: Array<[string, string, number]> = [
    ["S&P 500", "-3.7%", 24],
    ["NASDAQ", "-5.3%", 34],
    ["NIKKEI", "-5.1%", 33],
  ];
  hline(cx, base, 300, INK, 2);
  bars.forEach(([label, val, h], i) => {
    const bx = cx + 12 + i * 100;
    fillRect(bx, base - h, 56, h, RED);
    drawText(bx + 2, base - h - 16, val, 2, RED);
    drawText(bx, base + 8, label, 2, INK);
  });
  drawText(cx, y0 + 178, "AI sell-off spreads on Friday.", 2, INK);
}

function drawInBrief(): void {
  const y0 = 862;
  fillRect(M, y0, CW, 100, DARK);
  drawText(M + 14, y0 + 12, "IN BRIEF", 3, WHITE);
  const items: string[] = [
    "Indonesia: candy factory fire in Cikande kills 3; 36 missing.",
    "West Bank: settlers torch 12 vehicles; Israel opens inquiry.",
    "Nigeria: boat capsizes on the way to a funeral; 24 dead.",
    "Space: BepiColombo in Mercury orbit; ESA reports a glitch.",
    "Obituary: Paolo Bulgari, jeweller and luxury icon, dies at 89.",
  ];
  const colW = 460;
  items.forEach((it, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x = M + 14 + col * (colW + 30);
    const y = y0 + 44 + row * 18;
    fillRect(x, y + 3, 8, 8, RED);
    drawText(x + 14, y, it, 1, WHITE);
  });
}

function drawFooter(): void {
  hline(M, 978, CW, INK, 1);
  drawTextCentered(W / 2, 988, "SUNDAY 22 NOVEMBER 2026  -  SOURCES: AP, REUTERS, AFP", 2, GREY);
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- build
function main(): void {
  frame(14, 14, W - 28, H - 28, INK, 3);
  frame(22, 22, W - 44, H - 44, INK, 1);
  drawMasthead();
  drawLead();
  hline(M, 452, CW, INK, 2);
  drawRow2();
  hline(M, 654, CW, INK, 2);
  drawRow3();
  drawInBrief();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePng());
}

main();
