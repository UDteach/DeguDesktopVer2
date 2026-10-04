# Source attribution

DeguDesktopVer2 uses the user's MofuMouse project at https://github.com/UDteach/MofuMouse.

- Original degu walk and idle PNGs, frame ordering, durations and presentation transforms are copied without changing their bytes.
- `app/catalog.cjs` is copied from MofuMouse's `electron-prototype/app/catalog.cjs`.
- `app/media/manifest.json` records the source commit and original manifest hash, as well as per-frame hashes and the existing production provenance. Only the ten degu variants are included.
- The application icon is a resized composition of the original agouti idle frame; it is not a new animation source.
- The desktop/preview stage applies one common vertical offset (0.197 × display height) to bring the original solid-foot baseline onto the floor. This is not a per-frame edit and does not replace the original motion presentation transforms.

MofuMouse's attribution is to UDteach / kdevelopk. No additional redistribution license is asserted here. Preserve the project owner's asset and code rights when distributing derived builds.

Electron, Chromium, Node.js, electron-builder and Playwright retain their respective licenses. Packaged Electron contains its license notices.
