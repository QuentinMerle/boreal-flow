import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  TRANSITION_STATIONS,
  WILDLIFE_SPECIES,
  TOWER_BASE_X,
  TOWER_BASE_Y,
  TOWER_BASE_Z,
  TOWER_DECK_HEIGHT,
  ZIPLINE_START,
  ZIPLINE_END,
  getZiplinePoint,
} from '../world/parkActivitiesData';
import { mutablePhysics } from '../state/gameStore';

const _zipTmp = new THREE.Vector3();

/**
 * PHASE 3: Canadian Park Activities & Exploration Props
 * - Step 3.1: Contextual Wooden Trailhead Racks & Lakeside Canoe Dock Rack
 * - Step 3.2: 4 Animated Low-Poly Wildlife Biomes with acoustic sonar rings
 * - Step 3.3: Summit Firewatch Lookout Tower + 700m Zipline Cable
 */
export const ParkActivities: React.FC = () => {
  const towerWindowMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const wildlifeRefs = useRef<(THREE.Group | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const { scene: bikeGltfScene } = useGLTF('/models/mountain_bike.glb');
  const { scene: boardGltfScene } = useGLTF('/models/longboard.glb');
  const { scene: canoeGltfScene } = useGLTF('/models/canoe.glb?v=5');
  const parkedBikeScene = useMemo(() => {
    const cloned = bikeGltfScene.clone(true);
    cloned.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return cloned;
  }, [bikeGltfScene]);
  const parkedBoardScene = useMemo(() => {
    const cloned = boardGltfScene.clone(true);
    cloned.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return cloned;
  }, [boardGltfScene]);
  const parkedCanoeScene = useMemo(() => {
    const cloned = canoeGltfScene.clone(true);
    cloned.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return cloned;
  }, [canoeGltfScene]);

  // Build Zipline Tube Geometry along the 700m catenary curve
  const ziplineGeometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const p = new THREE.Vector3();
      getZiplinePoint(i / 48, p);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 64, 0.045, 6, false);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const p = mutablePhysics;

    // 1. Firewatch Tower cabin warm night glow
    if (towerWindowMatRef.current) {
      towerWindowMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.15, 2.2, p.nightFactor);
    }

    // 2. Zipline Trolley Position
    if (trolleyRef.current) {
      const activeT = p.specialState === 'ZIPLINE' ? p.ziplineT : 0.0;
      getZiplinePoint(activeT, _zipTmp);
      trolleyRef.current.position.copy(_zipTmp);
    }

    // 3. Animate 4 Low-Poly Wildlife Species + Acoustic Sonar Rings
    WILDLIFE_SPECIES.forEach((species, idx) => {
      const grp = wildlifeRefs.current[idx];
      const ring = ringRefs.current[idx];
      if (!grp) return;

      const angle = t * species.flightSpeed + idx * 1.5;
      if (species.callPattern === 'LOON') {
        // Swimming gracefully on Mirror Lake
        grp.position.set(
          species.basePos.x + Math.cos(angle) * species.flightRadius,
          species.basePos.y + Math.sin(t * 2.5) * 0.04,
          species.basePos.z + Math.sin(angle) * species.flightRadius
        );
        grp.rotation.y = -angle;
      } else if (species.callPattern === 'EAGLE') {
        // Soaring high in canyon thermals
        grp.position.set(
          species.basePos.x + Math.cos(angle) * species.flightRadius,
          species.basePos.y + Math.sin(t * 1.2) * 1.8,
          species.basePos.z + Math.sin(angle) * species.flightRadius
        );
        grp.rotation.y = -angle;
        grp.rotation.z = 0.22; // Banked wing turn
      } else if (species.callPattern === 'JAY') {
        // Hopping & fluttering between pine branches
        grp.position.set(
          species.basePos.x + Math.cos(angle) * species.flightRadius,
          species.basePos.y + Math.abs(Math.sin(t * 4.5)) * 0.9,
          species.basePos.z + Math.sin(angle) * species.flightRadius
        );
        grp.rotation.y = -angle;
      } else {
        // Owl perched on Firewatch Tower roof peak, rotating head
        grp.position.copy(species.basePos);
        grp.rotation.y = Math.sin(t * 0.8) * 1.1;
      }

      // Acoustic sonar ring pulse around birds so player can spot them visually & with binoculars
      if (ring) {
        const pulse = (t * 0.85 + idx * 0.3) % 1.0;
        ring.position.copy(grp.position);
        const s = 0.6 + pulse * 4.2;
        ring.scale.set(s, s, s);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = (1.0 - pulse) * 0.55;
      }
    });
  });

  return (
    <group>
      {/* --- STEP 3.1: Contextual Wooden Trailhead Racks --- */}
      {TRANSITION_STATIONS.map((st) => (
        <group key={st.id} position={st.position}>
          {/* Wooden Trailhead Sign & Equipment Rack */}
          <mesh castShadow position={[-1.4, 1.1, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 2.2, 6]} />
            <meshStandardMaterial color="#6c462b" flatShading />
          </mesh>
          <mesh castShadow position={[1.4, 1.1, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 2.2, 6]} />
            <meshStandardMaterial color="#6c462b" flatShading />
          </mesh>
          {/* Crossbar with pitched cedar roof cap */}
          <mesh castShadow position={[0, 1.95, 0]}>
            <boxGeometry args={[3.2, 0.28, 0.22]} />
            <meshStandardMaterial color={st.color} flatShading />
          </mesh>
          <mesh castShadow position={[0, 2.15, 0]}>
            <boxGeometry args={[3.5, 0.12, 0.55]} />
            <meshStandardMaterial color="#5c3d22" flatShading />
          </mesh>

          {/* Parked Equipment Prop (Longboard / Mountain Bike / Prospector Canoe) */}
          {st.targetMode === 'LONGBOARD' && (
            <group position={[0.35, 0.72, 0.22]} rotation={[1.28, 0.15, -0.22]}>
              <primitive object={parkedBoardScene} />
            </group>
          )}
          {st.targetMode === 'BIKE' && (
            <group position={[0, 0.02, 0.32]} rotation={[0, 1.25, 0.14]}>
              <primitive object={parkedBikeScene} />
            </group>
          )}
          {st.targetMode === 'CANOE' && (
            <group position={[0, 0.04, 0.55]} rotation={[0, 0.42, 0.12]}>
              <primitive object={parkedCanoeScene} />
            </group>
          )}
        </group>
      ))}

      {/* --- STEP 3.3: Summit Firewatch Lookout Tower --- */}
      <group position={[TOWER_BASE_X, TOWER_BASE_Y, TOWER_BASE_Z]}>
        {/* 4 Heavy Timber Support Legs */}
        {[
          [-3.2, -3.2],
          [3.2, -3.2],
          [-3.2, 3.2],
          [3.2, 3.2],
        ].map(([lx, lz], i) => (
          <mesh key={i} castShadow receiveShadow position={[lx, TOWER_DECK_HEIGHT * 0.5, lz]}>
            <cylinderGeometry args={[0.24, 0.36, TOWER_DECK_HEIGHT, 6]} />
            <meshStandardMaterial color="#6c462b" flatShading />
          </mesh>
        ))}

        {/* Observation Catwalk Deck */}
        <mesh castShadow receiveShadow position={[0, TOWER_DECK_HEIGHT, 0]}>
          <boxGeometry args={[8.8, 0.45, 8.8]} />
          <meshStandardMaterial color="#8c583a" flatShading />
        </mesh>

        {/* Wooden Safety Railings around Deck */}
        {[
          [0, TOWER_DECK_HEIGHT + 0.9, -4.2, 8.6, 0.15, 0.15],
          [0, TOWER_DECK_HEIGHT + 0.9, 4.2, 8.6, 0.15, 0.15],
          [-4.2, TOWER_DECK_HEIGHT + 0.9, 0, 0.15, 0.15, 8.6],
          [4.2, TOWER_DECK_HEIGHT + 0.9, 0, 0.15, 0.15, 8.6],
        ].map(([x, y, z, w, h, d], i) => (
          <mesh key={i} castShadow position={[x, y, z]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#a47148" flatShading />
          </mesh>
        ))}

        {/* Lookout Cabin Core */}
        <mesh castShadow receiveShadow position={[0, TOWER_DECK_HEIGHT + 1.6, 0]}>
          <boxGeometry args={[5.2, 2.8, 5.2]} />
          <meshStandardMaterial color="#7f4f24" flatShading />
        </mesh>

        {/* Warm Emissive Panoramic Windows */}
        <mesh position={[0, TOWER_DECK_HEIGHT + 1.85, 0]}>
          <boxGeometry args={[5.32, 1.25, 5.32]} />
          <meshStandardMaterial
            ref={towerWindowMatRef}
            color="#ffd166"
            emissive="#ff9f1c"
            emissiveIntensity={0.4}
            flatShading
          />
        </mesh>

        {/* Pyramid Cedar Roof */}
        <mesh castShadow position={[0, TOWER_DECK_HEIGHT + 4.1, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[4.8, 2.4, 4]} />
          <meshStandardMaterial color="#bc4749" flatShading />
        </mesh>
      </group>

      {/* --- 700m Zipline Cable, Anchor Posts & Pulley Trolley --- */}
      <mesh geometry={ziplineGeometry}>
        <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Lakeside Zipline Landing Anchor Post */}
      <mesh
        castShadow
        position={[ZIPLINE_END.x, ZIPLINE_END.y - 1.6, ZIPLINE_END.z]}
      >
        <cylinderGeometry args={[0.22, 0.28, 4.2, 6]} />
        <meshStandardMaterial color="#6c462b" flatShading />
      </mesh>

      {/* Zipline Trolley Handle */}
      <group ref={trolleyRef} position={ZIPLINE_START}>
        <mesh castShadow>
          <boxGeometry args={[0.35, 0.25, 0.55]} />
          <meshStandardMaterial color="#ef476f" flatShading />
        </mesh>
        <mesh position={[0, -0.45, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 5]} />
          <meshStandardMaterial color="#e2e8f0" flatShading />
        </mesh>
      </group>

      {/* --- STEP 3.2: 4 Animated Low-Poly Wildlife Biomes --- */}
      {WILDLIFE_SPECIES.map((w, idx) => (
        <React.Fragment key={w.id}>
          <group
            ref={(el) => {
              wildlifeRefs.current[idx] = el;
            }}
            position={w.basePos}
          >
            {/* Bird Body */}
            <mesh castShadow>
              <dodecahedronGeometry args={[0.42, 0]} />
              <meshStandardMaterial color={w.color} flatShading />
            </mesh>
            {/* Bird Wings / Crest */}
            <mesh castShadow position={[0, 0.08, 0]}>
              <boxGeometry
                args={[
                  w.callPattern === 'EAGLE' ? 2.2 : 1.1,
                  0.1,
                  0.38,
                ]}
              />
              <meshStandardMaterial color={w.accentColor} flatShading />
            </mesh>
            {/* Beak */}
            <mesh position={[0, 0.05, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.12, 0.32, 4]} />
              <meshStandardMaterial color="#fbbf24" flatShading />
            </mesh>
          </group>

          {/* Acoustic Visual Sonar Pulse Ring */}
          <mesh
            ref={(el) => {
              ringRefs.current[idx] = el;
            }}
            position={w.basePos}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.85, 1.0, 16]} />
            <meshBasicMaterial
              color={w.accentColor}
              side={THREE.DoubleSide}
              transparent
              opacity={0.4}
            />
          </mesh>
        </React.Fragment>
      ))}
    </group>
  );
};
