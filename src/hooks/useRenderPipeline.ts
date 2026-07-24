import { useEffect, useRef, useCallback } from 'react';
import { Layer, RisoConfig } from '../types';
import { render, renderOutline, getCompositeDimensions } from '../engine/renderer';

const DEBOUNCE_MS = 150;

export type ZoomMode = 'fit' | 'full';

export interface RenderPipelineControls {
  /** Pan the 100% viewport by a delta in image (device) pixels. No-op in fit mode. */
  panBy: (dxImagePx: number, dyImagePx: number) => void;
  /** Set the 100% viewport center as fractions (0-1) of the composite. */
  setCenterFraction: (fx: number, fy: number) => void;
  /** Current viewport center as fractions (0-1) of the composite. */
  getCenterFraction: () => { fx: number; fy: number };
  /** Fit scale (canvas px per full-res px) of the last render. 1 in 100% mode. */
  getResultScale: () => number;
}

/**
 * Debounced render pipeline hook.
 *
 * Re-composites whenever layers, config, or the zoom mode change, into an
 * offscreen result canvas — fit-scaled in 'fit' mode, full-resolution in
 * 'full' (100%) mode — then presents it on the display canvas. In full mode
 * the display canvas is sized in physical device pixels (1 image px = 1
 * device px, so halftone dots appear exactly as exported) and shows a
 * pannable viewport; panning only re-blits the cached full-res result, it
 * never re-composites.
 */
export function useRenderPipeline(
  layers: Layer[],
  config: RisoConfig,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  mode: ZoomMode,
  composeMode: boolean,
  selectedLayerId: string | null,
  onRender?: () => void,
): RenderPipelineControls {
  const timerRef = useRef<number | undefined>(undefined);

  // Keep mutable refs so the stable callbacks always read the latest
  // layers/config/mode without being recreated on every render.
  const layersRef = useRef(layers);
  const configRef = useRef(config);
  const modeRef = useRef(mode);
  const composeModeRef = useRef(composeMode);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const onRenderRef = useRef(onRender);
  layersRef.current = layers;
  configRef.current = config;
  modeRef.current = mode;
  composeModeRef.current = composeMode;
  selectedLayerIdRef.current = selectedLayerId;
  onRenderRef.current = onRender;

  // Last composited result and the 100% viewport center (fractions of the
  // result's dimensions; survives mode toggles so flipping back and forth
  // returns to the same spot).
  const resultRef = useRef<HTMLCanvasElement | null>(null);
  const resultScaleRef = useRef(1);
  const centerRef = useRef({ fx: 0.5, fy: 0.5 });

  /** Blit resultRef onto the display canvas according to the current mode. */
  const present = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const result = resultRef.current;
    if (!canvas || !container || !result) return;

    if (modeRef.current === 'fit') {
      if (canvas.width !== result.width) canvas.width = result.width;
      if (canvas.height !== result.height) canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(result, 0, 0);
      return;
    }

    // 100% mode: viewport in physical device pixels, 1:1 with image pixels.
    // A stale fit-scaled result must not be presented here — besides looking
    // wrong, its small dimensions would make the clamp below overwrite the
    // freshly clicked-in center. Wait for the full-res render to land.
    if (resultScaleRef.current !== 1) return;
    const dpr = window.devicePixelRatio || 1;
    const viewW = Math.max(1, Math.round(container.clientWidth * dpr));
    const viewH = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width !== viewW) canvas.width = viewW;
    if (canvas.height !== viewH) canvas.height = viewH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.imageSmoothingEnabled = false;

    // The viewport center always shows an image coordinate inside the image
    // (center fractions clamped to [0, 1]). That is exactly the pan rule:
    // any image corner can be dragged as far as the middle of the window,
    // never past it — regardless of image size. Clamping is written back so
    // the stored center never drifts and panning back responds immediately.
    const center = centerRef.current;
    center.fx = Math.min(Math.max(center.fx, 0), 1);
    center.fy = Math.min(Math.max(center.fy, 0), 1);

    // Screen position of the image's top-left corner, then the visible
    // intersection of image and viewport.
    const ox = Math.round(viewW / 2 - center.fx * result.width);
    const oy = Math.round(viewH / 2 - center.fy * result.height);
    const sx = Math.max(0, -ox);
    const sy = Math.max(0, -oy);
    const dx = Math.max(0, ox);
    const dy = Math.max(0, oy);
    const w = Math.min(result.width - sx, viewW - dx);
    const h = Math.min(result.height - sy, viewH - dy);
    if (w > 0 && h > 0) ctx.drawImage(result, sx, sy, w, h, dx, dy, w, h);
  }, [canvasRef, containerRef]);

  const scheduleRender = useCallback(() => {
    window.clearTimeout(timerRef.current);
    // Compose mode renders at fit scale and must feel live under drag, so skip
    // the debounce — the outline render (no halftone/tint/KM) is cheap.
    const delay = composeModeRef.current ? 0 : DEBOUNCE_MS;
    timerRef.current = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const currentLayers = layersRef.current;
      if (!currentLayers.some((l) => l.grayscaleData)) return;

      let scale = 1;
      if (modeRef.current === 'fit' || composeModeRef.current) {
        const { width: fullW, height: fullH } = getCompositeDimensions(
          currentLayers,
          configRef.current.paperSize,
        );
        // Scale to fit container (with padding so canvas doesn't touch
        // edges). The composite comes back margin-inflated, so fit against
        // paper size (content + 2 × margin), not just the content.
        const rect = container.getBoundingClientRect();
        const padding = 32;
        const margin2 = 2 * (configRef.current.margin ?? 0);
        scale = Math.min(
          (rect.width - padding) / (fullW + margin2),
          (rect.height - padding) / (fullH + margin2),
          1,
        );
      }

      resultRef.current = composeModeRef.current
        ? renderOutline(currentLayers, configRef.current, selectedLayerIdRef.current, scale)
        : render(currentLayers, configRef.current, scale);
      resultScaleRef.current = scale;
      present();
      onRenderRef.current?.();
    }, delay);
  }, [containerRef, present]);

  const panBy = useCallback(
    (dxImagePx: number, dyImagePx: number) => {
      const result = resultRef.current;
      if (!result || modeRef.current !== 'full' || resultScaleRef.current !== 1) return;
      centerRef.current.fx += dxImagePx / result.width;
      centerRef.current.fy += dyImagePx / result.height;
      present();
    },
    [present],
  );

  const setCenterFraction = useCallback((fx: number, fy: number) => {
    centerRef.current = { fx, fy };
  }, []);

  const getCenterFraction = useCallback(() => ({ ...centerRef.current }), []);

  const getResultScale = useCallback(() => resultScaleRef.current, []);

  // Re-composite when layers, config, zoom mode, or compose selection change
  // (each changes what — or at what resolution — we draw, so a re-composite,
  // not just a re-blit, is needed).
  useEffect(() => {
    scheduleRender();
    return () => window.clearTimeout(timerRef.current);
  }, [layers, config, mode, composeMode, selectedLayerId, scheduleRender]);

  // On container resize: fit mode needs a re-composite at the new scale;
  // full mode just re-blits the viewport at the new size.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (modeRef.current === 'fit') scheduleRender();
      else present();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, scheduleRender, present]);

  return { panBy, setCenterFraction, getCenterFraction, getResultScale };
}
