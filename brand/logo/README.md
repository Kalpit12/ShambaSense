# ShambaSense logo: Contour S

Colours: Deep forest #0f3d26 · Shamba lime #c4ef5a · Cream #f4f1e6 · Ink #0d110e
Wordmark: "shambasense", IBM Plex Sans Bold, tracking -3.5%, converted to outlines.

- svg/        Master vectors. `shambasense-mark-*` is the 3-band mark; `mark-small-*` is the 2-band version for 24 px and below.
              `shambasense-icon.svg` is the full-bleed square tile (stores and launchers apply their own mask).
- png/        Play Store icon (512, 32-bit), 1024 px masters, lockups at 4x.
- web/        favicon.svg, favicon.ico (16/32/48), favicon PNGs, apple-touch-icon (180), PWA icons (192/512).
- android/res Drop into app/src/main/res. Adaptive icon with background colour, vector foreground and
              Android 13+ monochrome layer, plus legacy PNG mipmaps (mdpi to xxxhdpi, square and round).

Rules: use the 2-band mark below 24 px. Keep clear space of one band width around the tile. Do not add gradients or shadows.
