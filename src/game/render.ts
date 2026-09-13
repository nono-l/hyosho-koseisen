import { CARD_MAP } from "./data";
import { Battle, COLS, ROWS, PLAYER_MAX_X, type Ent, type Proj } from "./engine";

export const TILE_W = 76;
export const TILE_H = 38;

export function iso(gx: number, gy: number) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToWorld(sx: number, sy: number, ox: number, oy: number, scale: number) {
  const x = (sx - ox) / scale;
  const y = (sy - oy) / scale;
  const gx = x / TILE_W + y / TILE_H;
  const gy = y / TILE_H - x / TILE_W;
  return { x: gx, y: gy };
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function layoutCanvas(canvas: HTMLCanvasElement, battle: Battle) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bounds = iso(COLS, ROWS);
  const min = iso(0, ROWS);
  const max = iso(COLS, 0);
  const worldW = max.x - min.x + 88;
  const worldH = bounds.y + 150;
  const hudTop = 90;
  const hudBot = 90;
  const usableH = Math.max(120, h - hudTop - hudBot);
  const scale = Math.min((w - 10) / worldW, usableH / worldH);
  const ox = w / 2 - iso(COLS / 2, ROWS / 2).x * scale;
  const oy = hudTop + usableH / 2 - iso(COLS / 2, ROWS / 2).y * scale;
  const shx = (Math.random() - 0.5) * battle.shake * 10;
  const shy = (Math.random() - 0.5) * battle.shake * 8;
  return { ctx, w, h, scale, ox: ox + shx, oy: oy + shy };
}

export function renderBattle(canvas: HTMLCanvasElement, battle: Battle) {
  const L = layoutCanvas(canvas, battle);
  if (!L) return;
  const { ctx, w, h, scale, ox, oy } = L;
  ctx.clearRect(0, 0, w, h);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#24364c");
  sky.addColorStop(0.22, "#3d5c74");
  sky.addColorStop(0.5, "#6e93aa");
  sky.addColorStop(0.78, "#b7cddc");
  sky.addColorStop(1, "#d7e6ee");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  drawGround(ctx, battle);
  const drawables: { z: number; draw: () => void }[] = [];
  for (const d of DECOR) {
    const s = iso(d.x, d.y);
    drawables.push({ z: s.y + d.z, draw: () => drawDecorItem(ctx, d) });
  }
  for (const z of battle.zones) {
    const s = iso(z.x, z.y);
    drawables.push({ z: s.y - 40, draw: () => drawZone(ctx, z) });
  }
  for (const e of battle.ents) {
    const p = iso(e.x, e.y);
    const bias = e.kind === "castle" ? 28 : e.kind === "spawner" ? 14 : 0;
    drawables.push({ z: p.y + bias, draw: () => drawEnt(ctx, e) });
  }
  for (const p of battle.projs) {
    const s = iso(p.x, p.y);
    drawables.push({ z: s.y + 24, draw: () => drawProj(ctx, p) });
  }
  drawables.sort((a, b) => a.z - b.z);
  for (const d of drawables) d.draw();

  for (const p of battle.parts) drawPart(ctx, p);
  if (battle.selected && battle.hover) drawGhost(ctx, battle);

  ctx.restore();
  drawSnow(ctx, w, h, battle.elapsed);
}

function drawGround(ctx: CanvasRenderingContext2D, battle: Battle) {
  for (let r = -3; r < ROWS + 3; r++) {
    for (let c = -3; c < COLS + 3; c++) {
      const p = iso(c, r);
      const onBoard = c >= 0 && c < COLS && r >= 0 && r < ROWS;
      const river = onBoard && Math.abs(c - 7.85) < 1.12;
      const n = ((c * 13 + r * 7) % 5) * 0.012;
      diamond(ctx, p.x, p.y, TILE_W + 1.4, TILE_H + 0.8);
      if (!onBoard) ctx.fillStyle = n > 0.03 ? "#7e96a8" : "#6e8698";
      else if (river) ctx.fillStyle = n > 0.025 ? "#7ec6dc" : "#5aadc8";
      else ctx.fillStyle = (c + r + (n > 0.03 ? 1 : 0)) % 2 === 0 ? "#e8f1f6" : "#d2e0ea";
      ctx.fill();
      if (river) {
        ctx.strokeStyle = "rgba(230,248,255,0.45)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y);
        ctx.lineTo(p.x + 6, p.y - 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y + 6);
        ctx.lineTo(p.x + 12, p.y - 2);
        ctx.stroke();
      }
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 22; i++) {
    const p = iso(0.8 + (i % 9) * 1.7, 0.5 + Math.floor(i / 9) * 3.1);
    ctx.fillStyle = i % 2 ? "#ffffff" : "#cfe3ee";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const a = iso(0.08, 0.08);
  const b = iso(PLAYER_MAX_X + 0.1, 0.08);
  const c = iso(PLAYER_MAX_X + 0.1, ROWS - 0.12);
  const d = iso(0.08, ROWS - 0.12);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(160, 210, 240, 0.08)";
  ctx.fill();
  if (battle.selected && CARD_MAP[battle.selected]?.kind === "building") {
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col <= Math.ceil(PLAYER_MAX_X); col++) {
        const p = iso(col, r);
        diamond(ctx, p.x, p.y, TILE_W - 4, TILE_H - 2);
        ctx.stroke();
      }
    }
  }
}

type Decor = {
  x: number;
  y: number;
  kind: "pine" | "shard" | "wall" | "rock" | "swall" | "hut";
  s: number;
  z: number;
};

const DECOR: Decor[] = [
  ...([
    [0.15, -0.95],
    [1.7, -1.15],
    [3.5, -1.2],
    [5.4, -1.05],
    [7.2, -1.15],
    [9.2, -1.1],
    [11.2, -0.95],
    [13.3, -0.7],
    [15.2, -0.4],
    [16.5, 0.6],
    [16.7, 2.2],
    [16.75, 4.0],
    [16.65, 5.8],
    [16.5, 7.6],
    [16.2, 9.3],
    [14.4, 10.65],
    [12.2, 10.8],
    [10.0, 10.75],
    [7.8, 10.7],
    [5.6, 10.6],
    [3.4, 10.5],
    [1.4, 10.35],
    [-0.7, 9.0],
    [-1.05, 7.2],
    [-1.15, 5.2],
    [-1.05, 3.2],
    [-0.8, 1.4],
    [2.2, -0.35],
    [14.8, 10.15],
  ] as [number, number][]).map(([x, y], i) => ({
    x,
    y,
    kind: "pine" as const,
    s: 0.92 + (i % 5) * 0.1,
    z: 0,
  })),
  ...([
    [1.0, -0.4, 1.15],
    [4.8, -0.45, 0.9],
    [11.6, -0.35, 1.2],
    [15.8, 0.7, 1.05],
    [16.0, 9.0, 1.2],
    [8.6, 10.2, 0.95],
    [0.3, 9.85, 0.85],
    [-0.45, 3.6, 1],
  ] as [number, number, number][]).map(([x, y, s]) => ({ x, y, kind: "shard" as const, s, z: -8 })),
  ...([
    [8.35, 1.6],
    [8.5, 2.8],
    [8.4, 4.0],
    [8.55, 5.2],
    [8.45, 6.4],
    [8.55, 7.6],
    [8.4, 8.7],
    [9.6, 2.2],
    [9.8, 4.4],
    [9.7, 6.6],
    [11.0, 3.4],
    [11.2, 5.6],
    [12.4, 4.4],
  ] as [number, number][]).map(([x, y]) => ({ x, y, kind: "wall" as const, s: 1, z: -4 })),
  ...([
    [1.55, 3.15],
    [1.75, 3.95],
    [1.85, 4.8],
    [1.75, 5.65],
    [1.55, 6.5],
    [0.75, 3.05],
    [0.75, 6.7],
    [2.45, 3.55],
    [2.5, 6.05],
    [0.35, 3.55],
    [0.35, 6.15],
  ] as [number, number][]).map(([x, y]) => ({ x, y, kind: "swall" as const, s: 1, z: -3 })),
  ...([
    [2.35, 1.25, 0.95],
    [3.55, 8.55, 1.05],
    [1.45, 8.15, 0.9],
    [3.1, 1.85, 0.85],
  ] as [number, number, number][]).map(([x, y, s]) => ({ x, y, kind: "hut" as const, s, z: 2 })),
  ...([
    [3.6, 9.7, 0.8],
    [14.2, 9.5, 1],
    [15.2, 2.2, 0.7],
    [0.9, 1.1, 0.7],
  ] as [number, number, number][]).map(([x, y, s]) => ({ x, y, kind: "rock" as const, s, z: -6 })),
];

function drawDecorItem(ctx: CanvasRenderingContext2D, d: Decor) {
  const p = iso(d.x, d.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(d.s, d.s);
  if (d.kind === "pine") drawPine(ctx);
  else if (d.kind === "shard") drawShard(ctx);
  else if (d.kind === "wall") drawIceWall(ctx);
  else if (d.kind === "swall") drawStoneWall(ctx);
  else if (d.kind === "hut") drawHut(ctx);
  else drawRock(ctx);
  ctx.restore();
}

function drawPine(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(30,50,60,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 8, 16, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2410";
  ctx.fillRect(-3.2, -4, 6.4, 14);
  const layers = [
    { y: -6, w: 20, h: 18, c: "#163a22" },
    { y: -18, w: 16, h: 16, c: "#1f4e2c" },
    { y: -28, w: 12, h: 14, c: "#2a6a38" },
    { y: -38, w: 8, h: 12, c: "#3a8448" },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.c;
    ctx.beginPath();
    ctx.moveTo(0, L.y - L.h);
    ctx.lineTo(L.w, L.y + 5);
    ctx.lineTo(-L.w, L.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.moveTo(0, L.y - L.h);
    ctx.lineTo(L.w * 0.42, L.y - L.h * 0.2);
    ctx.lineTo(-L.w * 0.18, L.y - L.h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawShard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(40,60,80,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 8, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b7d4e2";
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(12, 6);
  ctx.lineTo(-10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#eef8ff";
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(4.5, 2);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
}

function drawIceWall(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 6, 18, 8, 12, "#d8eef8", "#8aadc0", "#5a7a8c");
  ctx.fillStyle = "#e8f6ff";
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(-4, -20);
  ctx.lineTo(2, -8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4, -6);
  ctx.lineTo(10, -18);
  ctx.lineTo(14, -6);
  ctx.closePath();
  ctx.fill();
}

function drawStoneWall(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 6, 15, 8, 14, "#d8c48a", "#a08040", "#6a5020");
  ctx.strokeStyle = "#5a4010";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.lineTo(8, -12);
  ctx.stroke();
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(-3, -16, 6, 4);
}

function drawHut(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 8, 14, 8, 10, "#c4a060", "#8a6a3a", "#5a4010");
  roof(ctx, 0, -2, 16, 18, "#8a3a22", "#5a2010");
  ctx.fillStyle = "#2a1a08";
  ctx.fillRect(-3, -2, 5, 8);
}

function drawRock(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(30,40,50,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 6, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 0, 4, 12, 6, 8, "#9aa8b4", "#6a7884", "#4a5864");
}

function drawEnt(ctx: CanvasRenderingContext2D, e: Ent) {
  const p = iso(e.x, e.y);
  const bob =
    e.state === "walk" ? Math.sin(e.age * 11) * 2.4 : e.state === "attack" ? Math.sin(e.age * 20) * 3.2 : 0;
  const fade = e.state === "die" ? Math.max(0, e.dieT / 0.45) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(p.x, p.y - bob);

  ctx.fillStyle = "rgba(20,40,60,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 12, 16 * (e.radius / 0.32) + 2, 7 + e.radius * 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (e.kind === "castle") drawCastle(ctx, e);
  else if (e.kind === "spawner") drawIceStatue(ctx, e);
  else if (e.defId === "ice-golem" || e.defId === "boss") drawIceGolem(ctx, e);
  else if (e.kind === "building") drawBuilding(ctx, e);
  else drawUnit(ctx, e);

  if (e.hp < e.maxHp && e.state !== "die" && e.kind !== "castle") {
    const bw = 28 + e.radius * 16;
    const by = -58 - e.radius * 24;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, -bw / 2, by, bw, 5, 2);
    ctx.fill();
    ctx.fillStyle = e.team === "player" ? "#4ad05a" : "#e24a2a";
    roundRect(ctx, -bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 5, 2);
    ctx.fill();
  }
  if (e.stun > 0) {
    ctx.fillStyle = "#e8fbff";
    ctx.font = "bold 10px 'Zen Maru Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("氷結", 0, -66 - e.radius * 16);
  }
  ctx.restore();
}

function isoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
  depth: number,
  top: string,
  left: string,
  right: string,
) {
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + hw, y - hh);
  ctx.lineTo(x + hw, y - hh - depth);
  ctx.lineTo(x, y - depth);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - hw, y - hh);
  ctx.lineTo(x - hw, y - hh - depth);
  ctx.lineTo(x, y - depth);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x, y - depth);
  ctx.lineTo(x + hw, y - hh - depth);
  ctx.lineTo(x, y - hh * 2 - depth);
  ctx.lineTo(x - hw, y - hh - depth);
  ctx.closePath();
  ctx.fill();
}

function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, hi: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.8);
  ctx.lineTo(x + s * 0.7, y - s * 0.4);
  ctx.lineTo(x, y + s * 0.2);
  ctx.lineTo(x - s * 0.7, y - s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.8);
  ctx.lineTo(x + s * 0.28, y - s * 0.5);
  ctx.lineTo(x, y - s * 0.2);
  ctx.closePath();
  ctx.fill();
}

function roof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  shadow: string,
) {
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x - w, y);
  ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w * 0.34, y - h * 0.42);
  ctx.lineTo(x - w * 0.18, y - h * 0.38);
  ctx.closePath();
  ctx.fill();
}

function drawCastle(ctx: CanvasRenderingContext2D, e: Ent) {
  const enemy = e.team === "enemy";
  ctx.save();
  if (enemy) {
    ctx.scale(1.72, 1.72);
    ctx.fillStyle = "rgba(200,40,30,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 22, 58, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    isoBox(ctx, 0, 20, 50, 25, 14, "#c8dce8", "#6a8898", "#334854");
    isoBox(ctx, -30, 8, 13, 8, 30, "#d8eef8", "#8aadc0", "#4a6a7c");
    isoBox(ctx, 30, 10, 13, 8, 32, "#d8eef8", "#8aadc0", "#4a6a7c");
    isoBox(ctx, -16, 4, 11, 7, 24, "#c5dce8", "#7a9aab", "#4a6a7c");
    isoBox(ctx, 16, 6, 11, 7, 26, "#c5dce8", "#7a9aab", "#4a6a7c");
    isoBox(ctx, 0, 8, 24, 14, 34, "#e8f6ff", "#9ab8c8", "#5a7a8c");
    for (const ox of [-18, -6, 6, 18]) isoBox(ctx, ox, -24, 4.5, 3, 7, "#eef8ff", "#a8c8d8", "#6a8aa0");
    crystal(ctx, -26, -26, 15, "#c02820", "#ffb090");
    crystal(ctx, 26, -30, 17, "#e24a2a", "#ffd0a8");
    crystal(ctx, 0, -44, 26, "#ff5a3a", "#ffe0c0");
    crystal(ctx, 12, -22, 11, "#a01810", "#ff8866");
    crystal(ctx, -10, -20, 9, "#7ec8e3", "#fff");
    crystal(ctx, 8, -16, 7, "#9ee7ff", "#fff");
  } else {
    ctx.scale(1.28, 1.28);
    ctx.fillStyle = "rgba(80,140,180,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 50, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    isoBox(ctx, 0, 18, 38, 19, 10, "#c8c0b0", "#8a8070", "#5a5040");
    isoBox(ctx, -24, 8, 11, 7, 8, "#b8b0a0", "#7a7060", "#4a4030");
    isoBox(ctx, 24, 8, 11, 7, 8, "#b8b0a0", "#7a7060", "#4a4030");
    isoBox(ctx, -22, 4, 10, 6, 24, "#c4bcac", "#8a8070", "#5a5040");
    isoBox(ctx, 22, 4, 10, 6, 24, "#c4bcac", "#8a8070", "#5a5040");
    roof(ctx, -22, -22, 13, 18, "#c03828", "#8a1810");
    roof(ctx, 22, -22, 13, 18, "#c03828", "#8a1810");
    isoBox(ctx, 0, 8, 20, 13, 28, "#d4ccc0", "#9a9080", "#5a5040");
    ctx.fillStyle = "#3a2808";
    ctx.beginPath();
    ctx.ellipse(0, 6, 6.5, 9, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(2.2, 3, 1.5, 0, Math.PI * 2);
    ctx.fill();
    roof(ctx, 0, -22, 22, 24, "#e04830", "#a02018");
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(0, -60);
    ctx.stroke();
    ctx.fillStyle = "#2a7aa8";
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(16, -55);
    ctx.lineTo(0, -50);
    ctx.closePath();
    ctx.fill();
    crystal(ctx, -16, -6, 8, "#7ec8e3", "#e8fbff");
    crystal(ctx, 16, -6, 8, "#7ec8e3", "#e8fbff");
  }
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, e: Ent) {
  const id = e.defId;
  if (id === "ice-urn") drawUrn(ctx);
  else if (id === "ice-tower" || id === "ice-crystal" || e.special === "freeze")
    drawStoneTower(ctx, "#6ec4e8", "#d8f6ff", true);
  else if (id === "plant-tower") drawPlantTower(ctx);
  else if (id === "magma-tower" || e.special === "burn") drawStoneTower(ctx, "#e24a2a", "#ff8844", false);
  else if (id === "storehouse") drawCrate(ctx);
  else if (id === "watchtower") drawStoneTower(ctx, "#c4a060", "#e8d090", false);
  else if (id === "catapult" || id === "ballista") drawSiege(ctx, id === "ballista");
  else drawStoneTower(ctx, e.color, shade(e.color, 1.3), false);
}

function drawStoneTower(ctx: CanvasRenderingContext2D, cap: string, hi: string, icy: boolean) {
  const t = icy ? "#b8c8d4" : "#8a8074";
  const l = icy ? "#8a9aa6" : "#58534c";
  const r = icy ? "#5a6a76" : "#3a3530";
  isoBox(ctx, 0, 12, 18, 9, 8, "#c8c0b0", "#8a8070", "#5a5040");
  isoBox(ctx, 0, 4, 15, 8, 16, t, l, r);
  isoBox(ctx, 0, -10, 12, 6, 18, shade(t, 1.08), l, r);
  ctx.fillStyle = "#2a2218";
  for (const ox of [-6, 6]) {
    ctx.beginPath();
    ctx.ellipse(ox, -6, 3, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (icy) {
    crystal(ctx, -8, -30, 8, cap, hi);
    crystal(ctx, 8, -28, 7, cap, hi);
    crystal(ctx, 0, -38, 12, cap, hi);
  } else {
    roof(ctx, 0, -26, 14, 16, "#c03828", "#8a1810");
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, -30, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(-2, -32, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlantTower(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 12, 17, 8, 10, "#8a9a7a", "#5a6a4a", "#3a4a2a");
  isoBox(ctx, 0, 2, 13, 7, 16, "#9aaa88", "#6a7a58", "#4a5a38");
  ctx.fillStyle = "#2e7a38";
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.quadraticCurveTo(18, -28, 6, -14);
  ctx.quadraticCurveTo(0, -22, 0, -14);
  ctx.quadraticCurveTo(0, -22, -6, -14);
  ctx.quadraticCurveTo(-18, -28, 0, -44);
  ctx.fill();
  ctx.fillStyle = "#7ad050";
  ctx.beginPath();
  ctx.ellipse(7, -32, 7, 3.4, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c02820";
  ctx.beginPath();
  ctx.arc(0, -36, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawUrn(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 10, 14, 7, 6, "#c5dce8", "#8aadc0", "#5a7a8c");
  ctx.fillStyle = "#9fd4ea";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8f4ff";
  ctx.beginPath();
  ctx.ellipse(0, -12, 11, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4aa0c0";
  ctx.beginPath();
  ctx.ellipse(0, -24, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  crystal(ctx, 0, -26, 9, "#9ee7ff", "#fff");
}

function drawCrate(ctx: CanvasRenderingContext2D) {
  isoBox(ctx, 0, 8, 18, 10, 16, "#d4b06a", "#a07a38", "#6a4a20");
  ctx.strokeStyle = "#5a3a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(10, -14);
  ctx.stroke();
}

function drawSiege(ctx: CanvasRenderingContext2D, ballista: boolean) {
  isoBox(ctx, 0, 10, 18, 9, 8, "#c4a060", "#8a6a3a", "#5a4010");
  ctx.strokeStyle = "#3a2808";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-14, -8);
  ctx.lineTo(16, -20);
  ctx.stroke();
  if (ballista) {
    ctx.fillStyle = "#2a1a08";
    ctx.fillRect(-3, -24, 5, 18);
    ctx.fillStyle = "#c4a060";
    ctx.fillRect(-12, -22, 24, 4);
  } else {
    ctx.fillStyle = "#6a6a6a";
    ctx.beginPath();
    ctx.arc(10, -16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a8a8a";
    ctx.beginPath();
    ctx.arc(10, -16, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIceStatue(ctx: CanvasRenderingContext2D, e: Ent) {
  const variant = Math.abs(((e.x * 13 + e.y * 7) | 0) % 3);
  ctx.save();
  ctx.scale(1.78, 1.78);

  ctx.fillStyle = "rgba(170, 215, 240, 0.5)";
  ctx.beginPath();
  ctx.ellipse(0, 16, 26, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  isoBox(ctx, 0, 14, 18, 9, 8, "#e8f4fa", "#a8c4d4", "#6a8898");
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.ellipse(0, 6, 15, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  isoBox(ctx, -6, 8, 5.5, 4, 14, "#d4ecf6", "#8aadc0", "#5a7a8c");
  isoBox(ctx, 7, 8, 5.5, 4, 14, "#c8e2ee", "#7a9cb0", "#4a6a7c");
  isoBox(ctx, 0, 0, 12, 7, 8, "#d8eef8", "#8eb4c6", "#4e7386");
  isoBox(ctx, 0, -6, 13, 8, 18, "#e4f4fc", "#96b8c8", "#567888");
  crystal(ctx, 0, -10, 6, "#9ee7ff", "#fff");

  if (variant !== 1) {
    ctx.save();
    ctx.translate(-17, -8);
    ctx.rotate(-0.22);
    ctx.fillStyle = "#b5d8ea";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, -6);
    ctx.lineTo(11, 16);
    ctx.lineTo(0, 20);
    ctx.lineTo(-11, 16);
    ctx.lineTo(-13, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8fbff";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(6, -4);
    ctx.lineTo(0, 12);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    crystal(ctx, 0, -2, 5.5, "#7ec8e3", "#fff");
    ctx.restore();
  }

  isoBox(ctx, 12, -2, 4, 3, 10, "#d0e8f4", "#8aadc0", "#5a7a8c");
  ctx.strokeStyle = "#d8f0fa";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (variant === 1) {
    ctx.moveTo(10, -8);
    ctx.lineTo(22, -30);
    ctx.stroke();
    crystal(ctx, 22, -32, 8, "#c5f0ff", "#fff");
  } else {
    ctx.moveTo(14, -6);
    ctx.lineTo(18, -38);
    ctx.stroke();
    ctx.fillStyle = "#c5eef8";
    ctx.beginPath();
    ctx.moveTo(18, -44);
    ctx.lineTo(25, -30);
    ctx.lineTo(11, -30);
    ctx.closePath();
    ctx.fill();
  }

  crystal(ctx, -11, -24, 7, "#b8eeff", "#fff");
  crystal(ctx, 11, -22, 6, "#9ee7ff", "#e8fbff");

  isoBox(ctx, 0, -22, 8, 6, 12, "#eef8ff", "#a8c8d8", "#6a8aa0");
  ctx.fillStyle = "#152838";
  ctx.beginPath();
  ctx.ellipse(-3.1, -31, 2.3, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(3.5, -31, 2.3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(126, 220, 255, 0.75)";
  ctx.fillRect(-6.5, -33, 13, 3.2);
  crystal(ctx, 0, -38, 8.5, "#c5f0ff", "#fff");

  ctx.restore();
}

function drawIceGolem(ctx: CanvasRenderingContext2D, e: Ent) {
  const s = e.defId === "boss" ? 1.45 : 1.22;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "#7ec8e3";
  ctx.beginPath();
  ctx.ellipse(0, 6, 16, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, -6, 6, 5, 4, 10, "#c5eef8", "#8aadc0", "#5a7a8c");
  isoBox(ctx, 7, 6, 5, 4, 10, "#b8e6f4", "#7a9cb0", "#4a6a7c");
  ctx.fillStyle = "#c5eef8";
  ctx.beginPath();
  ctx.ellipse(0, -10, 15, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8fbff";
  ctx.beginPath();
  ctx.ellipse(-3, -14, 6, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a4a5a";
  ctx.beginPath();
  ctx.ellipse(-4, -12, 2.2, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(5, -12, 2.2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  crystal(ctx, 0, -26, 9, "#9ee7ff", "#fff");
  crystal(ctx, -12, -8, 6, "#7ec8e3", "#e8fbff");
  crystal(ctx, 12, -6, 6, "#7ec8e3", "#e8fbff");
  if (e.defId === "boss") {
    ctx.fillStyle = "#c9e8ff";
    ctx.beginPath();
    ctx.arc(0, -36, 8, 0, Math.PI * 2);
    ctx.fill();
    crystal(ctx, 0, -42, 12, "#ff6a4a", "#ffe0c0");
  }
  ctx.restore();
}

function drawUnit(ctx: CanvasRenderingContext2D, e: Ent) {
  if (e.defId === "ice-creep") {
    ctx.fillStyle = "#9fd4ea";
    ctx.beginPath();
    ctx.ellipse(0, 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c5eef8";
    ctx.beginPath();
    ctx.ellipse(0, -6, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8fbff";
    ctx.beginPath();
    ctx.arc(0, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a3040";
    ctx.beginPath();
    ctx.arc(-2.4, -18, 1.5, 0, Math.PI * 2);
    ctx.arc(2.4, -18, 1.5, 0, Math.PI * 2);
    ctx.fill();
    crystal(ctx, 0, -24, 5, "#9ee7ff", "#fff");
    return;
  }
  const flying = e.flying ? -12 : 0;
  ctx.save();
  ctx.translate(0, flying);
  ctx.scale(e.facing, 1);
  const body = e.color;
  ctx.fillStyle = shade(body, 0.55);
  ctx.beginPath();
  ctx.ellipse(-4, 6, 4, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(5, 6, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -6, 9, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(body, 1.2);
  ctx.beginPath();
  ctx.ellipse(0, -8, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0d4b4";
  ctx.beginPath();
  ctx.arc(0, -20, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a2030";
  ctx.beginPath();
  ctx.arc(2.6, -21, 1.7, 0, Math.PI * 2);
  ctx.fill();
  if (e.kind === "hero" || e.defId === "shadow" || e.defId === "blonde" || e.defId === "viking") {
    ctx.fillStyle = e.defId === "blonde" ? "#e8c04a" : shade(body, 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -26, 8, 5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2d07a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(8, -12);
    ctx.lineTo(16, -28);
    ctx.stroke();
    ctx.fillStyle = "#d0d6de";
    ctx.beginPath();
    ctx.moveTo(16, -28);
    ctx.lineTo(20, -20);
    ctx.lineTo(12, -22);
    ctx.closePath();
    ctx.fill();
  }
  if (e.defId === "dragon" || e.defId === "wing-rider") {
    ctx.fillStyle = "#ff6a2a";
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.quadraticCurveTo(-24, -22, -8, -2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -8);
    ctx.quadraticCurveTo(18, -18, 8, 0);
    ctx.fill();
  }
  if (e.defId === "fairy") {
    ctx.fillStyle = "rgba(180,255,200,0.75)";
    ctx.beginPath();
    ctx.ellipse(-11, -16, 7, 4.5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(8, -16, 7, 4.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.kind === "hero") {
    ctx.strokeStyle = "#f2d07a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -20, 8.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProj(ctx: CanvasRenderingContext2D, p: Proj) {
  const s = iso(p.x, p.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  if (p.kind === "rock") {
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "star") {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * (i % 2 === 0 ? 8 : 4), Math.sin(a) * (i % 2 === 0 ? 8 : 4));
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.kind === "ice") {
    crystal(ctx, 0, 4, 7, p.color, "#ffffff");
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, p.kind === "fire" ? 6 : 4.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  z: { x: number; y: number; r: number; life: number; max: number; kind: string },
) {
  const p = iso(z.x, z.y);
  const alpha = 0.16 + 0.2 * (z.life / z.max);
  ctx.save();
  ctx.globalAlpha = alpha;
  diamond(ctx, p.x, p.y, TILE_W * z.r * 1.7, TILE_H * z.r * 1.7);
  ctx.fillStyle = z.kind === "star" ? "#c46cff" : z.kind === "ice" ? "#9ee7ff" : "#ff6a2a";
  ctx.fill();
  ctx.restore();
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number; life: number; max: number; size: number; color: string; kind: string; text?: string },
) {
  const s = iso(p.x, p.y);
  const a = Math.max(0, p.life / p.max);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = p.color;
  if (p.kind === "num" && p.text) {
    ctx.font = "bold 12px 'Zen Maru Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(20,20,30,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, s.x, s.y);
    ctx.fillText(p.text, s.x, s.y);
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(1.2, p.size * 22 * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, battle: Battle) {
  if (!battle.hover || !battle.selected) return;
  const def = CARD_MAP[battle.selected];
  if (!def) return;
  const ok =
    def.kind === "spell"
      ? true
      : def.kind === "building"
        ? battle.canPlaceBuilding(battle.hover.x, battle.hover.y)
        : battle.canPlaceTroop(battle.hover.x, battle.hover.y);
  const snap =
    def.kind === "building"
      ? { x: Math.round(battle.hover.x), y: Math.round(battle.hover.y) }
      : battle.hover;
  const p = iso(snap.x, snap.y);
  ctx.save();
  ctx.globalAlpha = 0.5;
  diamond(ctx, p.x, p.y, TILE_W, TILE_H);
  ctx.fillStyle = ok ? "#5dcc4a" : "#e24a2a";
  ctx.fill();
  const r = def.kind === "spell" ? def.radius : def.range || 1.2;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, TILE_W * r * 0.72, TILE_H * r * 0.72, 0, 0, Math.PI * 2);
  ctx.strokeStyle = ok ? "#ffe08a" : "#e24a2a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.font = "bold 12px 'Zen Maru Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4f0e6";
  ctx.strokeStyle = "rgba(10,20,30,0.7)";
  ctx.lineWidth = 4;
  const lv = battle.levels[def.id] ?? 1;
  const label = `${def.name}  Lv.${lv}`;
  ctx.strokeText(label, p.x, p.y - 42);
  ctx.fillText(label, p.x, p.y - 42);
}

function drawSnow(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  for (let i = 0; i < 56; i++) {
    const x = ((i * 97 + t * (12 + (i % 5))) % (w + 40)) - 20;
    const y = ((i * 53 + t * (18 + (i % 7))) % (h + 40)) - 20;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3) * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function shade(hex: string, m: number) {
  const n = hex.replace("#", "");
  if (n.length < 6) return hex;
  const r = Math.min(255, Math.max(0, parseInt(n.slice(0, 2), 16) * m));
  const g = Math.min(255, Math.max(0, parseInt(n.slice(2, 4), 16) * m));
  const b = Math.min(255, Math.max(0, parseInt(n.slice(4, 6), 16) * m));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
