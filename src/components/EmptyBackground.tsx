import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BACKGROUNDS, firstBackgroundIndex } from '../config/backgrounds';

interface EmptyBackgroundProps {
  /** Stacked layout: use the portrait crops. */
  mobile: boolean;
  /** Something is being dragged in: show the print in negative. */
  inverted: boolean;
  /** The first print has loaded (or failed to), so it can show before the UI. */
  onReady: () => void;
}

// A horizontal drag at least this long (CSS px), and longer than it is tall,
// counts as a swipe.
const SWIPE_PX = 40;

/** The gallery index `by` steps from `i`, wrapping round. */
const stepFrom = (i: number, by: number) => (i + by + BACKGROUNDS.length) % BACKGROUNDS.length;

/**
 * The empty state's backdrop: a gallery of prints, shown at 100% (one image
 * pixel per device pixel, like the 100% view) and centred on whole device
 * pixels so the dots stay crisp. Only a screen bigger than the crop scales it
 * up to cover. It opens on the default print (config/backgrounds.ts), or a
 * random one; arrow keys or a swipe step through the gallery.
 */
export function EmptyBackground({ mobile, inverted, onReady }: EmptyBackgroundProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(firstBackgroundIndex);
  const [view, setView] = useState({ width: 0, height: 0 });
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const step = (by: number) => setIndex((i) => stepFrom(i, by));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setView({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Leave arrows to anything that uses them: fields, selects, sliders.
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, [contenteditable], [role="tablist"]')) return;
      setIndex((i) => stepFrom(i, e.key === 'ArrowRight' ? 1 : -1));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const crop = BACKGROUNDS.length
    ? mobile
      ? BACKGROUNDS[index].portrait
      : BACKGROUNDS[index].landscape
    : null;

  // Decoded, not just fetched, so it paints the moment it's shown.
  const url = crop?.url;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    if (!url) {
      onReadyRef.current();
      return;
    }
    const img = new Image();
    img.src = url;
    img.decode().catch(() => {}).finally(() => onReadyRef.current());
  }, [url]);

  if (!crop) return null;

  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1 / dpr, view.width / crop.width, view.height / crop.height);
  const w = crop.width * scale;
  const h = crop.height * scale;
  const snap = (v: number) => Math.round(v * dpr) / dpr;

  return (
    <div
      ref={ref}
      className={`empty-background${inverted ? ' empty-background--inverted' : ''}`}
      onPointerDown={(e) => {
        swipeRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - start.y)) step(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipeRef.current = null;
      }}
    >
      <div
        key={crop.url}
        className="empty-background-print"
        style={{
          backgroundImage: `url(${crop.url})`,
          backgroundSize: `${w}px ${h}px`,
          backgroundPosition: `${snap((view.width - w) / 2)}px ${snap((view.height - h) / 2)}px`,
        }}
      />
    </div>
  );
}
