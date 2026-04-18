# PWA icons

Regenerate from the sources:

```sh
# From repo root. Requires ImageMagick `convert`.
convert -background none -gravity center -extent 44x44 -resize 180x180 app/src/app/icon.svg app/public/icons/icon-180.png
convert -background none -gravity center -extent 44x44 -resize 192x192 app/src/app/icon.svg app/public/icons/icon-192.png
convert -background none -gravity center -extent 44x44 -resize 512x512 app/src/app/icon.svg app/public/icons/icon-512.png
convert -background '#f4ead5' -resize 512x512 app/public/icons/icon-maskable.svg app/public/icons/icon-maskable-512.png
```

- `icon-180.png` — iOS apple-touch-icon (the canonical size modern iPhones ask for).
- `icon-192.png` / `icon-512.png` — standard Android PWA icons.
- `icon-maskable-512.png` — Android adaptive icon. Built from `icon-maskable.svg`, which centers the moose at ~60% of a 512×512 cream canvas so the antlers stay inside the circular safe zone.
- `icon-maskable.svg` — source for the maskable PNG. Hand-tweak if the mark needs re-centering.
