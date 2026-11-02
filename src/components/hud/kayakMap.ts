"use client";

import {
  KAYAK_COURSE_LENGTH as L,
  KAYAK_HALF_WIDTH,
  KAYAK_LANE,
  bearingDeg,
  kayakObstacles,
  kayakSections,
} from "../../engine/kayakCourse";
import type { CoordState, DrawMap } from "./MapHud";

// Kayak Rush map and compass (WP10 U3). The minimap is the whole course as a vertical strip (finish on
// top): 20 m sections tinted by how busy they are (orange = focus and dodge, green = clear, paddle
// fast), logs / ice / barriers, me (arrow) and the opponent (dot). Same obstacles as the 3D scene.

export interface KayakLive {
  /** 0..1 of the course. */
  player: number;
  bot: number;
  /** HUD steering -1..1. */
  steer: number;
  botName: string;
}

const OBSTACLES = kayakObstacles();
const SECTIONS = kayakSections(OBSTACLES);
const X_SPAN = 9.5; // metres either side shown
const myX = (s: KayakLive) => -KAYAK_LANE + s.steer * 1.1;

export const drawKayakMap: DrawMap<KayakLive> = (ctx, w, h, s) => {
  const pad = 8;
  const sx = (x: number) => w / 2 + (x / X_SPAN) * (w / 2 - 4);
  const sy = (m: number) => h - pad - (m / L) * (h - pad * 2); // metres from the start → y
  // Banks, then the river between the buoy lines.
  ctx.fillStyle = "rgb(52 92 58 / 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgb(14 116 144 / 0.75)";
  ctx.fillRect(
    sx(-KAYAK_HALF_WIDTH - 1),
    0,
    sx(KAYAK_HALF_WIDTH + 1) - sx(-KAYAK_HALF_WIDTH - 1),
    h,
  );
  // Sections: busy = orange, clear = green.
  for (const sec of SECTIONS) {
    if (sec.level === "some") continue;
    ctx.fillStyle =
      sec.level === "busy" ? "rgb(249 115 22 / 0.42)" : "rgb(34 197 94 / 0.32)";
    ctx.fillRect(
      sx(-KAYAK_HALF_WIDTH),
      sy(sec.to),
      sx(KAYAK_HALF_WIDTH) - sx(-KAYAK_HALF_WIDTH),
      sy(sec.from) - sy(sec.to),
    );
  }
  // Buoy lines.
  ctx.strokeStyle = "rgb(255 255 255 / 0.55)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (const x of [-KAYAK_HALF_WIDTH, KAYAK_HALF_WIDTH]) {
    ctx.beginPath();
    ctx.moveTo(sx(x), sy(0));
    ctx.lineTo(sx(x), sy(L));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Finish line.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#111827" : "#f8fafc";
    const x0 =
      sx(-KAYAK_HALF_WIDTH) +
      ((sx(KAYAK_HALF_WIDTH) - sx(-KAYAK_HALF_WIDTH)) / 8) * i;
    ctx.fillRect(
      x0,
      sy(L) - 3,
      (sx(KAYAK_HALF_WIDTH) - sx(-KAYAK_HALF_WIDTH)) / 8,
      3,
    );
  }
  // Obstacles.
  for (const o of OBSTACLES) {
    const x = sx(o.x);
    const y = sy(-o.z);
    if (o.kind === "log") {
      ctx.fillStyle = "#b45309";
      ctx.fillRect(x - 7, y - 2, 14, 4);
    } else if (o.kind === "ice") {
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === "barrier") {
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x - 5, y - 1.5, 10, 3);
    }
  }
  // Opponent, then me on top.
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#0b1020";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx(KAYAK_LANE), sy(Math.min(1, s.bot) * L), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const mx = sx(myX(s));
  const my = sy(Math.min(1, s.player) * L);
  ctx.fillStyle = "#5eead4";
  ctx.beginPath();
  ctx.moveTo(mx, my - 6);
  ctx.lineTo(mx + 5, my + 4);
  ctx.lineTo(mx - 5, my + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/** Compass: facing follows the steering (the kayak turns a little), the opponent by its bearing. */
export function kayakCoord(s: KayakLive): CoordState {
  const x = myX(s);
  const z = -Math.min(1, s.player) * L;
  const bx = KAYAK_LANE;
  const bz = -Math.min(1, s.bot) * L;
  return {
    heading: (s.steer * 0.12 * 1.1 * 180) / Math.PI,
    x,
    z,
    marks: [
      {
        id: "bot",
        bearing: bearingDeg(x, z, bx, bz),
        color: "#f8fafc",
        label: s.botName,
        facing: 0,
      },
    ],
  };
}
