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
git clone https://github.com/vibrisse-studio/boreal-flow.git
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
| **`E`** | **Contextual Action:** Equipment racks, sit by the campfire, hook onto zipline, latch onto rock crag |
| **`C` / `F`** | **Non-Verbal Emote:** Double brass bike bell (`BIKE`) or warm *Journey* harmonic chime + hand wave |
| **`B`** | **Acoustic Binoculars:** Optic zoom (`FOV 16°`) to scan and log wildlife species |
| **`N`** | Toggle Day / **Night** (automatic player headlamp + illuminated base camp) |
| **`R`** | Respawn at chosen location |

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

### Phase 2 — Living Nature, Day/Night Cycle & Procedural ASMR (Completed ✅)
- [x] Instanced pines, mossy boulders, and wind-swayed alpine grass tufts.
- [x] 4-palette dynamic day/night cycle (Dawn, Noon, Golden Hour, Night) with orbiting sun & moon discs.
- [x] Automatic player front `SpotLight` (headlamp) and illuminated lakeside expedition tent & campfire.
- [x] 100% native Web Audio API soundscape (altitude wind, urethane roll hum, gravel crunch, paddle splash).

### Phase 3 — Canadian Park Exploration & Expressive Rig (Completed ✅)
- [x] Procedural 7-joint character rig: head turns into curves, curiosity glance at POIs, aero tuck crouch, wind scarf flutter.
- [x] Contextual trailhead racks & dock transitions with low-poly "Poof" cloud bursts.
- [x] 3D spatialized birdwatching (Common Loon, Stellar Blue Jay, Bald Eagle, Great Horned Owl).
- [x] Binoculars viewfinder mode (`FOV 16°`) with interactive field notebook (`📓 WILDLIFE 0/4`).
- [x] Bouldering cliff face with circular `GRIP` stamina ring, Summit Firewatch Tower, and 340m steel Zipline.

### Phase 4 — Cozy Social Hub & Multiplayer (In Progress ⏳)
- [x] **Step 4.2:** Non-verbal emotes (double-strike brass bike bell, warm vocal chime, waving hand) and *"Sit by the Campfire"* state with intimate telephoto camera zoom (`FOV 32°`) and ember crackle.
- [ ] **Step 4.1:** Lightweight 15Hz WebSocket state synchronization with client-side `lerp`/`slerp` dead reckoning.
- [ ] **Bonus Activity:** Lakeside skipping stones mini-game with multi-bounce water physics and concentric ripples.

---

## 📂 Project Structure

```
src/
├── audio/
│   └── soundscape.ts         # Native Web Audio API procedural sound engine
├── components/
│   ├── ArcadeController.tsx   # Multi-mode kinematic sphere & 7-joint character rig
│   ├── DayNightAtmosphere.tsx # 4-palette lighting, orbiting celestial bodies & starfield
│   ├── DioramaCamera.tsx      # Damped spring follow camera & binoculars optics
│   ├── HudOverlay.tsx         # Zero-rerender DOM telemetry, notebook & stamina ring
│   ├── ParkActivities.tsx     # Firewatch tower, bouldering crag, 340m zipline & wildlife
│   ├── ParticleJuice.tsx      # Instanced drift dust, water wake & transition poof bursts
│   └── TerrainChunk.tsx       # Low-poly terrain mesh, smooth ribbons & instanced foliage
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
