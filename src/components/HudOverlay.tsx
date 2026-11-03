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

const MODE_ICONS: Record<MovementMode, string> = {
  WALK: '🥾',
  LONGBOARD: '🛹',
  BIKE: '🚵',
  CANOE: '🛶',
};

export const HudOverlay: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const isPaused = useGameStore((s) => s.isPaused);
  const timeCyclePaused = useGameStore((s) => s.timeCyclePaused);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const binocularsActive = useGameStore((s) => s.binocularsActive);
  const discoveredBirds = useGameStore((s) => s.discoveredBirds);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const triathlonStatus = useGameStore((s) => s.triathlonStatus);
  const triathlonFinishTime = useGameStore((s) => s.triathlonFinishTime);
  const triathlonBadge = useGameStore((s) => s.triathlonBadge);
  const triathlonVehicles = useGameStore((s) => s.triathlonVehicles);
  const triathlonPB = useGameStore((s) => s.triathlonPB);
  const resetTriathlon = useGameStore((s) => s.resetTriathlon);

  const setMode = useGameStore((s) => s.setMode);
  const togglePause = useGameStore((s) => s.togglePause);
  const setPaused = useGameStore((s) => s.setPaused);
  const respawnAt = useGameStore((s) => s.respawnAt);
  const setTimePreset = useGameStore((s) => s.setTimePreset);
  const toggleTimePause = useGameStore((s) => s.toggleTimePause);
  const toggleAudioMute = useGameStore((s) => s.toggleAudioMute);
  const toggleBinoculars = useGameStore((s) => s.toggleBinoculars);
  const toggleCameraMode = useGameStore((s) => s.toggleCameraMode);

  const speedDomRef = useRef<HTMLSpanElement>(null);
  const telemetryWrapRef = useRef<HTMLDivElement>(null);
  const badgeDomRef = useRef<HTMLSpanElement>(null);
  const altitudeDomRef = useRef<HTMLSpanElement>(null);
  const clockDomRef = useRef<HTMLSpanElement>(null);
  const promptDomRef = useRef<HTMLDivElement>(null);
  const binoTargetRef = useRef<HTMLDivElement>(null);
  const binoBarRef = useRef<HTMLDivElement>(null);
  const triathlonLiveRef = useRef<HTMLDivElement>(null);
  const triathlonTimeRef = useRef<HTMLSpanElement>(null);
  const speedLinesDomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;

    const updateTelemetry = () => {
      const p = mutablePhysics;
      const kmh = Math.round(p.speed * 2.4);

      if (speedDomRef.current) {
        speedDomRef.current.textContent = `${kmh}`;
      }
      if (telemetryWrapRef.current) {
        // Organic breathing opacity: discreet when stationary (0.32), crisp at speed (0.95)
        const activeAlpha = p.isPaused ? 0 : kmh > 3 || !p.isGrounded ? 0.94 : 0.32;
        telemetryWrapRef.current.style.opacity = `${activeAlpha}`;
      }
      if (speedLinesDomRef.current) {
        // Visceral peripheral flow-state speed lines starting around 30 km/h (p.speed > 12.0 m/s)
        const speedNorm = p.isPaused ? 0 : Math.max(0, Math.min(1, (p.speed - 12.0) / 18.0));
        if (speedNorm > 0.01) {
          const flutter = 0.94 + 0.06 * Math.sin(performance.now() * 0.042);
          speedLinesDomRef.current.style.opacity = `${(Math.pow(speedNorm, 0.85) * 0.88).toFixed(3)}`;
          speedLinesDomRef.current.style.transform = `scale(${(1.08 - speedNorm * 0.11 * flutter).toFixed(3)})`;
        } else {
          speedLinesDomRef.current.style.opacity = '0';
        }
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
      if (triathlonLiveRef.current && triathlonTimeRef.current) {
        if (p.triathlonStatus === 'ACTIVE' && !p.isPaused) {
          triathlonLiveRef.current.style.opacity = '1';
          triathlonLiveRef.current.style.transform = 'translate(-50%, 0)';
          const totalSecs = p.triathlonTimer;
          const mins = Math.floor(totalSecs / 60);
          const secs = (totalSecs % 60).toFixed(1);
          triathlonTimeRef.current.textContent = `${mins}:${secs.padStart(4, '0')}`;
        } else {
          triathlonLiveRef.current.style.opacity = '0';
          triathlonLiveRef.current.style.transform = 'translate(-50%, -12px)';
        }
      }
      if (promptDomRef.current) {
        if (p.contextPrompt && !p.isPaused) {
          promptDomRef.current.textContent = p.contextPrompt;
          promptDomRef.current.style.opacity = '1';
          promptDomRef.current.style.transform = 'translate(-50%, 0)';
        } else {
          promptDomRef.current.style.opacity = '0';
          promptDomRef.current.style.transform = 'translate(-50%, 8px)';
        }
      }
      if (binoTargetRef.current && binoBarRef.current) {
        const species = WILDLIFE_SPECIES.find((w) => w.id === p.targetedBirdId);
        if (species) {
          binoTargetRef.current.textContent = `🎯 ${species.name} (${species.frenchName}) — ${species.biome}`;
          binoBarRef.current.style.width = `${Math.round(p.scanProgress * 100)}%`;
        } else {
          binoTargetRef.current.textContent =
            'Scan Mirror Lake, Eastern Pines, Western Canyon, or the Firewatch Tower...';
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
        } else if (!p.isGrounded) {
          badgeDomRef.current.textContent = 'AIRBORNE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.isDrifting) {
          badgeDomRef.current.textContent = 'POWERSLIDE';
          badgeDomRef.current.style.opacity = '1';
        } else if (p.isPumping) {
          badgeDomRef.current.textContent = 'CARVE';
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
        padding: '22px 28px',
        color: '#f4f1ea',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Subtle Tilt-Shift / Distance Horizon Depth-of-Field Blur (Zero WebGL GPU cost) */}
      {!binocularsActive && !isPaused && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '26vh',
            pointerEvents: 'none',
            backdropFilter: 'blur(2.2px)',
            WebkitBackdropFilter: 'blur(2.2px)',
            maskImage:
              'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0) 100%)',
            zIndex: 0,
          }}
        />
      )}

      {/* Subtle Peripheral Wind Speed-Lines Vignette at High Speeds (Zero WebGL GPU cost) */}
      <div
        ref={speedLinesDomRef}
        style={{
          position: 'fixed',
          inset: '-4%',
          pointerEvents: 'none',
          opacity: 0,
          zIndex: 1,
          transition: 'opacity 0.12s linear',
          background:
            'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.0) 0deg, rgba(255,255,255,0.0) 4.2deg, rgba(244,241,234,0.22) 4.6deg, rgba(255,255,255,0.0) 5.0deg, rgba(255,255,255,0.0) 11.5deg, rgba(244,241,234,0.14) 11.8deg, rgba(255,255,255,0.0) 12.2deg)',
          maskImage:
            'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.35) 76%, rgba(0,0,0,0.95) 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.35) 76%, rgba(0,0,0,0.95) 100%)',
        }}
      />

      {/* Binoculars Viewfinder Vignette & Acoustic Scanner */}
      {binocularsActive && !isPaused && (
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
            zIndex: 15,
          }}
        >
          <div
            style={{
              width: '210px',
              height: '210px',
              borderRadius: '50%',
              border: '1.5px dashed rgba(255, 209, 102, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ffd166',
              }}
            />
          </div>

          <div
            style={{
              marginTop: '20px',
              background: 'rgba(15, 23, 22, 0.82)',
              backdropFilter: 'blur(8px)',
              padding: '10px 18px',
              borderRadius: '999px',
              border: '1px solid rgba(255, 209, 102, 0.35)',
              textAlign: 'center',
              minWidth: '320px',
            }}
          >
            <div ref={binoTargetRef} style={{ fontSize: '12.5px', fontWeight: 600 }}>
              Scan Mirror Lake, Pines, Canyon, or the Firewatch Tower...
            </div>
            <div
              style={{
                height: '4px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '3px',
                marginTop: '6px',
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

      {/* Floating Live Triathlon Chronometer (Only visible during an active run) */}
      <div
        ref={triathlonLiveRef}
        style={{
          position: 'fixed',
          top: '22px',
          left: '50%',
          transform: 'translate(-50%, -12px)',
          opacity: 0,
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          background: 'rgba(16, 24, 22, 0.68)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 209, 102, 0.45)',
          borderRadius: '999px',
          padding: '6px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: '10px', fontWeight: 800, color: '#ffd166', letterSpacing: '0.14em' }}>
          DESCENT
        </span>
        <span
          ref={triathlonTimeRef}
          style={{
            fontSize: '19px',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: '#f4f1ea',
          }}
        >
          0:00.0
        </span>
        <span style={{ fontSize: '13px' }}>
          {triathlonVehicles.map((v) => MODE_ICONS[v]).join(' ')}
        </span>
      </div>

      {/* Triumphant Boreal Triathlon Finish Card */}
      {triathlonStatus === 'FINISHED' && !isPaused && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(16, 24, 22, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(255, 209, 102, 0.6)',
            borderRadius: '22px',
            padding: '28px 36px',
            textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
            maxWidth: '420px',
            width: '90%',
            zIndex: 90,
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.2em', color: '#ffd166' }}>
            BOREAL DESCENT COMPLETED
          </div>

          <div style={{ fontSize: '44px', margin: '12px 0 4px' }}>
            {triathlonBadge === 'MAPLE' ? '🍁' : triathlonBadge === 'JAY' ? '🪶' : '🦌'}
          </div>

          <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffd166' }}>
            {triathlonBadge === 'MAPLE'
              ? "FEUILLE D'ÉRABLE (OR)"
              : triathlonBadge === 'JAY'
              ? 'PLUME DE GEAI (ARGENT)'
              : "BOIS D'ORIGNAL (BRONZE)"}
          </div>

          <div
            style={{
              fontSize: '34px',
              fontWeight: 900,
              margin: '6px 0 14px',
              fontVariantNumeric: 'tabular-nums',
              color: '#f4f1ea',
            }}
          >
            {triathlonFinishTime.toFixed(1)}s
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                soundscape.init();
                respawnAt('SUMMIT_ROAD', 'LONGBOARD');
              }}
              style={{
                background: '#eb5e46',
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              ⛰️ Recommencer (Sommet)
            </button>
            <button
              onClick={resetTriathlon}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#f4f1ea',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* Contextual Interaction Prompt Pill ([E] Rack / Zipline / Campfire) */}
      <div
        ref={promptDomRef}
        style={{
          position: 'fixed',
          bottom: '84px',
          left: '50%',
          transform: 'translate(-50%, 8px)',
          opacity: 0,
          transition: 'all 0.18s ease',
          background: 'rgba(16, 24, 22, 0.78)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 209, 102, 0.45)',
          color: '#fffbeb',
          padding: '8px 18px',
          borderRadius: '999px',
          fontWeight: 600,
          fontSize: '13px',
          letterSpacing: '0.01em',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 10,
        }}
      />

      {/* --- ULTRA-MINIMAL TOP BAR (Only a whisper-quiet Pause Pill in Top-Right!) --- */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', zIndex: 20 }}>
        {!isPaused && (
          <button
            onClick={() => {
              soundscape.init();
              togglePause();
            }}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(16, 24, 22, 0.42)',
              backdropFilter: 'blur(8px)',
              color: 'rgba(244, 241, 234, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ fontSize: '10px', opacity: 0.8 }}>⏸</span>
            <span>MENU • ESC</span>
          </button>
        )}
      </div>

      {/* --- ULTRA-ORGANIC BOTTOM BAR (Discreet Mode Pill + Frameless Speed Readout) --- */}
      {!isPaused && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            zIndex: 10,
          }}
        >
          {/* Left: Compact Organic Mode Pill (Click to cycle or press 1-4) */}
          <div
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16, 24, 22, 0.42)',
              backdropFilter: 'blur(8px)',
              padding: '5px 8px 5px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span style={{ fontSize: '14px' }}>{MODE_ICONS[mode]}</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: activePreset.accentColor,
                letterSpacing: '0.02em',
                marginRight: '4px',
              }}
            >
              {activePreset.label}
            </span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {MODES.map((m) => {
                const isAct = m === mode;
                const p = PHYSICS_PRESETS[m];
                return (
                  <button
                    key={m}
                    onClick={() => {
                      soundscape.init();
                      setMode(m, true);
                    }}
                    title={`${p.label} (${p.keyHint})`}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: 'none',
                      background: isAct ? p.accentColor : 'rgba(255, 255, 255, 0.08)',
                      color: isAct ? '#141d1b' : 'rgba(244, 241, 234, 0.65)',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p.keyHint}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Frameless Poetic Telemetry (Breathes with Speed) */}
          <div
            ref={telemetryWrapRef}
            style={{
              textAlign: 'right',
              transition: 'opacity 0.35s ease',
              opacity: 0.32,
              textShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
                marginBottom: '2px',
              }}
            >
              <span
                ref={badgeDomRef}
                style={{
                  background: activePreset.accentColor,
                  color: '#141d1b',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  opacity: 0,
                  transition: 'opacity 0.15s ease',
                  textShadow: 'none',
                }}
              >
                FLOW
              </span>
              <span
                ref={altitudeDomRef}
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'rgba(244, 241, 234, 0.72)',
                  letterSpacing: '0.04em',
                }}
              >
                210m
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'flex-end',
                gap: '5px',
              }}
            >
              <span
                ref={speedDomRef}
                style={{
                  fontSize: '34px',
                  fontWeight: 800,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: '#f4f1ea',
                  letterSpacing: '-0.02em',
                }}
              >
                0
              </span>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'rgba(244, 241, 234, 0.65)',
                }}
              >
                km/h
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FIELD JOURNAL & PAUSE OVERLAY (Toggled via ESC / P / Gamepad Start)
         ===================================================================== */}
      {isPaused && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaused(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12, 18, 17, 0.68)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'rgba(20, 29, 27, 0.92)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '24px',
              padding: '28px 32px',
              maxWidth: '580px',
              width: '100%',
              boxShadow: '0 28px 80px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Header: Title, Clock & Resume Button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '16px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    color: '#a3b8b0',
                    textTransform: 'uppercase',
                  }}
                >
                  PARC NATIONAL BORÉAL • PAUSE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '2px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    BOREAL FLOW
                  </span>
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
                  {triathlonPB < 999 && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#ffd166',
                        background: 'rgba(255, 209, 102, 0.14)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}
                    >
                      🏆 Record : {triathlonPB.toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setPaused(false)}
                style={{
                  background: '#06d6a0',
                  color: '#141d1b',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ▶ Reprendre (Esc)
              </button>
            </div>

            {/* Section 1: Teleport / Drop-In Locations */}
            <div>
              <div style={sectionHeaderStyle}>⛰️ TÉLÉPORTATION / POINTS DE DÉPART</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    soundscape.init();
                    respawnAt('SUMMIT_ROAD', 'LONGBOARD');
                  }}
                  style={journalBtnStyle('#eb5e46')}
                >
                  🛹 Sommet Route (Longboard)
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    respawnAt('SUMMIT_TRAIL', 'BIKE');
                  }}
                  style={journalBtnStyle('#52b788')}
                >
                  🚵 Sommet Singletrack (VTT)
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    respawnAt('LAKE_SHORE', 'CANOE');
                  }}
                  style={journalBtnStyle('#4ea8de')}
                >
                  🛶 Rapides d'Eau Vive (Kayak)
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    respawnAt('FIREWATCH_TOWER', 'WALK');
                  }}
                  style={journalBtnStyle('#ffd166')}
                >
                  🗼 Tour de Guet (Tyrolienne)
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    respawnAt('CAMPFIRE_HUB', 'WALK');
                  }}
                  style={journalBtnStyle('#ff9f1c')}
                >
                  🔥 Feu de Camp au Lac
                </button>
              </div>
            </div>

            {/* Section 2: Atmosphere, Camera & Sound */}
            <div>
              <div style={sectionHeaderStyle}>🌅 ATMOSPHÈRE, CAMÉRA & AUDIO</div>
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                <button onClick={() => handleTimePreset('DAWN')} style={smallPillStyle('#e8a598')}>
                  🌅 Aube
                </button>
                <button onClick={() => handleTimePreset('NOON')} style={smallPillStyle('#8ecae6')}>
                  ☀️ Midi
                </button>
                <button onClick={() => handleTimePreset('GOLDEN')} style={smallPillStyle('#ff9b54')}>
                  🌇 Golden Hour
                </button>
                <button onClick={() => handleTimePreset('NIGHT')} style={smallPillStyle('#7ca5d8')}>
                  🌙 Nuit (N)
                </button>
                <button onClick={toggleTimePause} style={smallPillStyle('#a3b8b0')}>
                  {timeCyclePaused ? '▶️ Cycle Solaire' : '⏸️ Figer le Ciel'}
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleCameraMode();
                  }}
                  style={smallPillStyle('#ff9b54')}
                >
                  🎥 Vue : {cameraMode === 'COCKPIT' ? 'Cockpit (V)' : 'Diorama (V)'}
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleAudioMute();
                  }}
                  style={smallPillStyle(audioMuted ? '#ef476f' : '#52b788')}
                >
                  {audioMuted ? '🔇 Audio Coupé' : '🔊 Son ASMR'}
                </button>
              </div>
            </div>

            {/* Section 3: Wildlife Field Guide */}
            <div>
              <div
                style={{
                  ...sectionHeaderStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📓 CARNET D'OBSERVATION ({discoveredBirds.length}/{WILDLIFE_SPECIES.length})</span>
                <button
                  onClick={() => {
                    soundscape.init();
                    setPaused(false);
                    toggleBinoculars();
                  }}
                  style={{
                    background: 'rgba(255, 209, 102, 0.16)',
                    color: '#ffd166',
                    border: '1px solid rgba(255, 209, 102, 0.4)',
                    borderRadius: '999px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔭 Ouvrir les Jumelles (B)
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {WILDLIFE_SPECIES.map((w) => {
                  const found = discoveredBirds.includes(w.id);
                  return (
                    <span
                      key={w.id}
                      style={{
                        fontSize: '11.5px',
                        padding: '5px 11px',
                        borderRadius: '999px',
                        background: found ? 'rgba(6, 214, 160, 0.18)' : 'rgba(255,255,255,0.05)',
                        color: found ? '#06d6a0' : '#7c8f88',
                        border: `1px solid ${found ? '#06d6a055' : 'rgba(255,255,255,0.06)'}`,
                        fontWeight: 600,
                      }}
                    >
                      {found ? `✓ ${w.frenchName}` : `🔒 ${w.biome}`}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Footer: Compact Controls Guide */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '11px',
                color: '#9ab0a7',
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong style={{ color: '#f4f1ea' }}>Clavier :</strong> WASD / Flèches (Diriger & Pousser) •{' '}
                <strong style={{ color: '#f4f1ea' }}>Shift / S + Virage</strong> (Powerslide) •{' '}
                <strong style={{ color: '#f4f1ea' }}>Espace</strong> (Saut / Ollie) •{' '}
                <strong style={{ color: '#f4f1ea' }}>1–4</strong> (Équipement) •{' '}
                <strong style={{ color: '#f4f1ea' }}>E</strong> (Action) •{' '}
                <strong style={{ color: '#f4f1ea' }}>C</strong> (Sonnette)
              </div>
              <div>
                <strong style={{ color: gamepadConnected ? '#06d6a0' : '#f4f1ea' }}>
                  {gamepadConnected ? '🎮 Manette Connectée :' : '🎮 Manette :'}
                </strong>{' '}
                Stick G (Diriger) • RT (Pousser) • LT / B (Powerslide) • A (Saut) • X (Action) • Croix (Équipement) • Start (Pause)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 800,
  letterSpacing: '0.12em',
  color: '#889e95',
  marginBottom: '8px',
};

function journalBtnStyle(accent: string): React.CSSProperties {
  return {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#f4f1ea',
    border: `1px solid ${accent}77`,
    padding: '8px 14px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function smallPillStyle(accent: string): React.CSSProperties {
  return {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#f4f1ea',
    border: `1px solid ${accent}55`,
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
