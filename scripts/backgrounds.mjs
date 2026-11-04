// Turns the prints in backgrounds/ into the empty state's gallery: for each,
// a portrait crop (stacked layout) and a landscape crop (side-by-side
// layout), cut from the centre at 1:1 so the dots show at 100%, plus the
// manifest the app reads them from. Run `npm run backgrounds` after adding,
// changing or removing a print.
import { readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(root, 'backgrounds');
const OUT = path.join(root, 'src/assets/backgrounds');

// Device pixels each crop should cover, so it fills the screen at 1:1 without
// scaling up: a large phone or a portrait iPad Pro, and a 14" Retina laptop.
// A smaller source gives a smaller crop, and the app scales that up to fit.
const CROPS = {
  portrait: { width: 2048, height: 2796 },
  landscape: { width: 3024, height: 2268 },
};

const sources = (await readdir(SOURCE)).filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f)).sort();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const manifest = [];
for (const file of sources) {
  const name = path.parse(file).name;
  const image = sharp(path.join(SOURCE, file));
  const { width, height } = await image.metadata();
  const entry = { name };
  for (const [orientation, target] of Object.entries(CROPS)) {
    const w = Math.min(target.width, width);
    const h = Math.min(target.height, height);
    const out = `${name}-${orientation}.webp`;
    // Lossless: lossy codecs smear halftone dots, which is all these are.
    await image
      .clone()
      .extract({ left: Math.floor((width - w) / 2), top: Math.floor((height - h) / 2), width: w, height: h })
      .removeAlpha()
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(OUT, out));
    entry[orientation] = { file: out, width: w, height: h };
  }
  manifest.push(entry);
  console.log(`${file}: ${entry.portrait.width}×${entry.portrait.height}, ${entry.landscape.width}×${entry.landscape.height}`);
}

await writeFile(path.join(OUT, 'backgrounds.json'), `${JSON.stringify(manifest, null, 2)}\n`);
