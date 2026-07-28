import { toGrayscale } from './grayscale';

const MAX = 6400;

/** True for files browsers can't decode natively but heic-to can (HEIC/HEIF). */
export function isHeicFile(file: File): boolean {
  if (/^image\/hei[cf]/i.test(file.type)) return true;
  // Many OSes hand HEICs over with an empty MIME type, so fall back to extension.
  return /\.(heic|heif)$/i.test(file.name);
}

/** Draw a decoded source (either an <img> or ImageBitmap) to grayscale density data. */
function drawToGrayscale(src: CanvasImageSource & { width: number; height: number }): {
  grayscaleData: ImageData;
} {
  const scale = Math.min(1, MAX / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return { grayscaleData: toGrayscale(ctx.getImageData(0, 0, w, h)) };
}

/**
 * Load an image file as grayscale density data. Images larger than the
 * 6400px canvas cap are downscaled to fit (like a printer would), never
 * rejected. HEIC/HEIF files — which Chrome and Firefox can't decode natively —
 * are decoded locally with heic-to, so nothing leaves the machine.
 */
export function loadImageFile(file: File): Promise<{ grayscaleData: ImageData }> {
  if (isHeicFile(file)) return loadHeicFile(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        resolve(drawToGrayscale(img));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to load image'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

async function loadHeicFile(file: File): Promise<{ grayscaleData: ImageData }> {
  // Loaded lazily so the ~2MB libheif WASM only downloads when a HEIC is dropped.
  const { heicTo } = await import('heic-to');
  let bitmap: ImageBitmap;
  try {
    bitmap = await heicTo({ blob: file, type: 'bitmap' });
  } catch {
    throw new Error('Failed to decode HEIC image');
  }
  try {
    return drawToGrayscale(bitmap);
  } finally {
    bitmap.close();
  }
}
