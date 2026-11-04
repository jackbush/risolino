/** sRGB ⇄ linear light, for averaging colour the way a screen or the eye blends it. */

/** sRGB-encoded value (0–1) to linear light. */
export function decodeSrgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 8-bit sRGB to linear light, as a table. */
export const SRGB_TO_LINEAR = new Float32Array(256).map((_, i) => decodeSrgb(i / 255));

// Encoding samples a finer table than 8 bits so dark tones don't band.
const ENCODE_STEPS = 4096;
const LINEAR_TO_SRGB = new Uint8ClampedArray(ENCODE_STEPS + 1).map((_, i) => {
  const l = i / ENCODE_STEPS;
  return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
});

/** Linear light (0–1, clamped) to 8-bit sRGB. */
export function encodeSrgb(linear: number): number {
  return LINEAR_TO_SRGB[Math.round(Math.min(1, Math.max(0, linear)) * ENCODE_STEPS)];
}
