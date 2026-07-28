import { Layer, RisoConfig } from '../types';
import { composite } from './compositor';
import { compositeOutline } from './compose';

const MAX_DIMENSION = 6400;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

// Fixed sheets at 300dpi: zine spread (A3 landscape), drawing (A4 portrait)
const FIXED_PAPER_SIZES: Record<'a3' | 'a4' | 'ogimage', { width: number; height: number }> = {
  a4: { width: 2480, height: 3508 }, // 210 × 297 mm portrait
  a3: { width: 4961, height: 3508 }, // 420 × 297 mm landscape
  ogimage: { width: 1200, height: 630 }, // Open Graph social preview image
};

/**
 * Compute composite canvas dimensions: a fixed sheet size, or derived from
 * the layer images — the largest layer's per-axis extents, or the smallest's
 * (an intersection crop — layers are centered, so larger images crop equally
 * on all sides). Caps at 6400 per axis. Returns 800×600 if size is
 * layer-derived and no layers have images.
 */
export function getCompositeDimensions(
  layers: Layer[],
  paperSize: RisoConfig['paperSize'] = 'largest',
): {
  width: number;
  height: number;
} {
  if (paperSize === 'a3' || paperSize === 'a4' || paperSize === 'ogimage')
    return { ...FIXED_PAPER_SIZES[paperSize] };

  let w = 0;
  let h = 0;
  const pick = paperSize === 'smallest' ? Math.min : Math.max;
  for (const layer of layers) {
    if (layer.grayscaleData) {
      w = w ? pick(w, layer.grayscaleData.width) : layer.grayscaleData.width;
      h = h ? pick(h, layer.grayscaleData.height) : layer.grayscaleData.height;
    }
  }
  return {
    width: Math.min(w || DEFAULT_WIDTH, MAX_DIMENSION),
    height: Math.min(h || DEFAULT_HEIGHT, MAX_DIMENSION),
  };
}

/**
 * Full render pipeline: composite layers.
 *
 * @param layers  - Layers to composite
 * @param config  - Riso configuration
 * @param scale   - Preview downscale factor (default 1)
 * @returns       - Canvas with the rendered result
 */
export function render(
  layers: Layer[],
  config: RisoConfig,
  scale = 1,
): HTMLCanvasElement {
  const { width: fullW, height: fullH } = getCompositeDimensions(layers, config.paperSize);
  const targetW = Math.round(fullW * scale);
  const targetH = Math.round(fullH * scale);

  return composite(layers, config, targetW, targetH, fullW);
}

/**
 * Compose (outline) render: preview-only light-table view. Sizes the canvas
 * like `render()` but delegates to the outline compositor. `selectedId` bolds
 * one layer's frame.
 */
export function renderOutline(
  layers: Layer[],
  config: RisoConfig,
  selectedId: string | null,
  scale = 1,
): HTMLCanvasElement {
  const { width: fullW, height: fullH } = getCompositeDimensions(layers, config.paperSize);
  const targetW = Math.round(fullW * scale);
  const targetH = Math.round(fullH * scale);

  return compositeOutline(layers, config, targetW, targetH, fullW, selectedId);
}

/**
 * Render at full resolution and trigger a PNG download. Filename carries a
 * timestamp so successive exports don't collide.
 */
export function exportFullRes(layers: Layer[], config: RisoConfig): void {
  const canvas = render(layers, config, 1);

  canvas.toBlob((blob) => {
    if (!blob) {
      alert('Export failed — the browser could not encode a canvas this large.');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riso-print-${stamp}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
