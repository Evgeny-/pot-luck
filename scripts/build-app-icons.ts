/** Render the app emblem from its vector source: bun scripts/build-app-icons.ts. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg, type RenderedImage } from '@resvg/resvg-js';

const source = readFileSync('public/favicon.svg', 'utf8');
const background = [255, 244, 215];
const out = 'public/icons';
mkdirSync(out, { recursive: true });
mkdirSync('.cache/app-icons', { recursive: true });

function render(svg: string, size: number): RenderedImage {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render();
  const pixels = image.pixels;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 255) throw new Error(`The ${size}px icon contains transparency`);
  }
  return image;
}

/** ICO contains bottom-up 32-bit BGRA DIBs and an opaque, padded AND mask. */
function ico(images: RenderedImage[]): Buffer {
  const entries = Buffer.alloc(6 + images.length * 16);
  entries.writeUInt16LE(1, 2);
  entries.writeUInt16LE(images.length, 4);
  const payloads: Buffer[] = [];
  let offset = entries.length;
  images.forEach((image, index) => {
    const size = image.width;
    const maskBytes = Math.ceil(size / 32) * 4 * size;
    const payload = Buffer.alloc(40 + size * size * 4 + maskBytes);
    payload.writeUInt32LE(40, 0);
    payload.writeInt32LE(size, 4);
    payload.writeInt32LE(size * 2, 8);
    payload.writeUInt16LE(1, 12);
    payload.writeUInt16LE(32, 14);
    payload.writeUInt32LE(size * size * 4 + maskBytes, 20);
    const pixels = image.pixels;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4;
      const dst = 40 + (y * size + x) * 4;
      payload[dst] = pixels[src + 2];
      payload[dst + 1] = pixels[src + 1];
      payload[dst + 2] = pixels[src];
      payload[dst + 3] = 255;
    }
    const entry = 6 + index * 16;
    entries[entry] = size;
    entries[entry + 1] = size;
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(payload.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    payloads.push(payload);
    offset += payload.length;
  });
  return Buffer.concat([entries, ...payloads]);
}

const favicons = [16, 32, 48].map((size) => {
  const image = render(source, size);
  writeFileSync(`.cache/app-icons/favicon-${size}.png`, image.asPng());
  return image;
});
writeFileSync(`${out}/favicon.ico`, ico(favicons));
writeFileSync(`${out}/favicon-32.png`, favicons[1].asPng());
for (const [name, size] of [['apple-touch-icon', 180], ['android-192', 192], ['android-512', 512]] as const) {
  writeFileSync(`${out}/${name}.png`, render(source, size).asPng());
}

// Keep all artwork inside the central safe circle while the background remains full bleed.
const maskableSource = source.replace('id="pot-luck-mark"', 'id="pot-luck-mark" transform="translate(6.4 6.4) scale(0.8)"');
const maskable = render(maskableSource, 512);
let maxRadius = 0;
const pixels = maskable.pixels;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const i = (y * 512 + x) * 4;
  if (background.some((value, channel) => pixels[i + channel] !== value)) {
    maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - 256, y + 0.5 - 256));
  }
}
if (maxRadius > 512 * 0.4) throw new Error(`Maskable artwork exceeds its safe circle: ${maxRadius}px`);
writeFileSync(`${out}/maskable-512.png`, maskable.asPng());
writeFileSync(`${out}/maskable.svg`, maskableSource);
console.log(`App icons rendered; maskable art radius ${maxRadius.toFixed(1)}px / 204.8px safe radius`);
