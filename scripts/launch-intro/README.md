# Launch intro

The 3D video `assets/video/launch-intro.mp4` is rendered from `scene.html`, a three.js scene using the sport bike from `bike.js`. The bike is built in code, with no third-party model. It starts where the splash logo is, then pops a wheelie, filmed from a front-quarter angle. When the wheelie lands (1.2 s), the app takes over in `src/components/ui/LaunchIntro.tsx`: tyre smoke made from `assets/images/smoke-1..3.png` billows out of the rear tyre, the first screen is swapped in under it, and the smoke clears.

Re-render whenever the splash logo, its size (`imageWidth` in `app.config.ts`) or the splash colour changes, because the first frame has to match the splash exactly.

```sh
cd scripts/launch-intro
npm install                       # three.js + puppeteer-core (uses your installed Google Chrome)
npm run stills                    # optional: test frames in stills/
npm run frames                    # 88 PNG frames (1.47 s at 60 fps) in frames/
ffmpeg -y -framerate 60 -i frames/f_%04d.png \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc iec61966-2-1 -color_range tv \
  -movflags +faststart ../../assets/video/launch-intro.mp4
node render.js puffs && cp smoke-*.png ../../assets/images/   # the smoke puffs
node render.js tyre 1.45          # where the rear tyre is on screen; must match TYRE in LaunchIntro.tsx
```

If you change the camera or timing, update `LANDS_AT` and `TYRE` in `LaunchIntro.tsx`. `preview.html` simulates the smoke over the last frame (after `npm run frames`), to check the smoke covers the screen before the app is swapped in.

Check the hand-off: decode frame 0 to a bitmap and run `node measure.js`. The background should be within a level of `#0B0B0D`, and the bike should be about 180 px wide, centred at (540, 1173) in the 1080×2346 frame. That's the splash logo's size and place.

```sh
ffmpeg -y -i ../../assets/video/launch-intro.mp4 -frames:v 1 \
  -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24" f0.bmp && node measure.js f0.bmp
```

Delete `node_modules/`, `frames/` and `stills/` afterwards. They're gitignored, but Metro still scans them.
