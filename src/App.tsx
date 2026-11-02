import React from 'react';
import { Canvas } from '@react-three/fiber';
import { TerrainChunk } from './components/TerrainChunk';
import { ParkActivities } from './components/ParkActivities';
import { DioramaCamera } from './components/DioramaCamera';
import { ArcadeController } from './components/ArcadeController';
import { ParticleJuice } from './components/ParticleJuice';
import { DayNightAtmosphere } from './components/DayNightAtmosphere';
import { HudOverlay } from './components/HudOverlay';

export const App: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.5, far: 650, position: [0, 92, -235] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        {/* Step 2.2: Dynamic 4-Palette Day/Night Cycle, Orbiting Sun/Moon & Starfield */}
        <DayNightAtmosphere />

        {/* Step 1.1 & 2.1: 500m Mountain Slope, Splines, Wind-Swaying Foliage & Night Base Camp */}
        <TerrainChunk />

        {/* Step 3.1, 3.2 & 3.3: Racks, Wildlife Emitters, Firewatch Tower, Bouldering Crag & Zipline */}
        <ParkActivities />

        {/* Step 1.2 & 3.2: Damped Spring Diorama Camera + Binoculars Zoom Scanner */}
        <DioramaCamera />

        {/* Step 1.3, 2.2, 2.3 & Phase 3: Articulated Rig, Climbing, Zipline & Web Audio ASMR */}
        <ArcadeController />

        {/* Step 1.4 & 3.1: Instanced Drift Dust, Water Foam Wake & Transition Poof Burst */}
        <ParticleJuice />
      </Canvas>

      {/* Minimalist HUD, Wildlife Notebook, Stamina Ring & Telemetry */}
      <HudOverlay />
    </div>
  );
};

export default App;
