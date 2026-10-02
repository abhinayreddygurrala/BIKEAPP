# Launch intro video

`assets/video/launch-intro.mp4` is rendered from `scene.html`, a three.js scene with the sport bike from `bike.js` (built in code, no third-party model). The bike starts where the splash logo is and pops a wheelie, filmed from a low front-quarter angle and then a side tracking shot. A rising drone shot then follows it through twisty roads. `src/components/ui/LaunchIntro.tsx` plays it at launch.

Re-render it whenever the splash logo, its size (`imageWidth` in `app.config.ts`) or the splash colour changes, because the first frame has to match the splash exactly.

```sh
cd scripts/launch-intro
npm install                       # three.js + puppeteer-core (uses your installed Google Chrome)
npm run stills                    # optional: a few test frames in stills/
npm run frames                    # 187 PNG frames (3.1 s at 60 fps) in frames/
ffmpeg -y -framerate 60 -i frames/f_%04d.png \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc iec61966-2-1 -color_range tv \
  -movflags +faststart ../../assets/video/launch-intro.mp4
```

Check the hand-off: decode frame 0 to a bitmap and run `node measure.js`. The background should be within a level of `#0B0B0D`, and the bike should be about 186 px wide, centred at (540, 1173) in the 1080×2346 frame. That's the splash logo's size and place.

```sh
ffmpeg -y -i ../../assets/video/launch-intro.mp4 -frames:v 1 \
  -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24" f0.bmp && node measure.js f0.bmp
```

Delete `node_modules/`, `frames/` and `stills/` afterwards. They're gitignored, but Metro still scans them.
