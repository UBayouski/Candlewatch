// Seeded noise for the noise voices (sound-and-title design 3.2, D2). Pure: a local mulberry32, no Math.random, no imports.

/**
 * `count` samples in [-1, 1) from a seeded generator (mulberry32). Pure: the same (seed, count) gives the same array, and the first n
 * samples of a longer array equal the n-sample array. `count` is floored; a negative, NaN or infinite count gives an empty array.
 * `seed` is read as an unsigned 32-bit integer.
 */
export function noiseSamples(seed: number, count: number): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const n = Math.floor(count);
  const out = new Array<number>(n);
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return out;
}
