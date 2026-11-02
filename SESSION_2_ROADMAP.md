# Boreal Flow — Session 2 Specification & Architecture Roadmap

> **Branch:** `feature/session-2-diorama-gameplay`  
> **Repository:** [https://github.com/QuentinMerle/boreal-flow](https://github.com/QuentinMerle/boreal-flow)  
> **Focus:** Diorama aesthetic polish, Blender MCP pipeline, 2.5D isometric icon factory, analog gamepad feel, zero-HUD gameplay loop, and on-device local AI.

---

## 1. Executive Summary & Core Evolution

In Session 1, we established the **287 kB procedural proof-of-concept**: $O(1)$ heightfield physics, 4 movement states (`WALK`, `LONGBOARD`, `BIKE`, `CANOE`), procedural audio synthesis, day/night cycles, and basic articulated rig.

In Session 2, we elevate this technical foundation into an **authentic, tactile indie game experience**:
1. **From Primitives to "Diorama Clay" Assets:** Transitioning select procedural meshes to low-poly `.glb` models generated via **Blender MCP**, optimized via `meshopt`, sharing a single 32x32 color palette atlas and styled with warm, clay-like matte materials (`roughness: 0.9`).
2. **2.5D Isometric Icon Factory:** An automated pipeline (Blender MCP dimetric 2:1 camera $\to$ Eevee 48x48 sans-AA $\to$ ColorRamp 3 tones $\to$ 1px black outline $\to$ SVG `<feComponentTransfer>` palette swap).
3. **Lonely Mountains Terrain Stamping & Map Scale Upgrade:** Doubling the slope to a **1,000m canyon descent** with analytical $O(1)$ elevation, while carving technical VTT singletrack shortcuts through pine forests, fallen tree hurdle jumps, and an organic river canyon beneath the $Y=0$ water plane.
4. **Physical Game Feel & Xbox Controller:** Native Bluetooth Gamepad API integration with analog triggers, deadzones, and dual-rumble haptic feedback (`vibrationActuator`).
5. **Zero-HUD Gameplay Loop ("Le But sans le Stress"):**
   - **Boreal Triathlon:** Summit to lake shore marked by a smoke plume above the canopy.
   - **Scarf Ghost ("Fantôme d'Écharpe"):** Pre-allocated `Float32Array(900 * 5)` ghost run recorder in `localStorage`.
   - **Ranger Missions:** Auditory landmarks and ridge beacon lighting.
6. **Local On-Device AI (Transformers.js in Web Worker):**
   - Push-to-talk Walkie-Talkie on CPU Wasm (`whisper-tiny` ~40MB) driving diegetic in-game reactions without cloud latency.
   - Telegraphic campfire telemetry field notes.

---

## 2. Antigravity Model Selection Strategy

To maximize architectural depth and code reliability while preserving AI quotas:

| Model | Recommended Tasks | Key Strengths |
| :--- | :--- | :--- |
| **Gemini 4 Argon (High)** | • Complex 3D math & physics ($O(1)$ heightfield, CatmullRom splines, orthonormal basis matrices)<br>• Custom GLSL vertex shaders (`onBeforeCompile`)<br>• Blender MCP Python procedural modeling scripts (`bmesh`)<br>• Large multi-file architectural refactorings & engine core changes | Deep reasoning, zero-shot mathematical accuracy, robust spatial logic. |
| **Gemini 3.8 Flash (High)** | • Rapid gameplay feel tuning (friction constants, camera spring damping)<br>• Gamepad API event listeners & input deadzone mapping<br>• HUD overlay styling & DOM direct telemetry updates<br>• Git commits, branch management & roadmap documentation tracking<br>• Scoped bugfixes & quota conservation | Ultra-fast execution, minimal quota burn, high code precision on focused edits. |

---

## 3. Architecture Diagram (Session 2 Target)

```mermaid
flowchart TD
  subgraph InputLayer["Input & Controllers"]
    KB["Keyboard WASD / Arrows"]
    Pad["Xbox Bluetooth Gamepad (navigator.getGamepads)"]
    Mic["Push-to-Talk Mic ('R')"]
  end

  subgraph WorkerLayer["Web Worker (CPU / Wasm)"]
    Whisper["Transformers.js (whisper-tiny q4)"]
    LogGen["Campfire Telemetry Log Generator"]
  end

  subgraph R3FScene["Three.js / R3F Engine (< 50 Draw Calls)"]
    Terrain["Analytical O(1) Stamped Terrain (1,000m)"]
    Ribbons["Smooth Road & Trail Spline Ribbons"]
    Instanced["InstancedMesh (1,500 Pines, Rocks, Fallen Logs)"]
    DioramaRig["Segmented Toy Rig (Character & Vehicles)"]
    Lighting["Hemisphere + Golden Directional + N8AO"]
    Camera["Hybrid Camera (TPS Damp -> FPS Action / V Cockpit)"]
  end

  subgraph PhysicsAudio["Physical & Audio Engine (Zero Alloc 60Hz)"]
    Physics["MutablePhysics (Barycentric Normal, Grip, Gravity)"]
    Ghost["Scarf Ghost Replay (Float32Array in localStorage)"]
    Audio["WebAudio Procedural Soundscape + 3D Stereo Panners"]
    Haptics["Gamepad Vibration Actuator"]
  end

  InputLayer --> Physics
  Mic --> Whisper
  Whisper -.->|Diegetic command| Physics
  Physics --> Terrain
  Physics --> DioramaRig
  Physics --> Camera
  Physics --> Audio
  Physics --> Haptics
  Physics --> Ghost
  Instanced --> Lighting
  Ribbons --> Lighting
  DioramaRig --> Lighting
```

---

## 4. Detailed Work Packages

### WP 1 — 2.5D Isometric Icon Factory ("Usine à Icônes++")
- [ ] **Blender MCP Render Studio:**
  - Orthographic camera with dimetric 2:1 angle: Euler rotation `(X: 60°, Y: 0°, Z: 45°)`.
  - Resolution: `48x48px`, Eevee engine with anti-aliasing disabled (`filter_size = 0.01px`), Color Management set to `Standard`.
  - Custom material node setup: `Shader to RGB` $\to$ `ColorRamp` in `CONSTANT` mode (3 crisp luminance values).
- [ ] **Post-Processing & Spritesheet Builder:**
  - Python / Canvas script generating a 1px solid black contour (`#181425`) using 4-connectivity edge detection.
  - Horizontal spritesheet assembly of 12 frames (`576x48px`).
- [ ] **Web / CSS Integration:**
  - CSS keyframe animation using `steps(11)` forward/backward on `:hover`.
  - Real-time SVG palette swapping via `<filter id="palette-swap"><feComponentTransfer>...`:
    - Base state: Pocket Ink monochrome.
    - Hover state: Vibrant Cinnabar / Cerulean / Goldenrod themes.

### WP 2 — Art Direction & Low-Poly "Diorama Clay" Assets
- [ ] **Asset Pipeline via Blender MCP $\to$ `.glb` (Meshopt compressed):**
  - `vehicles.glb`:
    - **Mountain Bike:** Independent objects for `Frame`, `Fork_Handlebars`, `Wheel_Front`, `Wheel_Rear` centered at origin for zero-cost procedural rotation and steering.
    - **Longboard:** Drop-through deck, trucks, 4 urethane wheels.
    - **Canoe:** Classic prospector hull + separate wooden paddle.
  - `nature-pack.glb`:
    - **Boreal Pines:** 3 stacked, slightly twisted 8-sided cone clusters with faceted trunks.
    - **Rocks / Boulders:** Low-poly icospheres with `Decimate (0.3)` and flat shading.
    - **Deadfall / Fallen Logs:** Lichen-covered trunks laying across slopes and forest corridors for obstacle jumping.
  - `landmarks.glb`: Firewatch tower structure, A-frame tent, wooden docks, bird models.
  - `character.glb`: Segmented Toy Rig (8 capsule/box primitives with articulated joints, zero skeletal skinning overhead).
- [ ] **Color Palette & Lighting Recipe:**
  - Single shared material across props with `roughness: 0.9` (tactile clay feel, zero plastic specular shine).
  - 32x32px Palette Atlas texture for instant global color grading without re-exporting 3D meshes.
  - Lighting setup:
    - `<hemisphereLight skyColor="#ffeed2" groundColor="#4d532a" intensity={0.6} />` (warm colored ambient shadows).
    - Low-angle Golden Hour directional sunlight with soft shadow bias.
    - `<N8AO aoSamples={6} halfRes />` from `@react-three/postprocessing` for contact shadows beneath wheels, boots, and trees.

### WP 3 — Terrain Stamping 2D & Map Scale Upgrade (1,000m Canyon Corridor)
- [ ] **Map Scaling Architecture (Zero-Performance-Cost Upgrade):**
  - **Dimensions:** Width $400\text{m}$ (canyon framing), Length $1,000\text{m}$ ($Z = -500$ to $+500$), Summit elevation $\approx 120\text{m}$ descending to lake at $0\text{m}$.
  - **Grid Resolution:** $2.5\text{m}$ cell pitch ($\approx 130\text{k}$ low-poly triangles in a single non-indexed BufferGeometry).
  - **Vegetation Population:** Scaled to 1,500 instanced pines + 3,500 grass tufts (still rendered in a single draw call).
  - **Shadow Cost:** Exactly zero additional GPU load because the directional shadow camera follows the player in a fixed $150\text{m}$ frustum.
  - **Run Length:** Upgrades run time from 40s to a satisfying **2 to 3-minute continuous flow state descent**.
- [ ] **Spline Stamping & Shortcuts:**
  - **Main Asphalt Road:** Width $7\text{m}$ ($d < 3.5\text{m}$), automatically clears vegetation, extrudes smooth dark ribbon (`#222428`) with dashed yellow centerline and occasional fallen log obstacles.
  - **VTT Singletracks:** Narrow corridors ($d < 1.5\text{m}$) cutting through tree groves between road hairpins, painted ochre dirt, preserving Simplex roller undulations with natural jump kickers at exits.
  - **Canoe River Canyon:** Sub-$Y=0$ winding canyon channel flowing into the lake with an active flow vector driving canoe glide.
  - **Surface friction lookup:** `getSurfaceType(x, z)` enforcing optimal performance per vehicle.

### WP 4 — Analog Gamepad Feel & Hybrid Camera
- [x] **Bluetooth Gamepad Integration (`navigator.getGamepads`):**
  - Analog steering with deadzone (`0.12`).
  - Analog triggers: RT for progressive acceleration / pedaling cadence, LT for progressive braking and powerslide initiate.
  - Button A for bunny-hops, ollies, and bouldering dynos.
  - Full button map: X (Action), Y/RB (Bell & Wave Emote), LB (Binoculars), Back (Respawn), Start (Day/Night), R3/L3 (Cockpit mode toggle), D-Pad (Mode select).
  - Haptic feedback via `gamepad.vibrationActuator`:
    - Continuous granular micro-rumble on dirt/gravel surfaces & powerslides.
    - Sharp impulse on landing squash or obstacle collisions.
    - Double pulse on bell chime and actions.
- [x] **Hybrid Camera Controller:**
  - Dynamic 3rd person follow camera (TPS) with damped springs during motion.
  - Smooth lerp to stationary contemplation camera when stopped (`speed < 0.8` for $> 1.2\text{s}$) with lower height and upward gaze towards forest canopy.
  - First-person / Handlebars Cockpit camera (Toggle `V` or Gamepad `R3/L3`) with locked roll horizon (zero roll nausea) and wide 56° downhill FOV.
  - HUD integration: Gamepad connection badge (`🎮 GAMEPAD READY`), View toggle button (`🎥 View (V)`), and updated controls guide.

### WP 5 — Zero-HUD Gameplay Loop ("Le But sans le Stress")
- [x] **The Boreal Triathlon & Diegetic Smoke Plume (Completed ✅):**
  - Summit trailhead departure arch ($Z = -188$) to lake arrival arch ($Z = 106$).
  - Visible diegetic landmark: 50m vertical column of white campfire smoke rising above the forest canopy with natural wind sway and golden hour tint.
  - Complete freedom of route: automatic multi-sport chaining tracking (`Longboard`, `Bike`, `Canoe`).
  - Automated run timing and tier badges: 🍁 **Feuille d'Érable** (Gold $< 50\text{s}$), 🪶 **Plume de Geai** (Silver $< 75\text{s}$), 🦌 **Bois d'Orignal** (Bronze).
  - Triumphant pentatonic finish fanfare, gamepad haptic celebration, personal best persistence in `localStorage`.
- [ ] **Scarf Ghost System ("Fantôme d'Écharpe"):**
  - Pre-allocated `Float32Array(900 * 5)` telemetry recorder (recording position, yaw, and mode at 5Hz).
  - Persistent storage in `localStorage` for personal best replay.
  - Translucent golden silhouette and fluttering scarf rendering the ghost.
  - Carved wooden trailhead finish board displaying rankings (Maple Leaf, Jay Feather, Moose Antlers).
- [ ] **Ranger Field Activities:**
  - Auditory navigation via spatialized `StereoPannerNode` beacons.
  - Lighting hilltop beacon braziers.
  - Wildlife identification and field notebook completion.

### WP 6 — Local On-Device AI (Transformers.js in Web Worker)
- [ ] **Isolated Web Worker (`radio.worker.ts`):**
  - Runs exclusively on CPU using WebAssembly (`device: 'wasm'`, `dtype: 'q4'`), preserving 100% GPU bandwidth for WebGL/Three.js.
  - Models: `whisper-tiny` (~40MB) for audio transcription.
- [ ] **Diegetic Walkie-Talkie (Push-to-Talk 'R'):**
  - Web Audio API procedural static burst and bandpass radio filter.
  - Spoken queries trigger in-world reactions (distant loon echo pointing to lake, tower lantern flash in fog, solar timelapse).
- [ ] **Campfire Telemetry Logbook:**
  - Telegraphic, impressionistic summary generated at run completion based on physical telemetry (max speed, vehicles used, airtime, weather, animals encountered).

### WP 7 — The 4 Performance Commandments ("Mac Glacé" 120 FPS)
1. **Zero Allocations in `useFrame`:** Pre-allocate module-scoped scratch vectors; no `new THREE.Vector3()` or `.clone()` in animation frames.
2. **Asset Compression:** Process all `.glb` exports through `gltf-transform optimize --compress meshopt`.
3. **Selective Shadows:** Restrict `castShadow` to pines, player, and large rocks; implement simple projected blob shadows beneath vehicle wheels.
4. **Draw Call Budget:** Monitor with `<Perf />` (`r3f-perf`) to strictly maintain $< 50$ draw calls.

---

## 5. Implementation Steps Order of Attack

```mermaid
sequenceDiagram
  autonumber
  actor Dev as Developer
  participant Git as Git Repo
  participant Core as Input & Camera (Gamepad + Hybrid)
  participant 3D as Blender MCP & Diorama Assets
  participant World as 1,000m Stamped Terrain & Shortcuts
  participant Game as Ghost & Triathlon Loop
  participant AI as Local Wasm Worker

  Dev->>Git: Branch feature/session-2-diorama-gameplay
  Dev->>Core: 1. Gamepad API (Analog triggers, deadzone, haptics) + Hybrid TPS/FPS Cam
  Dev->>World: 2. Upgrade Map to 1,000m Canyon + Stamped Shortcuts & Logs
  Dev->>3D: 3. Blender MCP Diorama Pack (.glb models + Palette Atlas + N8AO)
  Dev->>Game: 4. Triathlon Finish Smoke & Scarf Ghost (Float32Array)
  Dev->>AI: 5. Radio Worker (Transformers.js Whisper-tiny on CPU)
```
