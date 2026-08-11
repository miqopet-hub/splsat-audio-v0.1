# Gaussian-splat spatial-audio playground — v0.1

A deliberately small experiment: move through a public Gaussian-splat scene and hear three invisible synthetic sound locations change with distance.

## What is in v0.1

- Three.js + `@mkkellogg/gaussian-splats-3d`
- public `garden.splat` scene
- free navigation: mouse + WASD, Q/E vertical movement, Shift for faster movement
- exactly three invisible sound locations:
  - rhythm
  - drone
  - texture
- all sound is generated in the browser; there are no audio files
- distance smoothly changes volume and low-pass filtering
- HRTF panning gives each source a 3D direction
- no memory system, authoring UI, visible sound markers, or other concept layers

## Run it

Because browsers restrict module loading and audio, do not double-click `index.html` as a `file://` page.

### Easiest: GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html` and `app.js` to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Open the Pages URL and click **CLICK TO ENTER** once to enable audio.

### Local test

From this folder run any simple static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

- Mouse: look
- W / S: forward / backward
- A / D: left / right
- Q / E: down / up
- Shift: faster
- Esc: release mouse

## Scene and sound positions

The scene URL and the three sound positions are near the top/middle of `app.js`:

```js
const SPLAT_URL = '...';
const SOUND_ZONES = [ ... ];
```

The points are invisible on purpose. For v0.1, finding the sound by moving is the experiment.

## Notes

The library's shared-memory worker path is disabled so the page can run on ordinary GitHub Pages without special cross-origin isolation headers. That trades some rendering performance for simpler hosting.

The splat is loaded from a public remote host, so the first load can be large and depends on that host remaining available.
