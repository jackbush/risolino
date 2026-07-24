# RISO

In 1980s Japan a screen printer and a photocopier had a baby: it prints one vivid ink at a time, so a multi-colour print means feeding the same sheet through again and again. The layers never quite line up, the inks are semi-transparent and mix where they overlap, and the whole thing has a warm, slightly-off charm that a normal printer can't do.

Drop in some images, stack them up as ink layers, and watch them overprint with all the happy accidents real riso is loved for — wonky registration, ink bleed, grain, and colours that mix like actual pigment instead of pixels. Nothing gets uploaded, everything runs locally.

## How to use it

1. **Drag images (or a PDF) onto the page.** Each image (or PDF page) becomes a layer.
2. **Click a layer's colour strip** and pick an ink. The palette is based on real riso inks.
3. **Fiddle with the setup** until it feels like a print, not a screen.
4. **Check the details** The zoomed-out preview can shimmer. Click on the preview (or hit **100%**) to inspect and pan around.
5. **Compose** (bottom left) turns the preview into a light-table: every layer becomes a coloured outline with its artwork faintly showing through. Pick a layer in the sidebar, then drag it around the canvas to reposition it or drag a corner to resize it — the offset and scale values update as you go. Hit **Exit compose mode** when you're happy.
6. **Download** a full-resolution PNG.

Layers turn grayscale on import: dark areas become heavy ink, light areas become bare paper. It's how a real riso sees your artwork, one colour separation at a time. Drag the handle to reorder layers (they print bottom to top), click the name to rename, click the thumbnail to swap the image.

### The setup

- **Paper size** — sized to your largest layer by default. *Smallest layer* crops everything down to it; *Zine* (A3 landscape) and *Drawing* (A4 portrait) are fixed 300dpi sheets.
- **Paper color** — riso ink is translucent, so the paper glows through everything. The same print reads completely differently on Newsprint than on White.
- **Scale layers** — *Fit* scales every layer to fit on the paper, *Fill* to cover it. The per-layer scale (advanced layer options) applies on top, independently.
- **Margin** — extra paper around the artwork.
- **Safe area** — keeps ink away from the paper edge, like a real riso's unprintable rim.
- **Ink spread** — ink soaks into paper and creeps past its edges (printers call it dot gain). A little of it takes the digital crispness off.
- **Shading** — riso can't print grey, only dots. **Dot screen** is classic printshop dots on a rotated grid; **Grain** is scattered stipple like modern riso output; **Gradient** keeps smooth continuous tone. In dot-screen mode *Auto angles* will try to prevent moiré patterns, or you can set manually.
- **Registration jitter** — every pass through a real machine is unique. The amount is a % of the sheet's larger edge, so it stays visible at any paper size; real machines drift ~0–2 mm per pass, and the default (0.34% ≈ 1 mm on A4) sits right in that range. The preview is stable and the export matches it exactly. Hit **Re-roll** (bottom left) for a different accident.
- **Ink blending** — how overlapping inks mix. **Realistic** is the good one (next section). **Simple** is multiply blending weighted by each ink's actual opacity — Black covers, Yellow dyes. **Off** treats every ink like coloured cellophane.
- **Advanced layer options** — per-layer opacity, scale, and X/Y offset controls, maybe too much control.

| Grain | Dot screen |
|---|---|
| ![Grain halftone gradient](docs/demo-halftone-stochastic.png) | ![Dot screen halftone gradient](docs/demo-halftone-am.png) |

## Working on it
- React 19 + TypeScript + Vite, no state library.
- Pushes to `main` deploy to GitHub Pages.
```
npm install
npm run dev      # Vite dev server
npm test         # vitest
npm run build    # tsc + vite build
```

### Density pipeline
Each stage is a pure function over grayscale "ink density" `ImageData` that no-ops when its feature is off:

```
upload → toGrayscale ─→ spread (blur.ts) ─→ halftone (halftone.ts) ─→ blend
                                                                      ├─ multiply path: tint + canvas 'multiply'
                                                                      └─ Kubelka-Munk path (kubelkaMunk.ts)
```

### Things worth knowing

- **Everything is full-resolution pixels, no DPI anywhere.** Effects run on full-res data *before* the preview downscale — never scale an effect radius by render scale, that double-applies it.
- **Randomness is always seeded**, keyed by layer id (not index, so reordering doesn't reshuffle jitter). The export reuses the preview's seed and matches it exactly.
- **Heavy stages are cached** in `WeakMap`s chained stage to stage (spread → halftone → tint → downscale prefilter), LRU-capped so slider-dragging can't hoard full-res buffers.
- **The KM path doesn't reimplement geometry** — it rasterizes density with the same shared placement code as the multiply path, then mixes per-pixel in 256-row strips so export memory stays sane.
- **jsdom has no canvas**, so keep maths in pure functions over typed arrays where vitest can reach it; the canvas plumbing is verified in the browser.
- A new effect gets: a `RisoConfig` field, a default in `App.tsx`, a ConfigPanel control, a pipeline stage (not conditionals sprinkled through `composite()`), and tests.
