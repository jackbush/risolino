import { loadImageFile, isHeicFile } from './imageLoader';
import { loadPdfFile } from './pdfLoader';

/** The `accept` for every file input that adds layers. */
export const IMPORT_ACCEPT = 'image/*,.heic,.heif,application/pdf';

/**
 * Turn dropped or picked files into layers: each image becomes one, each PDF
 * page becomes one (capped so the stack stays within `maxLayers`). Files that
 * are neither are skipped; ones that fail to load say so.
 */
export function importFiles(
  files: FileList,
  layerCount: number,
  maxLayers: number,
  addLayer: (grayscaleData: ImageData) => void,
) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type === 'application/pdf') {
      loadPdfFile(file, layerCount, maxLayers).then(
        (pages) => pages.forEach((p) => addLayer(p.grayscaleData)),
        (err) => alert(err instanceof Error ? err.message : 'Failed to load PDF'),
      );
    } else if (file.type.startsWith('image/') || isHeicFile(file)) {
      loadImageFile(file).then(
        (result) => addLayer(result.grayscaleData),
        (err) => alert(err instanceof Error ? err.message : 'Failed to load image'),
      );
    }
  }
}
