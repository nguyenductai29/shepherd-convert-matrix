# Application branding

`ShepherdSQL.png` is the supplied, unchanged full Shepherd Master SQL Generator
wordmark. Use it where there is enough horizontal space to keep the subtitle
readable.

The sidebar embeds this exact PNG in an SVG viewport (`55 270 1365 520`) that
removes surrounding whitespace while preserving the full horizontal symbol,
wordmark and subtitle. The original image is 1448×1086; its pixels, colors and
aspect ratio are unchanged. The logo sits on a white surface in both themes.
The browser favicon and desktop/installer icons use the compact symbol from
the same supplied image without redrawing it.

`../src-tauri/app-icon.svg` embeds the original PNG in a square SVG viewport.
The viewport displays source coordinates `x=52..468`, `y=270..782`, with white
padding and the original aspect ratio. This excludes the wordmark and divider
while preserving the complete symbol and its shadow. The original image pixels
are unchanged.

To regenerate the native icons:

```powershell
npm run tauri -- icon src-tauri/app-icon.svg --output src-tauri/icons
Copy-Item src-tauri/icons/icon.png src-tauri/app-icon.png
Copy-Item src-tauri/icons/128x128.png public/shepherd-icon.png
Copy-Item src-tauri/icons/32x32.png public/favicon.png
```

Tauri also generates mobile icons; this Windows application does not use the
`src-tauri/icons/android` or `src-tauri/icons/ios` directories. The configured
Windows bundle consumes `icon.ico` and the existing PNG sizes.
