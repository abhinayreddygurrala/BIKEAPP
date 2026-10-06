# Launch intro

The 3D video `assets/video/launch-intro.mp4` is rendered from `scene.html`, a three.js scene using the sport bike from `bike.js`. The bike is built in code, with no third-party model. The video is 4.75 s at 60 fps, 1080×2346:

- 0–1.7 s: the camera starts close on a red and black sport bike in a dark studio, then pulls back.
- 0.55–2.6 s: a stationary burnout. Thick tyre smoke rolls out, the brake light glows through it and the headlight beam cuts through it.
- 2.6–3.9 s: a wheelie, then the front settles back down.
- 3.2–4.4 s: the smoke breaks up and clears while the camera returns to the opening shot. The last frame matches the first, so the video also loops.

`src/components/ui/LaunchIntro.tsx` plays it after the splash screen and fades the app in from `REVEAL_AT` (4.3 s). If you change the timing in `scene.html`, update `REVEAL_AT`.

The smoke is a raymarched volume, drawn in a full-screen pass after the scene. It's made from puffs thrown off the rear tyre (`PUFFS` / `smokeAt`), eroded by noise. It uses the scene's depth, so it sits correctly around the bike and is reflected in the floor.

```sh
cd scripts/launch-intro
npm install                       # three.js + puppeteer-core (uses your installed Google Chrome)
npm run stills                    # optional: test frames in stills/
npm run frames                    # 286 PNG frames in frames/ (about 3 min on an M2)
ffmpeg -y -framerate 60 -i frames/f_%04d.png \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 21 -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc iec61966-2-1 -color_range tv \
  -movflags +faststart ../../assets/video/launch-intro.mp4
```

Delete `node_modules/`, `frames/` and `stills/` afterwards. They're gitignored, but Metro still scans them.
