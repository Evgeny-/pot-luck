# App icons

`public/favicon.svg` is the vector source for the red soup pot and basil emblem. All PNGs have an
opaque butter-cream background with square corners; the device applies its own home-screen mask.

Rebuild with `bun scripts/build-app-icons.ts`. The script uses the existing Resvg dependency and
writes these files in `public/icons/`:

| File | Use |
| --- | --- |
| `favicon.ico` | 16px, 32px and 48px browser icons in one ICO |
| `favicon-32.png` | PNG favicon fallback |
| `apple-touch-icon.png` | 180px Apple home-screen icon |
| `android-192.png`, `android-512.png` | Manifest icons for general use |
| `maskable-512.png`, `maskable.svg` | Separate maskable artwork with a full-bleed background |

The renderer checks every PNG for opacity and verifies all maskable artwork fits in the central
circle whose radius is 40% of the image width. Small review renders are saved under
`.cache/app-icons/`. The SVG favicon has a versioned URL in `index.html` to refresh its old cache.

`site.webmanifest` fixes the app identity at `/games/pot-luck/`, which distinguishes Pot Luck from
other apps on the same host. Browsers resolve `id` against the origin of `start_url`. Launch and
scope use `./`, and icon URLs are relative to the manifest, keeping those resources under the game's
directory. Its display mode is `standalone`. No service worker is included.

Guidance checked on 2026-10-07: [Apple web-app icon and title tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
[Apple WebKit icon guidance](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/),
[MDN manifest icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons),
[MDN manifest identity](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id),
and [web.dev maskable safe zone](https://web.dev/articles/maskable-icon).
