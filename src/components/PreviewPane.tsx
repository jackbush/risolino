import { useRef, useState, useEffect, useCallback } from 'react';
import { Layer, RisoConfig } from '../types';
import { useRenderPipeline, ZoomMode } from '../hooks/useRenderPipeline';
import { getCompositeDimensions } from '../engine/renderer';
import { computeLayerPlacement } from '../engine/compositor';
import { composePlacementConfig, computeCornerScale } from '../engine/compose';

interface PreviewPaneProps {
  layers: Layer[];
  config: RisoConfig;
  zoomMode: ZoomMode;
  onZoomModeChange: (mode: ZoomMode) => void;
  onExport: () => void;
  onRerollJitter: () => void;
  composeMode: boolean;
  selectedLayer: Layer | null;
  onCompose: () => void;
  onExitCompose: () => void;
  onSelectLayer: (id: string) => void;
  onLayerOffsetChange: (id: string, x: number, y: number) => void;
  onLayerScaleChange: (id: string, scale: number) => void;
}

// Pointer movement below this (CSS px) counts as a click, above it as a pan.
const DRAG_THRESHOLD = 4;

const TRANSITION_MS = 250;

// A pointerdown within this many CSS px of a corner grabs it for scaling
// (otherwise a press inside the box moves the layer).
const CORNER_HIT_PX = 14;

const clampOffset = (v: number) => Math.min(10000, Math.max(-10000, v));

interface DragState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

// A compose-mode drag of the selected layer: 'move' updates offset, 'scale'
// grows/shrinks the box about the pinned opposite corner. All geometry is
// snapshotted at pointerdown so the maths never feed back on themselves.
interface ComposeDragState {
  type: 'move' | 'scale';
  layerId: string;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
  startScale: number;
  startDrawW: number;
  startDrawH: number;
  fitScale: number;
  displayScale: number;
  rectLeft: number;
  rectTop: number;
  // scale only: pinned (opposite) corner + grabbed corner, in backing px
  oppFx: number;
  oppFy: number;
  ox: number;
  oy: number;
  gx: number;
  gy: number;
}

interface PendingTransition {
  target: ZoomMode;
  fromRect: DOMRect;
}

export function PreviewPane({
  layers,
  config,
  zoomMode,
  onZoomModeChange,
  onExport,
  onRerollJitter,
  composeMode,
  selectedLayer,
  onCompose,
  onExitCompose,
  onSelectLayer,
  onLayerOffsetChange,
  onLayerScaleChange,
}: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const composeDragRef = useRef<ComposeDragState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const transitionRef = useRef<PendingTransition | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  const isEmpty = !layers.some((l) => l.grayscaleData);
  const { width: compositeW, height: compositeH } = getCompositeDimensions(
    layers,
    config.paperSize,
  );
  const exportW = compositeW + 2 * (config.margin ?? 0);
  const exportH = compositeH + 2 * (config.margin ?? 0);

  const clearOverlay = useCallback(() => {
    overlayRef.current?.remove();
    overlayRef.current = null;
    transitionRef.current = null;
  }, []);

  useEffect(() => clearOverlay, [clearOverlay]);

  useEffect(() => {
    if (isEmpty) setCanvasReady(false);
  }, [isEmpty]);

  // Nothing to inspect at 100% once all layers are gone
  useEffect(() => {
    if (isEmpty && zoomMode === 'full') onZoomModeChange('fit');
  }, [isEmpty, zoomMode, onZoomModeChange]);

  // Nothing to compose once all layers are gone — leave the mode so its
  // controls (which live inside the canvas-ready block) can't strand the user.
  useEffect(() => {
    if (isEmpty && composeMode) onExitCompose();
  }, [isEmpty, composeMode, onExitCompose]);

  // Drop any inline cursor set while composing so the zoom cursors take over.
  useEffect(() => {
    if (!composeMode && canvasRef.current) canvasRef.current.style.cursor = '';
  }, [composeMode]);

  /**
   * Freeze the current view under a full-window snapshot overlay, then flip
   * the mode. The overlay hides the layout shuffle and the (possibly slow)
   * re-composite; handleRendered animates it away once the new frame lands.
   */
  function requestZoom(next: ZoomMode, clickFraction?: { fx: number; fy: number }) {
    if (next === zoomMode) return;

    const canvas = canvasRef.current;
    if (canvas && canvasReady) {
      clearOverlay();
      const fromRect = canvas.getBoundingClientRect();

      const snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d')?.drawImage(canvas, 0, 0);
      Object.assign(snap.style, {
        position: 'absolute',
        left: `${fromRect.left}px`,
        top: `${fromRect.top}px`,
        width: `${fromRect.width}px`,
        height: `${fromRect.height}px`,
      });

      const overlay = document.createElement('div');
      overlay.className = 'zoom-transition-overlay';
      overlay.appendChild(snap);
      document.body.appendChild(overlay);
      overlayRef.current = overlay;
      transitionRef.current = { target: next, fromRect };
    }

    if (clickFraction) setCenterFraction(clickFraction.fx, clickFraction.fy);
    onZoomModeChange(next);
  }

  /** First frame of a new mode just presented: animate the frozen snapshot
   *  into the new framing (scale about the anchor point, glide it to its new
   *  position) while fading the overlay out over the crisp render. */
  function handleRendered() {
    setCanvasReady(true);

    const transition = transitionRef.current;
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!transition || !overlay || !canvas) return;
    transitionRef.current = null;

    const snap = overlay.firstChild as HTMLCanvasElement;
    const { fromRect, target } = transition;
    const newRect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const center = getCenterFraction();

    // Displayed CSS px per full-res image px, before and after. A fit view
    // shows the whole full-res composite (content + safe margins) within its
    // rect; a 100% view is 1 image px per device px. Works identically in
    // both flip directions.
    const fullResW =
      getCompositeDimensions(layers, config.paperSize).width +
      2 * Math.round(config.margin ?? 0);
    const oldScale = target === 'full' ? fromRect.width / fullResW : 1 / dpr;
    const newScale = target === 'full' ? 1 / dpr : newRect.width / fullResW;
    const k = newScale / oldScale;

    // The anchor is the image point the transition pivots on: the clicked /
    // stored center. In a fit view it sits at its fraction of the rect; in a
    // 100% view it sits at the viewport center.
    let oldX: number, oldY: number, newX: number, newY: number;
    if (target === 'full') {
      oldX = fromRect.left + center.fx * fromRect.width;
      oldY = fromRect.top + center.fy * fromRect.height;
      newX = newRect.left + newRect.width / 2;
      newY = newRect.top + newRect.height / 2;
    } else {
      oldX = fromRect.left + fromRect.width / 2;
      oldY = fromRect.top + fromRect.height / 2;
      newX = newRect.left + center.fx * newRect.width;
      newY = newRect.top + center.fy * newRect.height;
    }

    snap.style.transformOrigin = `${oldX - fromRect.left}px ${oldY - fromRect.top}px`;
    snap.getBoundingClientRect(); // flush styles so the transition animates

    overlay.style.transition = `opacity ${TRANSITION_MS}ms ease`;
    snap.style.transition = `transform ${TRANSITION_MS}ms ease`;
    overlay.style.opacity = '0';
    snap.style.transform = `translate(${newX - oldX}px, ${newY - oldY}px) scale(${k})`;

    const doneOverlay = overlay;
    window.setTimeout(() => {
      doneOverlay.remove();
      if (overlayRef.current === doneOverlay) overlayRef.current = null;
    }, TRANSITION_MS + 50);
  }

  const { panBy, setCenterFraction, getCenterFraction, getResultScale } = useRenderPipeline(
    layers,
    config,
    canvasRef,
    containerRef,
    zoomMode,
    composeMode,
    selectedLayer?.id ?? null,
    handleRendered,
  );

  /**
   * Compose-mode geometry: the CSS↔backing-store mapping plus a `place(layer)`
   * that returns any layer's box in backing-store px, using the exact same
   * placement code (jitter off) as the outline renderer so the interactive
   * boxes match the drawn frames.
   */
  function composeContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const fitScale = getResultScale();
    const { width: fullW, height: fullH } = getCompositeDimensions(layers, config.paperSize);
    const targetW = Math.round(fullW * fitScale);
    const targetH = Math.round(fullH * fitScale);
    const margin = Math.round((config.margin ?? 0) * fitScale);
    const cfg = composePlacementConfig(config);
    const rect = canvas.getBoundingClientRect();
    const displayScale = rect.width / canvas.width;
    const place = (layer: Layer) =>
      computeLayerPlacement(
        layer,
        cfg,
        layer.grayscaleData!.width,
        layer.grayscaleData!.height,
        fitScale,
        targetW,
        targetH,
        margin,
      );
    return { fitScale, displayScale, rectLeft: rect.left, rectTop: rect.top, place };
  }

  interface CornerHit {
    oppFx: number;
    oppFy: number;
    x: number;
    y: number;
    cursor: string;
  }

  /** Nearest corner of a placement box within `hit` px of (px,py), or null. */
  function hitTestCorner(
    px: number,
    py: number,
    p: { drawX: number; drawY: number; drawW: number; drawH: number },
    hit: number,
  ): CornerHit | null {
    const { drawX, drawY, drawW, drawH } = p;
    const corners: CornerHit[] = [
      { x: drawX, y: drawY, oppFx: 1, oppFy: 1, cursor: 'nwse-resize' }, // TL, pin BR
      { x: drawX + drawW, y: drawY, oppFx: 0, oppFy: 1, cursor: 'nesw-resize' }, // TR, pin BL
      { x: drawX, y: drawY + drawH, oppFx: 1, oppFy: 0, cursor: 'nesw-resize' }, // BL, pin TR
      { x: drawX + drawW, y: drawY + drawH, oppFx: 0, oppFy: 0, cursor: 'nwse-resize' }, // BR, pin TL
    ];
    return corners.find((c) => Math.hypot(px - c.x, py - c.y) <= hit) ?? null;
  }

  const inBox = (
    px: number,
    py: number,
    p: { drawX: number; drawY: number; drawW: number; drawH: number },
  ) => px >= p.drawX && px <= p.drawX + p.drawW && py >= p.drawY && py <= p.drawY + p.drawH;

  /** Topmost visible layer whose box contains (px,py) — layers draw bottom→top,
   *  so scan from the end. */
  function topLayerAt(px: number, py: number, place: (l: Layer) => ReturnType<typeof computeLayerPlacement>) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || !layer.grayscaleData) continue;
      if (inBox(px, py, place(layer))) return layer;
    }
    return null;
  }

  function handleComposePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = composeContext();
    if (!ctx) return;
    const px = (e.clientX - ctx.rectLeft) / ctx.displayScale;
    const py = (e.clientY - ctx.rectTop) / ctx.displayScale;
    const hit = CORNER_HIT_PX / ctx.displayScale;

    // A handle on the currently-selected layer wins, even where boxes overlap.
    if (selectedLayer?.grayscaleData) {
      const p = ctx.place(selectedLayer);
      const corner = hitTestCorner(px, py, p, hit);
      if (corner) {
        composeDragRef.current = {
          type: 'scale',
          layerId: selectedLayer.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startOffsetX: selectedLayer.offsetX,
          startOffsetY: selectedLayer.offsetY,
          startScale: selectedLayer.scale,
          startDrawW: p.drawW,
          startDrawH: p.drawH,
          fitScale: ctx.fitScale,
          displayScale: ctx.displayScale,
          rectLeft: ctx.rectLeft,
          rectTop: ctx.rectTop,
          oppFx: corner.oppFx,
          oppFy: corner.oppFy,
          ox: p.drawX + corner.oppFx * p.drawW,
          oy: p.drawY + corner.oppFy * p.drawH,
          gx: corner.x,
          gy: corner.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Otherwise pick the topmost layer under the pointer: select it and move it.
    const target = topLayerAt(px, py, ctx.place);
    if (!target) return; // clicked empty paper — leave selection as is
    if (target.id !== selectedLayer?.id) onSelectLayer(target.id);
    composeDragRef.current = {
      type: 'move',
      layerId: target.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: target.offsetX,
      startOffsetY: target.offsetY,
      startScale: target.scale,
      startDrawW: 0,
      startDrawH: 0,
      fitScale: ctx.fitScale,
      displayScale: ctx.displayScale,
      rectLeft: ctx.rectLeft,
      rectTop: ctx.rectTop,
      oppFx: 0,
      oppFy: 0,
      ox: 0,
      oy: 0,
      gx: 0,
      gy: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleComposePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = composeDragRef.current;
    if (!d) {
      updateComposeCursor(e);
      return;
    }

    if (d.type === 'move') {
      // CSS delta → backing px → full-res offset units.
      const dx = (e.clientX - d.startClientX) / d.displayScale / d.fitScale;
      const dy = (e.clientY - d.startClientY) / d.displayScale / d.fitScale;
      onLayerOffsetChange(
        d.layerId,
        clampOffset(Math.round(d.startOffsetX + dx)),
        clampOffset(Math.round(d.startOffsetY + dy)),
      );
      return;
    }

    // Scale: project the pointer onto the original opposite→grabbed diagonal to
    // get a proportional (aspect-preserving) ratio, pinning the opposite corner.
    const px = (e.clientX - d.rectLeft) / d.displayScale;
    const py = (e.clientY - d.rectTop) / d.displayScale;
    const ogx = d.gx - d.ox;
    const ogy = d.gy - d.oy;
    const denom = ogx * ogx + ogy * ogy;
    if (denom === 0) return;
    const ratio = Math.max(0.05, ((px - d.ox) * ogx + (py - d.oy) * ogy) / denom);

    const next = computeCornerScale(
      d.startDrawW,
      d.startDrawH,
      d.startOffsetX,
      d.startOffsetY,
      d.startScale,
      d.fitScale,
      d.oppFx,
      d.oppFy,
      ratio,
    );
    onLayerScaleChange(d.layerId, next.scale);
    onLayerOffsetChange(
      d.layerId,
      clampOffset(Math.round(next.offsetX)),
      clampOffset(Math.round(next.offsetY)),
    );
  }

  /** Hover feedback: resize cursor over a selected-layer corner, move over any
   *  layer body, default over empty paper. */
  function updateComposeCursor(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = composeContext();
    if (!canvas || !ctx) return;
    const px = (e.clientX - ctx.rectLeft) / ctx.displayScale;
    const py = (e.clientY - ctx.rectTop) / ctx.displayScale;
    const hit = CORNER_HIT_PX / ctx.displayScale;

    let cursor = 'default';
    if (selectedLayer?.grayscaleData) {
      const corner = hitTestCorner(px, py, ctx.place(selectedLayer), hit);
      if (corner) cursor = corner.cursor;
    }
    if (cursor === 'default' && topLayerAt(px, py, ctx.place)) cursor = 'move';
    canvas.style.cursor = cursor;
  }

  function handleComposePointerUp() {
    composeDragRef.current = null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (composeMode) {
      handleComposePointerDown(e);
      return;
    }
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (composeMode) {
      handleComposePointerMove(e);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
    }
    if (zoomMode === 'full') {
      // CSS px → image px: at 100%, 1 image px = 1 device px = 1/dpr CSS px.
      // Content follows the pointer, so the viewport center moves opposite.
      const dpr = window.devicePixelRatio || 1;
      panBy(-(e.clientX - drag.lastX) * dpr, -(e.clientY - drag.lastY) * dpr);
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (composeMode) {
      handleComposePointerUp();
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;

    // A clean click toggles the zoom mode; from fit, zoom in on the point
    // that was clicked.
    if (zoomMode === 'fit') {
      const rect = e.currentTarget.getBoundingClientRect();
      requestZoom('full', {
        fx: (e.clientX - rect.left) / rect.width,
        fy: (e.clientY - rect.top) / rect.height,
      });
    } else {
      requestZoom('fit');
    }
  }

  return (
    <div className="preview-pane" ref={containerRef}>
      {!canvasReady && (
        <div className="preview-empty">
          <p>Add layers to get started</p>
        </div>
      )}
      <canvas
        className={`preview-canvas${zoomMode === 'full' ? ' preview-canvas--full' : ''}${
          composeMode ? ' preview-canvas--compose' : ''
        }`}
        ref={canvasRef}
        style={{ display: canvasReady ? 'block' : 'none', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {canvasReady && (
        <div className="floating-controls">
          {composeMode ? (
            <button type="button" className="zoom-btn compose-btn" onClick={onExitCompose}>
              Exit compose mode
            </button>
          ) : (
            <>
              <div className="zoom-controls">
                <button
                  type="button"
                  className={`zoom-btn${zoomMode === 'fit' ? ' zoom-btn--active' : ''}`}
                  onClick={() => requestZoom('fit')}
                >
                  Fit
                </button>
                <button
                  type="button"
                  className={`zoom-btn${zoomMode === 'full' ? ' zoom-btn--active' : ''}`}
                  onClick={() => requestZoom('full')}
                >
                  100%
                </button>
              </div>
              <button type="button" className="zoom-btn download-btn" onClick={onExport}>
                Download ({exportW}×{exportH}px)
              </button>
              <button type="button" className="zoom-btn compose-btn" onClick={onCompose}>
                Compose
              </button>
              {config.registrationJitterEnabled && (
                <button type="button" className="zoom-btn reroll-btn" onClick={onRerollJitter}>
                  Re-roll
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
