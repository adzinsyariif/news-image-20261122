// news-image-20261122 — v2: the whole world of Sunday 22 November 2026
// on one page. Thirty-six dated stories organised by region under a
// single masthead: the COP31 collapse in Antalya leads, then Europe,
// the Middle East, Asia-Pacific, the Americas, Africa, sport & science,
// a markets strip and an in-brief band. Drawn entirely from code — a
// hand-built 5x7 bitmap font, flat vector illustration, a tiny PNG
// encoder. No assets, no network, deterministic byte-identical output.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const MX = 28; // page margin
const CW = W - 2 * MX; // 968 content width

// ---------------------------------------------------------------- palette
type RGBA = readonly [number, number, number, number];
const PAPER: RGBA = [246, 241, 227, 255];
const CARD: RGBA = [255, 253, 244, 255];
const INK: RGBA = [22, 24, 29, 255];
const BODY: RGBA = [52, 50, 46, 255];
const RED: RGBA = [176, 30, 40, 255];
const GOLD: RGBA = [201, 151, 63, 255];
const GREY: RGBA = [111, 106, 94, 255];
const WHITE: RGBA = [255, 255, 255, 255];

const EUROPE: RGBA = [31, 78, 121, 255];
const MIDEAST: RGBA = [179, 92, 30, 255];
const ASIA: RGBA = [163, 22, 52, 255];
const AMERICAS: RGBA = [30, 112, 64, 255];
const AFRICA: RGBA = [106, 61, 154, 255];
const SPORTSCI: RGBA = [15, 118, 110, 255];

function tint(c: RGBA, f: number): RGBA {
  // mix colour c toward PAPER by fraction f
  return [
    Math.round(c[0] + (PAPER[0] - c[0]) * f),
    Math.round(c[1] + (PAPER[1] - c[1]) * f),
    Math.round(c[2] + (PAPER[2] - c[2]) * f),
    255,
  ];
}

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

function disc(cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) setPixel(cx + x, cy + y, c);
}

function ring(cx: number, cy: number, r: number, c: RGBA, t = 2): void {
  for (let a = 0; a < 720; a++) {
    const th = (a / 720) * Math.PI * 2;
    for (let k = 0; k < t; k++)
      setPixel(
        Math.round(cx + (r - k) * Math.cos(th)),
        Math.round(cy + (r - k) * Math.sin(th)),
        c,
      );
  }
}

// thick polyline: stamps a filled disc of radius r along each segment
function stroke(points: Array<[number, number]>, r: number, c: RGBA): void {
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      disc(x, y, r, c);
    }
  }
}

// scanline polygon fill, optionally clipped to a disc
function fillPoly(
  pts: Array<[number, number]>,
  c: RGBA,
  clip?: { cx: number; cy: number; r: number },
): void {
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
        if (clip) {
          const dx = x - clip.cx;
          const dy = y - clip.cy;
          if (dx * dx + dy * dy > clip.r * clip.r) continue;
        }
        setPixel(x, y, c);
      }
    }
  }
}

// vertical gradient in flat bands (keeps the PNG lean)
function vGradient(
  x: number,
  y: number,
  w: number,
  h: number,
  top: RGBA,
  bot: RGBA,
  bands: number,
): void {
  const bh = Math.ceil(h / bands);
  for (let b = 0; b < bands; b++) {
    const f = bands === 1 ? 0 : b / (bands - 1);
    const c: RGBA = [
      Math.round(top[0] + (bot[0] - top[0]) * f),
      Math.round(top[1] + (bot[1] - top[1]) * f),
      Math.round(top[2] + (bot[2] - top[2]) * f),
      255,
    ];
    const yy = y + b * bh;
    if (yy < y + h) fillRect(x, yy, w, Math.min(bh, y + h - yy), c);
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 pixels, drawn as strings.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "\u00dc": ["01010", "00000", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10010", "01010", "00100", "01010", "10010", "10001"],
  Y: ["10001", "10001", "10001", "01010", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10100", "11000", "10100", "10010", "10001"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
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
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
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
  "\u00b7": ["00000", "00000", "00000", "01100", "01100", "00000", "00000"],
  "\u2022": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function glyph(ch: string): string[] {
  return FONT[ch] ?? FONT["?"];
}

// advance per character: 5 glyph columns + 1 tracking column, plus
// any extra letterspacing, all in units of the scale
function advance(scale: number, track = 0): number {
  return 6 * scale + track;
}

function textWidth(text: string, scale: number, track = 0): number {
  if (text.length === 0) return 0;
  return text.length * advance(scale, track) - scale - track;
}

interface TextOpts {
  bold?: boolean;
  track?: number;
}

function drawText(
  x: number,
  y: number,
  text: string,
  scale: number,
  c: RGBA,
  opts: TextOpts = {},
): void {
  const adv = advance(scale, opts.track ?? 0);
  const boldOff = opts.bold ? Math.max(1, Math.ceil(scale / 4)) : 0;
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (g[r][col] === "1") {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
          if (boldOff > 0)
            fillRect(cx + col * scale + boldOff, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += adv;
  }
}

function drawTextCentered(
  cx: number,
  y: number,
  text: string,
  scale: number,
  c: RGBA,
  opts: TextOpts = {},
): void {
  drawText(cx - Math.floor(textWidth(text, scale, opts.track ?? 0) / 2), y, text, scale, c, opts);
}

function drawTextRight(
  xr: number,
  y: number,
  text: string,
  scale: number,
  c: RGBA,
  opts: TextOpts = {},
): void {
  drawText(xr - textWidth(text, scale, opts.track ?? 0), y, text, scale, c, opts);
}

// greedy word wrap on pixel width
function wrap(text: string, maxW: number, scale: number, track = 0): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (textWidth(next, scale, track) <= maxW) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawPara(
  x: number,
  y: number,
  text: string,
  scale: number,
  maxW: number,
  c: RGBA,
  leading: number,
  opts: TextOpts = {},
): number {
  const lines = wrap(text, maxW, scale, opts.track ?? 0);
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c, opts);
    yy += leading;
  }
  return yy;
}

// ---------------------------------------------------------------- the page
function drawMasthead(): void {
  // dark nameplate band
  fillRect(MX, 26, CW, 90, INK);
  drawTextCentered(W / 2, 36, "ONE DAY'S NEWS \u2014 IN ONE IMAGE", 2, GOLD, { track: 2 });
  drawTextCentered(W / 2, 56, "THE WORLD TODAY", 8, WHITE, { bold: true });
  drawTextRight(W - MX - 10, 38, "SOURCES: AP, REUTERS, AFP, BBC", 1, GOLD);
  // red date strip
  fillRect(MX, 120, CW, 28, RED);
  drawText(MX + 12, 127, "No. 22", 2, WHITE);
  drawTextCentered(W / 2, 126, "SUNDAY, 22 NOVEMBER 2026", 3, WHITE, { bold: true });
  drawTextRight(W - MX - 12, 127, "36 STORIES", 2, WHITE, { bold: true });
}

// Lead: COP31 collapse in Antalya, with a burning, cracked globe.
function drawLead(): void {
  const y0 = 156;
  drawText(MX, y0 + 2, "CLIMATE SUMMIT \u2014 ANTALYA, T\u00dcRKIYE", 2, RED, { bold: true });
  drawText(MX, y0 + 22, "CLIMATE TALKS COLLAPSE", 5, INK, { bold: true });
  hline(MX, y0 + 64, 640, INK, 2);
  drawPara(
    MX,
    y0 + 72,
    "The EU rejects a draft that never names fossil fuels, and the longest climate talks in UN history end with no agreement \u2014 two days past their deadline.",
    2,
    700,
    BODY,
    17,
  );
  drawText(MX, y0 + 126, "Nearly 200 nations; fossil fuels the breaking point", 2, GREY);

  // illustration: smoke-dark sky over a cracked, burning planet
  const ax = 748;
  const ay = y0;
  const aw = W - MX - ax; // 248
  const ah = 140;
  vGradient(ax, ay, aw, ah, [35, 38, 44, 255], [122, 58, 30, 255], 12);
  frame(ax, ay, aw, ah, INK, 2);
  // smoke plumes
  const smoke: RGBA = [126, 121, 113, 255];
  disc(ax + 52, ay + 20, 10, smoke);
  disc(ax + 74, ay + 12, 13, smoke);
  disc(ax + 98, ay + 22, 8, smoke);
  disc(ax + 176, ay + 16, 9, smoke);
  disc(ax + 196, ay + 26, 7, smoke);
  // the planet
  const gx = ax + 124;
  const gy = ay + 60;
  const gr = 50;
  const ocean: RGBA = [46, 95, 120, 255];
  const land: RGBA = [74, 128, 72, 255];
  disc(gx, gy, gr, ocean);
  const clip = { cx: gx, cy: gy, r: gr };
  fillPoly(
    [[gx - 40, gy - 28], [gx - 14, gy - 40], [gx + 4, gy - 18], [gx - 6, gy + 2], [gx - 36, gy - 4]],
    land,
    clip,
  );
  fillPoly(
    [[gx + 10, gy + 8], [gx + 34, gy - 2], [gx + 44, gy + 22], [gx + 20, gy + 36], [gx + 4, gy + 26]],
    land,
    clip,
  );
  fillPoly(
    [[gx - 28, gy + 22], [gx - 6, gy + 16], [gx - 2, gy + 38], [gx - 24, gy + 44]],
    land,
    clip,
  );
  ring(gx, gy, gr, INK, 3);
  // the crack, glowing: ember halo, red core, yellow heart
  const crack: Array<[number, number]> = [
    [gx - 24, gy - 44],
    [gx - 10, gy - 24],
    [gx - 22, gy - 4],
    [gx - 4, gy + 16],
    [gx - 16, gy + 34],
    [gx, gy + 45],
  ];
  stroke(crack, 3, [232, 106, 23, 255]);
  stroke(crack, 2, [193, 39, 45, 255]);
  stroke(crack, 0, [255, 197, 61, 255]);
  // skyline silhouette along the bottom
  const sil: RGBA = [18, 18, 22, 255];
  fillRect(ax + 2, ay + ah - 28, aw - 4, 26, sil);
  fillRect(ax + 14, ay + ah - 38, 26, 12, sil);
  fillRect(ax + 54, ay + ah - 44, 18, 18, sil);
  fillRect(ax + 182, ay + ah - 40, 30, 14, sil);
  // NO DEAL tag across the planet's base
  fillRect(gx - 60, ay + 106, 120, 24, RED);
  drawTextCentered(gx, ay + 111, "NO DEAL", 2, WHITE, { bold: true });
}

// Markets strip: the correction, in big red numbers.
function drawMarkets(): void {
  const y0 = 302;
  const hh = 80;
  fillRect(MX, y0, CW, hh, CARD);
  frame(MX, y0, CW, hh, INK, 2);
  drawText(MX + 16, y0 + 10, "MARKETS \u2014 NEW YORK", 2, RED, { bold: true });
  drawText(MX + 16, y0 + 28, "STOCKS SLIDE", 3, INK, { bold: true });
  drawText(MX + 16, y0 + 52, "INTO CORRECTION", 3, INK, { bold: true });
  const groups: Array<[string, string, number]> = [
    ["S&P 500", "-3.7%", 84],
    ["NASDAQ", "-5.3%", 120],
    ["NIKKEI", "-5.1%", 116],
  ];
  groups.forEach(([name, val, barW], i) => {
    const gx = 330 + i * 226;
    drawText(gx + 18, y0 + 6, name, 2, BODY, { bold: true });
    // down triangle
    fillPoly(
      [
        [gx, y0 + 32],
        [gx + 12, y0 + 32],
        [gx + 6, y0 + 42],
      ],
      RED,
    );
    drawText(gx + 18, y0 + 22, val, 5, RED, { bold: true });
    fillRect(gx + 18, y0 + 59, barW, 6, RED);
  });
  drawText(348, y0 + 68, "AI SELL-OFF SPREADS", 1, GREY);
}

// One region panel: coloured header, then headline + one-line items.
interface Item {
  h: string;
  s: string;
}

function drawRegion(
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
  title: string,
  items: Item[],
): void {
  fillRect(x, y, w, h, tint(color, 0.9));
  frame(x, y, w, h, INK, 1);
  fillRect(x, y, w, 30, color);
  drawText(x + 10, y + 8, title, 2, WHITE, { bold: true });
  drawTextRight(x + w - 10, y + 8, `${items.length} STORIES`, 2, WHITE);
  let yy = y + 40;
  for (const it of items) {
    const headLines = wrap(it.h, w - 20, 2);
    for (const ln of headLines) {
      drawText(x + 10, yy, ln, 2, INK, { bold: true });
      yy += 16;
    }
    yy += 2;
    const sumLines = wrap(it.s, w - 20, 1);
    for (const ln of sumLines) {
      drawText(x + 10, yy, ln, 1, BODY);
      yy += 10;
    }
    yy += 7;
  }
}

function drawRegions(): void {
  const colW = 312;
  const colX = [MX, MX + 328, MX + 656];
  const rowH = 274;
  const row1 = 388;
  const row2 = 672;

  drawRegion(colX[0], row1, colW, rowH, EUROPE, "EUROPE", [
    { h: "MISSILE KILLS TWO, WOUNDS 60", s: "Russian strike on Zelenskyy's hometown" },
    { h: "BOY, 7, PULLED ALIVE FROM RUBBLE", s: "Dymer apartment strike: 11 dead, 14 missing" },
    { h: "RUSSIAN SHIP BURNS", s: "Cargo vessel hit by drone in Gulf of Finland" },
    { h: "FRANCE MARCHES AGAIN", s: "150,000 march again over cost of living" },
    { h: "BELGIUM STRIKE GROUNDS FLIGHTS", s: "Air traffic walkout cancels flights nationwide" },
  ]);
  drawRegion(colX[1], row1, colW, rowH, MIDEAST, "MIDDLE EAST", [
    { h: "IRAN STRIKES BAHRAIN SITE", s: "Projectiles hit industrial site, injuring two" },
    { h: "AID TRUCK STRUCK IN GAZA", s: "Strike kills three; witnesses say truck carried aid" },
    { h: "SETTLERS TORCH 12 VEHICLES", s: "West Bank attacks; Israel opens an inquiry" },
    { h: "QATAR IN TEHRAN TALKS", s: "Doha mediates in push to end the war" },
    { h: "ISRAEL COALITION TALKS", s: "Eisenkot and Netanyahu in government talks" },
  ]);
  drawRegion(colX[2], row1, colW, rowH, ASIA, "ASIA-PACIFIC", [
    { h: "FACTORY FIRE KILLS THREE", s: "Cikande candy plant, Indonesia; 36 missing" },
    { h: "KOREA MINISTER QUITS", s: "Education chief resigns over exam cheating chaos" },
    { h: "THAI COURT UPHOLDS CONVICTION", s: "Royal defamation term cut to three years" },
    { h: "EU-INDONESIA TRADE DEAL", s: "Brussels and Jakarta sign after years of talks" },
    { h: "KOREA EXPORTS DOUBLE", s: "Shipments surge in November's first 20 days" },
    { h: "BUS AND TANKER COLLIDE", s: "Pakistan: 10 killed on Makran coastal highway" },
  ]);
  drawRegion(colX[0], row2, colW, rowH, AMERICAS, "AMERICAS", [
    { h: "CARTEL BOSS CAPTURED", s: "Sinaloa raid seizes 'El Chapo Isidro'; 11 dead" },
    { h: "ICE SEIZES TWO ON JET BRIDGE", s: "Father and daughter held at Seattle airport" },
    { h: "TRUMP ORDER ON CONGRESS", s: "Contractors must flag inquiries to White House" },
    { h: "DEMOCRATS SEAL HOUSE MAJORITY", s: "Biggest since 1992 as North Carolina flips" },
    { h: "BRAZIL STORM KILLS THREE", s: "162 injured as storms batter the south" },
  ]);
  drawRegion(colX[1], row2, colW, rowH, AFRICA, "AFRICA", [
    { h: "FUNERAL BOAT CAPSIZES", s: "Nigeria: boat to a funeral overturns in Bayelsa, 24 dead" },
    { h: "DRONES HIT UN BUILDING", s: "Khartoum: four killed, UN building hit" },
    { h: "UKRAINE DRONES HIT WARSHIP", s: "Russian ship struck at Libya's Benghazi base" },
    { h: "EBOLA AID BLOCKED BY FIGHTING", s: "DRC: insecurity stalls response, aid group warns" },
    { h: "OIL PIPELINE LOSSES", s: "Libya counts $30.8m in pipeline losses" },
  ]);
  drawRegion(colX[2], row2, colW, rowH, SPORTSCI, "SPORT & SCIENCE", [
    { h: "LIVERPOOL ROUT MAN UNITED 4-0", s: "Nightmare first game for Pochettino" },
    { h: "VERSTAPPEN WINS IN LAS VEGAS", s: "Grand Prix victory under the lights" },
    { h: "ALCARAZ TAKES ATP FINALS", s: "Spaniard beats Zverev for the Turin title" },
    { h: "PROBE REACHES MERCURY ORBIT", s: "BepiColombo arrives; ESA reports a glitch" },
    { h: "EARTH GAINS A MINI-MOON", s: "NASA: tiny asteroid caught in orbit" },
  ]);
}

function drawInBrief(): void {
  const y0 = 954;
  fillRect(MX, y0, CW, 40, INK);
  drawText(MX + 12, y0 + 13, "IN BRIEF", 2, WHITE, { bold: true });
  const items: Array<[number, string]> = [
    [150, "Obituary: Paolo Bulgari dies at 89"],
    [420, "Miley Cyrus marries Maxx Morando"],
    [680, "GTA 6 launch sets $3.79bn record"],
  ];
  for (const [ix, text] of items) {
    fillRect(MX + ix, y0 + 16, 7, 7, RED);
    drawText(MX + ix + 13, y0 + 16, text, 1, WHITE);
  }
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
  ihdr[9] = 6; // colour type RGBA
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
  frame(10, 10, W - 20, H - 20, INK, 3);
  frame(17, 17, W - 34, H - 34, INK, 1);
  drawMasthead();
  drawLead();
  drawMarkets();
  drawRegions();
  drawInBrief();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePng());
}

main();
