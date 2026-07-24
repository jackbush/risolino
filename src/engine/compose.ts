import { Layer, RisoConfig } from '../types';
import { computeLayerPlacement, prefilterForScale } from './compositor';

// Insides of each layer are drawn faintly so the coloured outlines read as the
// primary element. Multiply at low opacity darkens the paper just enough to
// show what's where without competing with the frames.
const INSIDES_OPACITY = 0.4;

// Outline stroke widths in canvas (backing-store) px — constant regardless of
// fit scale, so frames stay legible at any paper size.
const OUTLINE_WIDTH = 1.5;
const OUTLINE_WIDTH_SELECTED = 3;

// Small filled squares at the selected layer's corners, hinting they're grab
// handles for resizing. Side in canvas px.
const HANDLE_SIZE = 6;

// Per-layer scale is clamped to the Scale slider's range (10%–200%) so a
// corner-drag can't push a layer outside what the numeric control can express.
export const COMPOSE_SCALE_MIN = 0.1;
export const COMPOSE_SCALE_MAX = 2;

/**
 * Placement in compose mode is deterministic: registration jitter is switched
 * off (no random shift or rotation, so drag/scale maths stay axis-aligned and
 * exact). Per-layer offset/scale already always apply, so nothing else needs
 * overriding. Shared by the outline renderer and the PreviewPane hit-testing so
 * both agree on where a layer sits.
 */
export function composePlacementConfig(config: RisoConfig): RisoConfig {
  return { ...config, registrationJitterEnabled: false };
}

/**
 * Outline (compose) render: a light-table view of the layers. Paper
 * background, then each visible layer drawn as its artwork faintly multiplied
 * inside a stroked bounding rectangle in the layer's ink colour. The selected
 * layer gets a bolder stroke. Preview-only — never exported.
 */
export function compositeOutline(
  layers: Layer[],
  config: RisoConfig,
  targetW: number,
  targetH: number,
  fullW: number,
  selectedId: string | null,
): HTMLCanvasElement {
  const scale = targetW / fullW;
  const margin = Math.round((config.margin ?? 0) * scale);
  const placementConfig = composePlacementConfig(config);

  const canvas = document.createElement('canvas');
  canvas.width = targetW + 2 * margin;
  canvas.height = targetH + 2 * margin;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = config.paperColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    if (!layer.visible || !layer.grayscaleData) continue;

    const placement = computeLayerPlacement(
      layer,
      placementConfig,
      layer.grayscaleData.width,
      layer.grayscaleData.height,
      scale,
      targetW,
      targetH,
      margin,
    );
    const { drawX, drawY, drawW, drawH } = placement;

    // Faint greyscale insides (raw density, no halftone/tint) so the artwork is
    // recognisable while positioning.
    const effScale = drawW / layer.grayscaleData.width;
    const src = prefilterForScale(layer.grayscaleData, effScale);
    ctx.save();
    ctx.globalAlpha = INSIDES_OPACITY;
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Bounding-box outline in the ink colour; bolder for the selected layer,
    // which also gets corner handles as a resize affordance.
    const selected = layer.id === selectedId;
    ctx.save();
    ctx.strokeStyle = layer.inkColor.hex;
    ctx.lineWidth = selected ? OUTLINE_WIDTH_SELECTED : OUTLINE_WIDTH;
    ctx.strokeRect(drawX, drawY, drawW, drawH);
    if (selected) {
      ctx.fillStyle = layer.inkColor.hex;
      const h = HANDLE_SIZE;
      for (const [cx, cy] of [
        [drawX, drawY],
        [drawX + drawW, drawY],
        [drawX, drawY + drawH],
        [drawX + drawW, drawY + drawH],
      ]) {
        ctx.fillRect(cx - h / 2, cy - h / 2, h, h);
      }
    }
    ctx.restore();
  }

  return canvas;
}

export interface CornerScaleResult {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Proportional corner-scale with the opposite corner pinned.
 *
 * A layer's drawn box has left/right edges at
 *   Oₓ = margin + targetW/2 + offsetX·scale + drawW·(fx − 0.5)
 * (fx = 0 for the left edge, 1 for the right). Holding the opposite corner
 * (fx, fy) fixed while the box scales by `ratio` (drawW' = drawW·r) and solving
 * for the new offset gives:
 *   offsetX' = offsetX + drawW·(1 − r)·(fx − 0.5) / scale
 * and likewise for Y. The layer scale multiplies by the same ratio, clamped to
 * the Scale slider's range.
 *
 * @param drawW/drawH  current drawn box size, canvas px
 * @param offsetX/offsetY  current layer offset, full-res px
 * @param layerScale  current layer.scale
 * @param scale  fit (preview) scale — canvas px per full-res px
 * @param oppFx/oppFy  pinned (opposite) corner: 0 = left/top edge, 1 = right/bottom
 * @param ratio  proportional scale factor from the drag
 */
export function computeCornerScale(
  drawW: number,
  drawH: number,
  offsetX: number,
  offsetY: number,
  layerScale: number,
  scale: number,
  oppFx: number,
  oppFy: number,
  ratio: number,
): CornerScaleResult {
  const clampedScale = Math.min(COMPOSE_SCALE_MAX, Math.max(COMPOSE_SCALE_MIN, layerScale * ratio));
  // Use the actually-applied ratio (after clamping) so the pinned corner stays
  // put even at the scale limits.
  const appliedRatio = clampedScale / layerScale;

  return {
    scale: clampedScale,
    offsetX: offsetX + (drawW * (1 - appliedRatio) * (oppFx - 0.5)) / scale,
    offsetY: offsetY + (drawH * (1 - appliedRatio) * (oppFy - 0.5)) / scale,
  };
}
