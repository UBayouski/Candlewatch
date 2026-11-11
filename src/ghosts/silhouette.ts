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
