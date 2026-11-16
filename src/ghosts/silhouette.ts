// The ghost silhouette (ghosts-and-graveyard R9.3, decision L2). Pure: one path string in the 70 by 75 ghost box, centred on the origin.
import { GHOST_BOX } from "./slots";

/** A rounded head, straight sides and a wavy hem of four scallops. Every point lies inside the box [-35, 35] x [-37.5, 37.5]. */
export function silhouettePath(): string {
  const hw = GHOST_BOX.w / 2;
  const hh = GHOST_BOX.h / 2;
  const shoulder = -8;
  const crest = hh - 9.5;
  const step = GHOST_BOX.w / 4;
  const parts = [
    `M ${-hw} ${hh}`,
    `L ${-hw} ${shoulder}`,
    `C ${-hw} ${-28} ${-20} ${-hh} 0 ${-hh}`,
    `C 20 ${-hh} ${hw} -28 ${hw} ${shoulder}`,
    `L ${hw} ${hh}`,
  ];
  for (let i = 0; i < 4; i++) {
    const from = hw - i * step;
    parts.push(`Q ${from - step / 2} ${crest} ${from - step} ${hh}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

const GHOST_SHAPES = [
  // 0: the wisp trails down and to the right, a short flick hangs on the left
  "M -3 -37.5 C 10 -37.5 21 -28 21 -14 C 21 -2 18 8 24 18 C 29 26 35 30 35 37.5 C 26 33 14 36 7 27 C 0 20 -10 28 -17 19 C -23 12 -22 4 -22 -4 C -22 -10 -21 -14 -21 -16 C -21 -28 -12 -37.5 -3 -37.5 Z",
  // 1: ragged little hem on the right, the long wisp sweeps to the left and down
  "M 4 -37.5 C 16 -37.5 24 -28 24 -13 C 24 -2 23 8 20 16 L 16 22 L 13 17 L 9 26 L 4 20 C -4 26 -18 33 -35 37.5 C -27 28 -24 16 -22 4 C -20 -4 -19 -9 -19 -13 C -19 -28 -9 -37.5 4 -37.5 Z",
  // 2: a hooked tail curling to the right and one arm lifted on the left
  "M -6 -37.5 C 6 -37.5 16 -29 16 -16 C 16 -4 14 6 18 16 C 22 26 30 26 30 37.5 C 24 32 12 28 6 22 C -2 14 -8 12 -14 6 C -22 0 -35 -4 -35 -12 C -35 -15 -29 -15 -23 -13 C -20 -14 -20 -20 -19 -24 C -17 -32 -13 -37.5 -6 -37.5 Z",
 ] as const;
/** Where the eyes sit on each shape, relative to the body: identical on every ghost of a variant (R5.3). */
export const GHOST_EYES = [
  [[-8, -19], [5, -19]],
  [[-4, -19], [9, -19]],
  [[-11, -21], [2, -21]],
 ] as const;

export const GHOST_EYE_STYLE = { rx: 3.7, ry: 5.3, fill: "#0b1020" } as const;
export function ghostShape(variant: number): string { return GHOST_SHAPES[variant] ?? GHOST_SHAPES[0]; }
