import { Layer, RisoConfig } from '../types';
import { densityBoxBlur } from './blur';
import { applyAMHalftone, applyStochasticHalftone, autoScreenAngle } from './halftone';
import { KMLayer, kmMixPixels, ksFromHex, orderWeight } from './kubelkaMunk';
import { computeRegistrationJitter } from './prng';

/**
 * Parse a hex color string to [R, G, B] values (0-255). Accepts #RRGGBB and
 * shorthand #RGB.
 */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Tint a grayscale ImageData with an ink color.
 *
 * Mapping:
 *   black (0)   → full ink color (max density)
 *   white (255) → white (no ink, transparent to multiply)
 *   grays       → proportional blend
 *
 * Formula per channel: out = 255 - density * (255 - ink)
 * where density = (255 - gray) / 255
 */
export function tintGrayscale(
  grayscale: ImageData,
  inkR: number,
  inkG: number,
  inkB: number,
): ImageData {
  const src = grayscale.data;
  const out = new ImageData(grayscale.width, grayscale.height);
  const dst = out.data;

  // Precompute (255 - ink) to avoid repeated subtraction in the loop
  const diffR = 255 - inkR;
  const diffG = 255 - inkG;
  const diffB = 255 - inkB;

  for (let i = 0; i < src.length; i += 4) {
    const gray = src[i]; // R=G=B for grayscale input
    const density = (255 - gray) / 255;

    dst[i]     = Math.round(255 - density * diffR);
    dst[i + 1] = Math.round(255 - density * diffG);
    dst[i + 2] = Math.round(255 - density * diffB);
    dst[i + 3] = src[i + 3]; // preserve alpha
  }

  return out;
}

/**
 * Tint a grayscale ImageData with an ink color as a density-alpha mask:
 * RGB is the flat ink color, alpha is proportional to density (black → opaque
 * ink, white → fully transparent). Used for the source-over "opaque overprint"
 * component of ink transparency blending, as opposed to `tintGrayscale`'s
 * multiply-ready output (which encodes density via lightness, not alpha).
 */
export function tintGrayscaleAlpha(
  grayscale: ImageData,
  inkR: number,
  inkG: number,
  inkB: number,
): ImageData {
  const src = grayscale.data;
  const out = new ImageData(grayscale.width, grayscale.height);
  const dst = out.data;

  for (let i = 0; i < src.length; i += 4) {
    const gray = src[i];
    const density = (255 - gray) / 255;

    dst[i] = inkR;
    dst[i + 1] = inkG;
    dst[i + 2] = inkB;
    dst[i + 3] = Math.round(density * src[i + 3]);
  }

  return out;
}

// All pipeline caches share one shape: WeakMap keyed by the stage's *input*
// ImageData (so removing a layer frees everything), holding a small
// insertion-ordered Map keyed by the stage parameters. The inner maps are
// LRU-capped: full-resolution entries run to ~160MB each at the 6400px cap,
// so dragging a slider across its range must not retain one result per
// notch — only "wiggle and come back" reuse matters.
const LRU_CAP = 2;

function lruGet<K, V>(map: Map<K, V>, key: K, compute: () => V): V {
  const hit = map.get(key);
  if (hit !== undefined) {
    // Refresh recency (Maps iterate in insertion order)
    map.delete(key);
    map.set(key, hit);
    return hit;
  }
  const value = compute();
  map.set(key, value);
  while (map.size > LRU_CAP) map.delete(map.keys().next().value as K);
  return value;
}

function cacheFor<K, V>(store: WeakMap<ImageData, Map<K, V>>, input: ImageData): Map<K, V> {
  let inner = store.get(input);
  if (!inner) {
    inner = new Map();
    store.set(input, inner);
  }
  return inner;
}

// Per-layer cache of spread-blurred density, keyed by blur radius, so the
// debounced re-render triggered by unrelated config changes (or resizing the
// preview) doesn't re-blur a full-resolution image every time.
const spreadCache = new WeakMap<ImageData, Map<number, ImageData>>();

function applySpreadStage(grayscaleData: ImageData, config: RisoConfig): ImageData {
  if (!config.inkSpreadEnabled) return grayscaleData;

  const radius = Math.round(config.inkSpreadAmount);
  if (radius <= 0) return grayscaleData;

  return lruGet(cacheFor(spreadCache, grayscaleData), radius, () =>
    densityBoxBlur(grayscaleData, radius),
  );
}

// Per-layer cache of halftoned density, keyed by the resolved screen params,
// for the same reason as the spread cache: thresholding a full-resolution
// image on every debounced re-render is wasteful. Keyed off the *input*
// density object, so it chains correctly after the (cached) spread stage.
const halftoneCache = new WeakMap<ImageData, Map<string, ImageData>>();

function applyHalftoneStage(
  density: ImageData,
  config: RisoConfig,
  layerIndex: number,
): ImageData {
  if (config.halftoneMode === 'off') return density;

  let key: string;
  let compute: () => ImageData;
  if (config.halftoneMode === 'stochastic') {
    const scale = config.halftoneScale;
    key = `s:${scale}`;
    compute = () => applyStochasticHalftone(density, scale);
  } else {
    const angle = config.halftoneAngle ?? autoScreenAngle(layerIndex);
    const spacing = config.halftoneSpacing;
    key = `am:${spacing}:${angle}`;
    compute = () => applyAMHalftone(density, spacing, angle);
  }

  return lruGet(cacheFor(halftoneCache, density), key, compute);
}

// Tint stage cache (chained on the density output like the halftone cache):
// re-tinting a full-resolution image on every debounced re-render was the
// remaining per-render pixel loop in the multiply path.
const tintCache = new WeakMap<ImageData, Map<string, ImageData>>();

function tintStage(
  density: ImageData,
  hex: string,
  mode: 'multiply' | 'alpha',
): ImageData {
  const [r, g, b] = hexToRgb(hex);
  return lruGet(cacheFor(tintCache, density), `${mode}:${hex}`, () =>
    mode === 'multiply' ? tintGrayscale(density, r, g, b) : tintGrayscaleAlpha(density, r, g, b),
  );
}

/**
 * Density pipeline: grayscale → spread → halftone → (tint happens separately).
 * Each stage is a pure function over density `ImageData` that no-ops when its
 * feature is disabled, so later phases (Kubelka-Munk) slot in as additional
 * stages instead of branching inside `composite()`. `layerIndex` picks the
 * auto screen angle for AM halftone.
 */
function computeDensity(
  grayscaleData: ImageData,
  config: RisoConfig,
  layerIndex: number,
): ImageData {
  let density = grayscaleData;
  density = applySpreadStage(density, config);
  density = applyHalftoneStage(density, config, layerIndex);
  return density;
}

// Jitter slider max, in % of the paper's larger dimension. Real riso
// misregistration measures ~0-2mm per pass (up to ~3mm multi-pass) — about
// 0.3-1% of an A4/A3 edge — so 2% is the realistic range plus headroom.
export const JITTER_MAX_PCT = 2;

export interface LayerPlacement {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  rotationDeg: number;
}

/**
 * Where a layer's (density-sized) image lands on the output canvas: centered
 * in the content area, pushed by the paper margin, then shifted by the
 * layer offset and registration jitter (all scaled). Shared by the multiply
 * and Kubelka-Munk paths so both apply identical geometry.
 */
export function computeLayerPlacement(
  layer: Layer,
  config: RisoConfig,
  srcW: number,
  srcH: number,
  scale: number,
  targetW: number,
  targetH: number,
  margin: number,
): LayerPlacement {
  // Per-layer scale/offset always apply (defaults are neutral: scale 1,
  // offset 0). The "Advanced layer options" toggle only controls whether their
  // controls are *shown* in the layer tile — same as per-layer opacity — so
  // Compose mode can edit these values without flipping any UI switch.
  const layerScale = layer.scale;

  // Fit/fill: scale every layer to the paper's content area (margin excluded).
  // The per-layer scale multiplies on top, so a layer can be scaled twice,
  // independently.
  let fitScale = 1;
  if (config.layerFit !== 'off' && srcW > 0 && srcH > 0) {
    const pick = config.layerFit === 'fit' ? Math.min : Math.max;
    fitScale = pick(targetW / (srcW * scale), targetH / (srcH * scale));
  }

  const drawW = srcW * scale * fitScale * layerScale;
  const drawH = srcH * scale * fitScale * layerScale;
  let drawX = margin + (targetW - drawW) / 2 + layer.offsetX * scale;
  let drawY = margin + (targetH - drawH) / 2 + layer.offsetY * scale;

  // Registration jitter (scaled): random per-layer shift, keyed by layer id
  // + seed so it's stable across re-renders and only changes on an explicit
  // re-roll (or a slider change). The amount is a % of the paper's larger
  // full-res dimension, so the drift stays visible at any sheet size.
  let rotationDeg = 0;
  if (config.registrationJitterEnabled) {
    const paperMaxPx = Math.max(targetW, targetH) / scale;
    const jitter = computeRegistrationJitter(
      config.registrationJitterSeed,
      (config.registrationJitterAmount / 100) * paperMaxPx,
      layer.id,
      config.registrationJitterAmount / JITTER_MAX_PCT,
    );
    drawX += jitter.dx * scale;
    drawY += jitter.dy * scale;
    rotationDeg = jitter.rotationDeg;
  }

  return { drawX, drawY, drawW, drawH, rotationDeg };
}

/**
 * Binary halftone dots drawn at 1:1 scale must be point-sampled, not
 * interpolated: bilinear resampling of a 1-px stipple under the jitter's
 * sub-pixel shift + small rotation beats against the pixel grid and shows up
 * as faint horizontal/vertical moiré bands. At any other effective draw scale
 * (preview downscale, per-layer scale) smoothing stays on — nearest-neighbor
 * resampling would alias far worse, and the export is authoritative anyway.
 */
function crispHalftone(config: RisoConfig, effectiveScale: number): boolean {
  return config.halftoneMode !== 'off' && effectiveScale === 1;
}

/**
 * Safe area: no ink lands within `config.safeArea` px (full-res) of the paper
 * edge — emulating a risograph's unprintable rim. Only the paper color shows
 * there, so the clip applies to layer draws, not the background fill. Must be
 * applied in canvas space, i.e. before any placement rotation.
 */
function applySafeAreaClip(
  ctx: CanvasRenderingContext2D,
  config: RisoConfig,
  scale: number,
  width: number,
  height: number,
): void {
  const inset = Math.round((config.safeArea ?? 0) * scale);
  if (inset <= 0) return;
  ctx.beginPath();
  ctx.rect(inset, inset, Math.max(0, width - 2 * inset), Math.max(0, height - 2 * inset));
  ctx.clip();
}

function applyPlacementRotation(ctx: CanvasRenderingContext2D, p: LayerPlacement): void {
  if (p.rotationDeg === 0) return;
  const centerX = p.drawX + p.drawW / 2;
  const centerY = p.drawY + p.drawH / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate((p.rotationDeg * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);
}

/**
 * Prepare a layer image for drawing at `effectiveScale`. Canvas bilinear
 * filtering samples only a 2×2 tap, so a single drawImage below half size
 * skips source pixels — and skipping through a binary halftone stipple
 * aliases into strong moiré that varies with the fit-preview scale. Halve the
 * canvas (a proper 2×2 average each step) until the remaining draw scale is
 * ≥ 0.5, so the final drawImage filters every source pixel. No-op at scale
 * ≥ 0.5, so 100% view and export are untouched.
 */
const prefilterCache = new WeakMap<ImageData, Map<number, HTMLCanvasElement>>();

export function prefilterForScale(img: ImageData, effectiveScale: number): HTMLCanvasElement {
  // Number of halvings needed; every scale in the same octave shares a result
  let levels = 0;
  for (let s = effectiveScale; s < 0.5; s *= 2) levels++;

  return lruGet(cacheFor(prefilterCache, img), levels, () => {
    let canvas = imageDataToCanvas(img);
    for (let l = 0; l < levels; l++) {
      const half = document.createElement('canvas');
      half.width = Math.max(1, Math.ceil(canvas.width / 2));
      half.height = Math.max(1, Math.ceil(canvas.height / 2));
      const hctx = half.getContext('2d')!;
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(canvas, 0, 0, half.width, half.height);
      canvas = half;
    }
    return canvas;
  });
}

function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Composite all visible layers onto a canvas — multiply blend mode, or
 * Kubelka-Munk mixing when enabled (see kmComposite).
 *
 * @param layers     - Array of layers (composited bottom to top)
 * @param config     - Riso config (paper color, offset toggle)
 * @param targetW    - Output canvas width (may be scaled for preview)
 * @param targetH    - Output canvas height
 * @param fullW      - Full-resolution composite width (for computing scale)
 * @returns          - Canvas element with the composited result
 */
export function composite(
  layers: Layer[],
  config: RisoConfig,
  targetW: number,
  targetH: number,
  fullW: number,
): HTMLCanvasElement {
  if (config.inkBlendMode === 'km') {
    return kmComposite(layers, config, targetW, targetH, fullW);
  }

  const scale = targetW / fullW;
  const margin = Math.round((config.margin ?? 0) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW + 2 * margin;
  canvas.height = targetH + 2 * margin;
  const ctx = canvas.getContext('2d')!;

  // 1. Paper background
  ctx.fillStyle = config.paperColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // No ink inside the safe area — clip all layer draws to the printable rect
  applySafeAreaClip(ctx, config, scale, canvas.width, canvas.height);

  // 2. Composite each visible layer. The index (position in the full layer
  // list, not just visible ones) keys the auto AM screen angle, so toggling
  // a layer's visibility doesn't reshuffle the other layers' angles.
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    if (!layer.visible || !layer.grayscaleData) continue;

    const density = computeDensity(layer.grayscaleData, config, layerIndex);
    const tinted = tintStage(density, layer.inkColor.hex, 'multiply');

    const placement = computeLayerPlacement(
      layer,
      config,
      tinted.width,
      tinted.height,
      scale,
      targetW,
      targetH,
      margin,
    );
    const { drawX, drawY, drawW, drawH } = placement;
    const effScale = drawW / tinted.width;
    const tmp = prefilterForScale(tinted, effScale);

    ctx.save();
    applyPlacementRotation(ctx, placement);
    ctx.imageSmoothingEnabled = !crispHalftone(config, effScale);
    ctx.imageSmoothingQuality = 'high';

    if (config.inkBlendMode === 'simple') {
      // Blend between pure multiply (transparent, dye-like inks — shows what's
      // beneath) and source-over occlusion by density (opaque inks — hides it).
      const transparency = layer.inkColor.transparency;

      if (transparency > 0) {
        ctx.globalAlpha = layer.opacity * transparency;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(tmp, drawX, drawY, drawW, drawH);
      }

      if (transparency < 1) {
        const alphaTinted = tintStage(density, layer.inkColor.hex, 'alpha');
        const tmpAlpha = prefilterForScale(alphaTinted, effScale);
        ctx.globalAlpha = layer.opacity * (1 - transparency);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tmpAlpha, drawX, drawY, drawW, drawH);
      }
    } else {
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(tmp, drawX, drawY, drawW, drawH);
    }

    ctx.restore();
  }

  return canvas;
}

// Strip height for Kubelka-Munk mixing: bounds both the JS-heap ImageData
// copies (layers + 1 strips) *and* the rasterization canvas to width × 256
// pixels — at the 6400px export cap, full-frame buffers per layer would
// otherwise run to hundreds of MB each.
const KM_STRIP_ROWS = 256;

/**
 * Kubelka-Munk compositing path: replaces multiply blending entirely (ink
 * transparency blending is likewise superseded — KM is the blending model).
 *
 * Geometry is not reimplemented in software: each layer's density map is
 * rasterized by Canvas with the exact same placement (resampling, centering,
 * safe area, offsets, jitter + rotation) as the multiply path. Opacity uses
 * globalAlpha, which over a white background scales density exactly:
 * 255 − (a·src + (1−a)·255) = a·(255 − src).
 *
 * Rasterization happens strip by strip into one reused white canvas — the
 * strip context is translated so the strip sees its slice of the full paper
 * coordinate space — so peak memory stays bounded by strip size, not
 * (layers × full frame). The per-pixel KM math then runs on the aligned
 * strip buffers.
 */
function kmComposite(
  layers: Layer[],
  config: RisoConfig,
  targetW: number,
  targetH: number,
  fullW: number,
): HTMLCanvasElement {
  const scale = targetW / fullW;
  const margin = Math.round((config.margin ?? 0) * scale);
  const width = targetW + 2 * margin;
  const height = targetH + 2 * margin;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const visibleIndices: number[] = [];
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].visible && layers[i].grayscaleData) visibleIndices.push(i);
  }

  const prepared = visibleIndices.map((layerIndex, position) => {
    const layer = layers[layerIndex];
    const density = computeDensity(layer.grayscaleData!, config, layerIndex);
    const placement = computeLayerPlacement(
      layer,
      config,
      density.width,
      density.height,
      scale,
      targetW,
      targetH,
      margin,
    );
    const effScale = placement.drawW / density.width;
    return {
      src: prefilterForScale(density, effScale),
      placement,
      effScale,
      opacity: layer.opacity,
      ks: ksFromHex(layer.inkColor.hex),
      weight: orderWeight(position, visibleIndices.length, config.kubelkaMunkOrderBias),
    };
  });

  const strip = document.createElement('canvas');
  strip.width = width;
  strip.height = KM_STRIP_ROWS;
  const stripCtx = strip.getContext('2d', { willReadFrequently: true })!;

  const paperKS = ksFromHex(config.paperColor);

  for (let y0 = 0; y0 < height; y0 += KM_STRIP_ROWS) {
    const rows = Math.min(KM_STRIP_ROWS, height - y0);

    const kmLayers: KMLayer[] = prepared.map((p) => {
      stripCtx.save();
      // White = zero density; also the value outside the safe-area clip
      stripCtx.fillStyle = '#FFFFFF';
      stripCtx.fillRect(0, 0, width, rows);
      // Shift paper space so this strip sees rows y0..y0+rows
      stripCtx.translate(0, -y0);
      applySafeAreaClip(stripCtx, config, scale, width, height);
      applyPlacementRotation(stripCtx, p.placement);
      stripCtx.imageSmoothingEnabled = !crispHalftone(config, p.effScale);
      stripCtx.imageSmoothingQuality = 'high';
      stripCtx.globalAlpha = p.opacity;
      stripCtx.drawImage(
        p.src,
        p.placement.drawX,
        p.placement.drawY,
        p.placement.drawW,
        p.placement.drawH,
      );
      stripCtx.restore();
      return {
        data: stripCtx.getImageData(0, 0, width, rows).data,
        ks: p.ks,
        weight: p.weight,
      };
    });

    const out = ctx.createImageData(width, rows);
    kmMixPixels(kmLayers, paperKS, out.data);
    ctx.putImageData(out, 0, y0);
  }

  return canvas;
}
