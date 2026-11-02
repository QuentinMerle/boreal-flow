import React, { useEffect, useRef } from 'react';
import {
  useGameStore,
  mutablePhysics,
  PHYSICS_PRESETS,
  MovementMode,
  TimePreset,
  triggerPlayerEmote,
} from '../state/gameStore';
import { WILDLIFE_SPECIES } from '../world/parkActivitiesData';
import { soundscape } from '../audio/soundscape';

const MODES: MovementMode[] = ['WALK', 'LONGBOARD', 'BIKE', 'CANOE'];

export const HudOverlay: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const timeCyclePaused = useGameStore((s) => s.timeCyclePaused);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const binocularsActive = useGameStore((s) => s.binocularsActive);
  const discoveredBirds = useGameStore((s) => s.discoveredBirds);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);

  const setMode = useGameStore((s) => s.setMode);
  const respawnAt = useGameStore((s) => s.respawnAt);
  const setTimePreset = useGameStore((s) => s.setTimePreset);
  const toggleTimePause = useGameStore((s) => s.toggleTimePause);
  const toggleAudioMute = useGameStore((s) => s.toggleAudioMute);
  const toggleBinoculars = useGameStore((s) => s.toggleBinoculars);
  const toggleCameraMode = useGameStore((s) => s.toggleCameraMode);

  const speedDomRef = useRef<HTMLSpanElement>(null);
  const surfaceDomRef = useRef<HTMLSpanElement>(null);
  const badgeDomRef = useRef<HTMLSpanElement>(null);
  const altitudeDomRef = useRef<HTMLSpanElement>(null);
  const clockDomRef = useRef<HTMLSpanElement>(null);
  const headlampDomRef = useRef<HTMLSpanElement>(null);
  const promptDomRef = useRef<HTMLDivElement>(null);
  const staminaWrapRef = useRef<HTMLDivElement>(null);
  const staminaCircleRef = useRef<SVGCircleElement>(null);
  const binoTargetRef = useRef<HTMLDivElement>(null);
  const binoBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    const circumference = 2 * Math.PI * 22;

    const updateTelemetry = () => {
      const p = mutablePhysics;
      if (speedDomRef.current) {
        const kmh = Math.round(p.speed * 2.4);
        speedDomRef.current.textContent = `${kmh}`;
      }
      if (surfaceDomRef.current) {
        surfaceDomRef.current.textContent =
          p.specialState !== 'NONE' ? p.specialState : p.surface;
      }
      if (altitudeDomRef.current) {
        altitudeDomRef.current.textContent = `${Math.max(0, Math.round(p.position.y))}m`;
      }
      if (clockDomRef.current) {
        const hrs = Math.floor(p.timeOfDay) % 24;
        const mins = Math.floor((p.timeOfDay % 1) * 60);
        const hStr = String(hrs).padStart(2, '0');
        const mStr = String(mins).padStart(2, '0');
        clockDomRef.current.textContent = `${hStr}:${mStr}`;
      }
      if (headlampDomRef.current) {
        headlampDomRef.current.style.display = p.headlampOn ? 'inline-block' : 'none';
      }
      if (promptDomRef.current) {
        if (p.contextPrompt) {
          promptDomRef.current.textContent = p.contextPrompt;
          promptDomRef.current.style.opacity = '1';
          promptDomRef.current.style.transform = 'translate(-50%, 0)';
        } else {
          promptDomRef.current.style.opacity = '0';
          promptDomRef.current.style.transform = 'translate(-50%, 8px)';
        }
      }
      if (staminaWrapRef.current && staminaCircleRef.current) {
        const showStamina = p.specialState === 'CLIMBING' || p.stamina < 0.99;
        staminaWrapRef.current.style.opacity = showStamina ? '1' : '0';
        const offset = circumference * (1 - p.stamina);
        staminaCircleRef.current.style.strokeDashoffset = `${offset}`;
        staminaCircleRef.current.style.stroke =
          p.stamina > 0.35 ? '#06d6a0' : '#ef476f';
      }
      if (binoTargetRef.current && binoBarRef.current) {
        const species = WILDLIFE_SPECIES.find((w) => w.id === p.targetedBirdId);
        if (species) {
          binoTargetRef.current.textContent = `🎯 ${species.name} (${species.frenchName}) — ${species.biome}`;
          binoBarRef.current.style.width = `${Math.round(p.scanProgress * 100)}%`;
        } else {
          binoTargetRef.current.textContent =
            'Scan the Lake, Eastern Pines, Western Canyon, or Firewatch Tower Roof...';
          binoBarRef.current.style.width = '0%';
        }
      }
      if (badgeDomRef.current) {
        if (p.specialState === 'CAMPFIRE') {
          badgeDomRef.current.textContent = 'COZY FIRE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.specialState === 'ZIPLINE') {
          badgeDomRef.current.textContent = 'ZIPLINE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.specialState === 'CLIMBING') {
          badgeDomRef.current.textContent = 'BOULDERING';
          badgeDomRef.current.style.opacity = '1';
        } else if (!p.isGrounded) {
          badgeDomRef.current.textContent = 'AIRBORNE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.isDrifting) {
          badgeDomRef.current.textContent = 'POWERSLIDE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.isPumping) {
          badgeDomRef.current.textContent = 'CARVE PUMP';
          badgeDomRef.current.style.opacity = '1';
        } else {
          badgeDomRef.current.style.opacity = '0';
        }
      }
      rafId = requestAnimationFrame(updateTelemetry);
    };
    rafId = requestAnimationFrame(updateTelemetry);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const activePreset = PHYSICS_PRESETS[mode];

  const handleTimePreset = (preset: TimePreset) => {
    soundscape.init();
    setTimePreset(preset);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 24px',
        color: '#f4f1ea',
      }}
    >
      {/* Step 3.2: Binoculars Viewfinder Vignette & Acoustic Scanner */}
      {binocularsActive && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            boxShadow: 'inset 0 0 0 95px rgba(10, 16, 15, 0.88)',
            borderRadius: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '210px',
              height: '210px',
              borderRadius: '50%',
              border: '2px dashed rgba(255, 209, 102, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#ffd166',
              }}
            />
          </div>

          <div
            style={{
              marginTop: '20px',
              background: 'rgba(15, 23, 22, 0.9)',
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 209, 102, 0.4)',
              textAlign: 'center',
              minWidth: '340px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#ffd166', fontWeight: 800, letterSpacing: '0.1em' }}>
              🔭 ACOUSTIC BINOCULARS (Use WASD / Arrows to Aim • Press B to Exit)
            </div>
            <div ref={binoTargetRef} style={{ fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>
              Scan the Lake, Pines, Canyon, or Firewatch Tower...
            </div>
            <div
              style={{
                height: '5px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '3px',
                marginTop: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                ref={binoBarRef}
                style={{
                  height: '100%',
                  width: '0%',
                  background: '#06d6a0',
                  transition: 'width 0.08s linear',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3.3: Bouldering Stamina Ring */}
      <div
        ref={staminaWrapRef}
        style={{
          position: 'fixed',
          top: '50%',
          left: '56%',
          transform: 'translate(-50%, -50%)',
          opacity: 0,
          transition: 'opacity 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="28"
            cy="28"
            r="22"
            stroke="rgba(20, 29, 27, 0.75)"
            strokeWidth="6"
            fill="rgba(20, 29, 27, 0.55)"
          />
          <circle
            ref={staminaCircleRef}
            cx="28"
            cy="28"
            r="22"
            stroke="#06d6a0"
            strokeWidth="5"
            strokeDasharray={2 * Math.PI * 22}
            strokeDashoffset="0"
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            background: 'rgba(20,29,27,0.85)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: '#06d6a0',
          }}
        >
          GRIP
        </span>
      </div>

      {/* Contextual Interaction Prompt Pill */}
      <div
        ref={promptDomRef}
        style={{
          position: 'fixed',
          bottom: '112px',
          left: '50%',
          transform: 'translate(-50%, 8px)',
          opacity: 0,
          transition: 'all 0.16s ease',
          background: 'rgba(20, 29, 27, 0.92)',
          border: '1px solid #ffd166',
          color: '#fffbeb',
          padding: '10px 20px',
          borderRadius: '999px',
          fontWeight: 800,
          fontSize: '14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      />

      {/* Top Bar: Title, Wildlife Field Notebook & Teleports */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'rgba(20, 29, 27, 0.78)',
              backdropFilter: 'blur(8px)',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#a3b8b0',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Phase 4.2 • Cozy Campfire & Emotes</span>
              <span
                style={{
                  background: gamepadConnected ? '#06d6a0' : 'rgba(255,255,255,0.08)',
                  color: gamepadConnected ? '#141d1b' : '#7c8f88',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  transition: 'all 0.2s ease',
                }}
              >
                {gamepadConnected ? '🎮 GAMEPAD READY' : '⌨️ KEYBOARD'}
              </span>
              <span
                ref={headlampDomRef}
                style={{
                  background: '#ffd166',
                  color: '#141d1b',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 800,
                  display: 'none',
                }}
              >
                🔦 HEADLAMP ON
              </span>
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 800,
                marginTop: '2px',
                display: 'flex',
                alignItems: 'baseline',
                gap: '10px',
              }}
            >
              <span>BOREAL FLOW</span>
              <span
                ref={clockDomRef}
                style={{
                  fontSize: '14px',
                  fontVariantNumeric: 'tabular-nums',
                  color: '#ffd166',
                  fontWeight: 700,
                }}
              >
                17:30
              </span>
            </div>
          </div>

          {/* Step 3.2 & 4.2: Wildlife Notebook + Emote Bell Button */}
          <div
            style={{
              background: 'rgba(20, 29, 27, 0.78)',
              backdropFilter: 'blur(8px)',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '4px',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffd166' }}>
                📓 WILDLIFE ({discoveredBirds.length}/{WILDLIFE_SPECIES.length})
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => {
                    soundscape.init();
                    triggerPlayerEmote();
                  }}
                  style={{
                    background: 'rgba(255, 209, 102, 0.2)',
                    color: '#ffd166',
                    border: '1px solid rgba(255, 209, 102, 0.5)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'BIKE' ? '🔔 Bike Bell (C)' : '👋 Chime / Wave (C)'}
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleCameraMode();
                  }}
                  style={{
                    background: cameraMode === 'COCKPIT' ? '#ff9b54' : 'rgba(255,255,255,0.12)',
                    color: cameraMode === 'COCKPIT' ? '#141d1b' : '#f4f1ea',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {cameraMode === 'COCKPIT' ? '🎥 Cockpit (V)' : '🎥 Diorama (V)'}
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleBinoculars();
                  }}
                  style={{
                    background: binocularsActive ? '#ffd166' : 'rgba(255,255,255,0.12)',
                    color: binocularsActive ? '#141d1b' : '#f4f1ea',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔭 Binoculars (B)
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {WILDLIFE_SPECIES.map((w) => {
                const found = discoveredBirds.includes(w.id);
                return (
                  <span
                    key={w.id}
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '5px',
                      background: found ? 'rgba(6, 214, 160, 0.22)' : 'rgba(255,255,255,0.06)',
                      color: found ? '#06d6a0' : '#7c8f88',
                      border: `1px solid ${found ? '#06d6a066' : 'transparent'}`,
                      fontWeight: 600,
                    }}
                  >
                    {found ? `✓ ${w.frenchName}` : '???'}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Controls: Drop-In Teleports + Day/Night Palettes */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('CAMPFIRE_HUB', 'WALK');
              }}
              style={teleportBtnStyle('#ff9f1c')}
            >
              🔥 Sit by Campfire
            </button>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('FIREWATCH_TOWER', 'WALK');
              }}
              style={teleportBtnStyle('#ffd166')}
            >
              🗼 Firewatch Tower
            </button>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('SUMMIT_ROAD', 'LONGBOARD');
              }}
              style={teleportBtnStyle('#eb5e46')}
            >
              ⛰️ Summit Road (Longboard)
            </button>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('SUMMIT_TRAIL', 'BIKE');
              }}
              style={teleportBtnStyle('#52b788')}
            >
              🌲 Singletrack (VTT)
            </button>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('LAKE_SHORE', 'CANOE');
              }}
              style={teleportBtnStyle('#4ea8de')}
            >
              🛶 Mirror Lake
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => handleTimePreset('DAWN')} style={smallPillStyle('#e8a598')}>
              🌅 Dawn
            </button>
            <button onClick={() => handleTimePreset('NOON')} style={smallPillStyle('#8ecae6')}>
              ☀️ Noon
            </button>
            <button onClick={() => handleTimePreset('GOLDEN')} style={smallPillStyle('#ff9b54')}>
              🌇 Golden Hour
            </button>
            <button onClick={() => handleTimePreset('NIGHT')} style={smallPillStyle('#7ca5d8')}>
              🌙 Night (N)
            </button>
            <button onClick={toggleTimePause} style={smallPillStyle('#a3b8b0')}>
              {timeCyclePaused ? '▶️ Resume Sun' : '⏸️ Hold Sky'}
            </button>
            <button
              onClick={() => {
                soundscape.init();
                toggleAudioMute();
              }}
              style={smallPillStyle(audioMuted ? '#ef476f' : '#52b788')}
            >
              {audioMuted ? '🔇 Muted' : '🔊 ASMR'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Mode Switcher & Speedometer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {MODES.map((m) => {
              const preset = PHYSICS_PRESETS[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    soundscape.init();
                    setMode(m, true);
                  }}
                  style={{
                    background: active ? preset.accentColor : 'rgba(20, 29, 27, 0.78)',
                    color: active ? '#141d1b' : '#f4f1ea',
                    border: `1px solid ${active ? preset.accentColor : 'rgba(255,255,255,0.12)'}`,
                    padding: '10px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      background: active ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)',
                      color: active ? '#fff' : '#cbd5e1',
                      padding: '2px 6px',
                      borderRadius: '5px',
                      fontSize: '11px',
                    }}
                  >
                    {preset.keyHint}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              background: 'rgba(20, 29, 27, 0.78)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '11.5px',
              color: '#c2d1cb',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div>
              <strong>WASD / ZQSD:</strong> Steer & Throttle • <strong>V:</strong> Cockpit / Diorama •{' '}
              <strong>C / F:</strong> Bell / Wave • <strong>E:</strong> Campfire / Zipline •{' '}
              <strong>B:</strong> Binoculars • <strong>Space:</strong> Hop / Powerslide
            </div>
            <div style={{ color: gamepadConnected ? '#06d6a0' : '#889e95', fontSize: '11px' }}>
              <strong>🎮 Gamepad:</strong> Left Stick Steer • <strong>RT:</strong> Throttle • <strong>LT:</strong> Drift •{' '}
              <strong>A:</strong> Hop • <strong>X:</strong> Action • <strong>Y / RB:</strong> Bell •{' '}
              <strong>R3 / L3:</strong> Cockpit • <strong>LB:</strong> Binoculars
            </div>
          </div>
        </div>

        {/* Live Telemetry Card */}
        <div
          style={{
            background: 'rgba(20, 29, 27, 0.82)',
            backdropFilter: 'blur(8px)',
            padding: '14px 20px',
            borderRadius: '14px',
            border: `1px solid ${activePreset.accentColor}55`,
            minWidth: '185px',
            textAlign: 'right',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              ref={badgeDomRef}
              style={{
                background: activePreset.accentColor,
                color: '#141d1b',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '4px',
                opacity: 0,
                transition: 'opacity 0.12s ease',
              }}
            >
              FLOW
            </span>
            <span style={{ fontSize: '11px', color: '#9ab0a7', fontWeight: 600 }}>
              ALT <strong ref={altitudeDomRef}>74m</strong> • <strong ref={surfaceDomRef}>ASPHALT</strong>
            </span>
          </div>
          <div
            style={{
              marginTop: '4px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'flex-end',
              gap: '6px',
            }}
          >
            <span
              ref={speedDomRef}
              style={{
                fontSize: '38px',
                fontWeight: 900,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: activePreset.accentColor,
              }}
            >
              0
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#a3b8b0' }}>km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function teleportBtnStyle(accent: string): React.CSSProperties {
  return {
    background: 'rgba(20, 29, 27, 0.82)',
    color: '#f4f1ea',
    border: `1px solid ${accent}88`,
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function smallPillStyle(accent: string): React.CSSProperties {
  return {
    background: 'rgba(20, 29, 27, 0.78)',
    color: '#f4f1ea',
    border: `1px solid ${accent}66`,
    padding: '5px 10px',
    borderRadius: '7px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
