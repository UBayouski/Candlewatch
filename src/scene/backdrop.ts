// The viewport's inverse meet transform, independent of the interface layer.
export const BACKDROP = { x0: -2200, x1: 2800, y0: -600, y1: 1600 };
export function backdropExtent(vw: number, vh: number): typeof BACKDROP {
  const scale = Math.min(vw / 600, vh / 1000);
  const ox = (vw - 600 * scale) / 2, oy = (vh - 1000 * scale) / 2;
  return { x0: -ox / scale, x1: 600 + ox / scale, y0: -oy / scale, y1: 1000 + oy / scale };
}
