# Boreal Flow 🌲🛹🛶

> **A 3D Canadian wilderness exploration & flow-state sandbox running in the browser at 60 FPS — delivered in a single 287 kB gzipped bundle.**

Inspired by *Lonely Mountains: Downhill*, *A Short Hike*, and *Firewatch*.

---

## 💡 The Architectural Experiment: "Is Flash Back?"

*Boreal Flow* was born out of a radical technical challenge: **Can a modern front-end engineer and an AI companion scaffold a living, tactile, multi-modal 3D world from an empty directory in under 40 minutes, with zero external assets?**

For fifteen years, the web has suffered from self-censorship — flattening itself into sterile, static Figma rectangles, corporate CMS cards, and silent data grids out of fear of Core Web Vitals and heavy asset budgets. 

This project proves that the technical friction has collapsed:
- **Zero 3D asset files (`.glb` / `.gltf` / `.obj`):** 100% of the world, props, vehicles, vegetation, and articulated explorer rig are procedural geometries generated mathematically in memory.
- **Zero bitmap textures (`.jpg` / `.png` / `.webp`):** The art style relies exclusively on flat-shaded low-poly vertex colors, calculated normals, and calibrated directional lighting with soft ambient bounces.
- **Zero pre-recorded audio files (`.mp3` / `.wav` / `.ogg`):** Altitude wind, urethane road hum, dirt crunch, water hull lapping, loon calls, campfire crackles, and double-strike brass bicycle bells are **synthesized in real time** via the native **Web Audio API**.
- **The Result:** The entire production build weighs **1.0 MB uncompressed (where ~75% is React + Three.js itself), transferring at just 287 kB over the wire** — lighter than a single medium-resolution JPEG on a typical e-commerce homepage.

This repository is developed iteratively **session by session, branch by branch**, documenting the transition from rapid vertical slice to full cozy multiplayer.

---

## 🚀 Quickstart

```bash
# Clone the repository
git clone https://github.com/QuentinMerle/boreal-flow.git
cd boreal-flow

# Install dependencies
npm install

# Start local development server with instant HMR
npm run dev

# Production build & bundle verification
npm run build
```

Open **`http://localhost:5173/`** in your browser.

---

## 🎮 Controls & Mechanics

| Key / Control | Action |
| :--- | :--- |
| **`WASD` / `ZQSD` / Arrows** | Steer, push / pedal / paddle / climb |
| **`1`** | **Hike / Walk Mode** (all-terrain navigation, natural footstep bob) |
| **`2`** | **Longboard Mode** (downhill momentum, S-carve pumping, *Aero Tuck* at > 50 km/h) |
| **`3`** | **Mountain Bike (VTT) Mode** (agile suspension, circular pedaling, drift skids) |
| **`4`** | **Prospector Canoe Mode** (mirror lake gliding, rhythmic left/right paddling, river currents) |
| **`Space` / `Shift`** | Longboard Powerslide / Bike Bunny-Hop / Climbing Dyno Leap |
| **`V` / Gamepad `R3`** | **Toggle Camera Mode:** Elevated Diorama View $\leftrightarrow$ Close 3rd-Person "Skate / Action" View |
| **`Esc` / `P` / Gamepad `Start`** | **Expedition Field Guide:** Pause menu, Trailheads, Sky presets, and Wildlife journal |
| **`E` / Gamepad `X`** | **Contextual Action:** Start triathlon race, equipment racks, campfire bivouac, zipline |
| **`C` / `F`** | **Non-Verbal Emote:** Double brass bike bell (`BIKE`) or warm *Journey* harmonic chime + hand wave |
| **`B` / Gamepad `LB`** | **Acoustic Binoculars:** Optic zoom (`FOV 16°`) to scan and log wildlife species |
| **`N`** | Toggle Day / **Night** (automatic player headlamp + illuminated base camp) |
| **`R` / Gamepad `Back`** | Respawn at chosen location / checkpoint |

---

## ⚙️ Core Technical Pillars

### 1. $O(1)$ Analytical Terrain & Barycentric Physics
Instead of loading heavy physics engines like Rapier or casting expensive raycasts against 85,000 terrain triangles each frame, the physical terrain is evaluated by a pure mathematical heightfield function (`sampleTerrain(x, z)`). Ground elevation, exact surface normals, and terrain types (asphalt, dirt trail, grass, rock, water) are computed in nanoseconds without garbage collection.

### 2. Strict Zustand / 60Hz Loop Isolation
Per-frame physics calculations, procedural skeletal joint articulation, and camera interpolation mutate a shared, flat data structure (`mutablePhysics`). The React render tree is **never triggered during `useFrame`**. HUD elements (speedometer, altitude, stamina ring, contextual prompts) subscribe to low-overhead `requestAnimationFrame` loops updating DOM references directly.

### 3. GPU Vertex Wind Shaders (`onBeforeCompile`)
Over 2,400 instanced foliage assets (multi-tiered boreal spruces, boulders, grass tufts) populate the landscape. Wind animation is injected directly into Three.js native vertex shaders using `material.onBeforeCompile`, driven by a single shared GPU uniform (`uTime`). This preserves directional shadow casting with zero CPU overhead.

### 4. Smooth Spline Ribbons & Dashed Center Lines
Scenic asphalt roads and technical singletracks are generated as dedicated extruded ribbons (`createSplineRibbonGeometry`) hugging the terrain at `+0.06m` with `polygonOffset` protection, eliminating jagged triangle sawtooth edges and preventing z-fighting.

---

## 🗺️ Implementation Roadmap

### Phase 1 — The "500m Slope" Sandbox (Completed ✅)
- [x] Deterministic 2D Simplex Noise mountain slope from summit (`Z: -250`, `74m`) to alpine lake (`Z: +250`).
- [x] Dual 3D splines (`THREE.CatmullRomCurve3`): Flattened asphalt downhill road & banked dirt trail.
- [x] Damped spring diorama follow camera with velocity-based lead framing.
- [x] Unified "Arcade Sphere" multi-mode controller (`WALK`, `LONGBOARD`, `BIKE`, `CANOE`).
- [x] Instanced urethane drift smoke and V-shaped water wake foam rings.

### Phase 2 & 2.5 — 1,600m Map, Diorama Polish & Game Feel (Completed ✅)
- [x] **1,600m Canyon Scale:** Extended map from summit (`Z = -800`, altitude 335m) to Mirror Lake (`Z = +800`) with upper Red Bull Rampage sandstone couloirs and crags.
- [x] **Blender MCP Campsite Asset:** Modeled A-frame canvas tent, split-log bench, stone fire pit, and procedural GLSL dancing campfire flames.
- [x] **Organic Stylized Smoke Plume:** 64-puff icosahedral plume with thermal convection swirl, sinusoidal billow envelope, and 3-stage warm ember to sky mist gradient.
- [x] **Procedural Web Audio Expansion:** High-speed aerodynamic wind rush bandpass (40–90 km/h) and organic campfire pops / wood crackle snaps.
- [x] **Camera & Game Feel Calibration:** Elevated Diorama view (10.5–14.5m, ~38° pitch) + close 3rd-person "Skate / Action" view on `[V]`. Road shake smoothed by 3x.
- [x] **Canoe Physics Rebalance:** Hydrodynamic fluid drag, athletic 28 km/h sprint cap, authentic 4.8 m/s² stroke acceleration.
- [x] **Expedition Field Guide UI:** Structured Trailhead cards, segmented sky bar, collectible wildlife badges, and tactile keycaps/gamepad badges.

### Phase 3 — Wildlife, Road Traffic & Flow-State Game Design (Next / Session 3 Backlog ⏳)
- [ ] **Lonely Mountains Flow & Checkpoints:** One-way downhill funnels, instant rewind hotkey `[R]`, canopy shadow tunnels, North Shore wooden boardwalks, and gap jump kickers.
- [ ] **Procedural Terrain & Grass Shader:** 2-tone stippling/dither grass shader, slope-based limestone cliffs, anisotropic sun sheen, and wind-blown instanced grass tufts.
- [ ] **Park Wildlife & Ambient Traffic:** Low-poly 3D animated Moose, Black Bear, Snowshoe Hare, and retro Canadian camper van on the road with drafting mechanics.
- [ ] **Scarf Ghost & Finish Recap:** Ghost run replay via `Float32Array(900 * 5)` in `localStorage` and diegetic wooden finish recap board.
- [ ] **On-Device Local AI:** Push-to-talk Walkie-Talkie on CPU Wasm (`whisper-tiny` ~40MB) driving in-game world events without cloud latency.

---

## 📂 Project Structure

```
src/
├── audio/
│   └── soundscape.ts         # Native Web Audio API procedural sound engine
├── components/
│   ├── ArcadeController.tsx   # Multi-mode kinematic sphere & 7-joint character rig
│   ├── DayNightAtmosphere.tsx # 4-palette lighting, orbiting celestial bodies & starfield
│   ├── DioramaCamera.tsx      # Dual-mode camera: Elevated Diorama & Skate Action + optics
│   ├── HudOverlay.tsx         # Expedition Field Guide, zero-rerender DOM telemetry & controls
│   ├── ParkActivities.tsx     # Campsite GLB, bouldering, firewatch tower, 700m zipline & wildlife
│   ├── ParticleJuice.tsx      # Instanced drift dust, water wake & transition poof bursts
│   ├── TerrainChunk.tsx       # 1,600m low-poly terrain, Rampage crags, ribbons & foliage
│   └── TriathlonCourse.tsx    # 1,600m timed course, 72m organic smoke plume & badges
├── math/
│   └── noise.ts              # Zero-dependency 2D Simplex & FBM noise generators
├── state/
│   └── gameStore.ts          # Zustand store + mutable high-frequency physics singleton
├── world/
│   ├── parkActivitiesData.ts  # Zipline curves, wildlife species & station coordinates
│   └── terrainData.ts         # 500m heightfield grid, 3D splines & O(1) barycentric lookup
├── App.tsx                   # Canvas setup & scene composition
└── main.tsx                  # React DOM entry point
```

---

## 📄 License & Credits

- **License:** MIT
- **Created by:** Quentin / [Vibrisse Studio](https://vibrisse-studio.dev/)
- Crafted with care from the Beauce region, Québec 🍁
