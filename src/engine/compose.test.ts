import { describe, it, expect } from 'vitest';
import { computeCornerScale, COMPOSE_SCALE_MIN, COMPOSE_SCALE_MAX } from './compose';

/**
 * The pinned (opposite) corner's canvas-x position is
 *   Cₓ = const + offsetX·scale + drawW·(fx − 0.5)
 * (const = margin + targetW/2 is unaffected by a scale drag). This helper
 * returns that varying part, so a corner-scale that keeps it constant has
 * genuinely pinned the opposite corner.
 */
function pinnedX(offsetX: number, drawW: number, scale: number, fx: number) {
  return offsetX * scale + drawW * (fx - 0.5);
}
function pinnedY(offsetY: number, drawH: number, scale: number, fy: number) {
  return offsetY * scale + drawH * (fy - 0.5);
}

describe('computeCornerScale', () => {
  const drawW = 200;
  const drawH = 120;
  const offsetX = 30;
  const offsetY = -10;
  const layerScale = 1;
  const scale = 0.5; // fit scale

  it('scales the layer by the drag ratio', () => {
    const r = computeCornerScale(drawW, drawH, offsetX, offsetY, layerScale, scale, 1, 1, 1.5);
    expect(r.scale).toBeCloseTo(1.5, 6);
  });

  it.each([
    ['pin BR (grab TL)', 1, 1],
    ['pin BL (grab TR)', 0, 1],
    ['pin TR (grab BL)', 1, 0],
    ['pin TL (grab BR)', 0, 0],
  ])('keeps the opposite corner fixed: %s', (_label, oppFx, oppFy) => {
    const ratio = 1.7;
    const r = computeCornerScale(drawW, drawH, offsetX, offsetY, layerScale, scale, oppFx, oppFy, ratio);
    const applied = r.scale / layerScale;

    expect(pinnedX(r.offsetX, drawW * applied, scale, oppFx)).toBeCloseTo(
      pinnedX(offsetX, drawW, scale, oppFx),
      4,
    );
    expect(pinnedY(r.offsetY, drawH * applied, scale, oppFy)).toBeCloseTo(
      pinnedY(offsetY, drawH, scale, oppFy),
      4,
    );
  });

  it('clamps scale to the slider range and still pins the corner', () => {
    const big = computeCornerScale(drawW, drawH, offsetX, offsetY, layerScale, scale, 0, 0, 999);
    expect(big.scale).toBe(COMPOSE_SCALE_MAX);
    // Pinned corner holds even at the clamp (uses the applied, clamped ratio).
    const applied = big.scale / layerScale;
    expect(pinnedX(big.offsetX, drawW * applied, scale, 0)).toBeCloseTo(
      pinnedX(offsetX, drawW, scale, 0),
      4,
    );

    const small = computeCornerScale(drawW, drawH, offsetX, offsetY, layerScale, scale, 0, 0, 0.001);
    expect(small.scale).toBe(COMPOSE_SCALE_MIN);
  });
});
