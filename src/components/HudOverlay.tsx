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
            background: 'rgba(8, 14, 13, 0.76)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'radial-gradient(130% 120% at 50% 0%, rgba(26, 42, 38, 0.96) 0%, rgba(13, 22, 20, 0.98) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '24px',
              padding: '26px 30px',
              maxWidth: '620px',
              width: '100%',
              boxShadow: '0 36px 90px -10px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {/* Header: Title, Clock & Resume Button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '15px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '10px',
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    color: '#06d6a0',
                    background: 'rgba(6, 214, 160, 0.12)',
                    border: '1px solid rgba(6, 214, 160, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                  }}
                >
                  🌲 PARC NATIONAL BORÉAL • PAUSE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                    BOREAL FLOW
                  </span>
                  <span
                    ref={clockDomRef}
                    style={{
                      fontSize: '13px',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#ffd166',
                      fontWeight: 700,
                      background: 'rgba(255, 209, 102, 0.12)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 209, 102, 0.25)',
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
                        padding: '3px 8px',
                        borderRadius: '999px',
                        border: '1px solid rgba(255, 209, 102, 0.3)',
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
                  background: 'linear-gradient(135deg, #06d6a0 0%, #05b386 100%)',
                  color: '#0f1715',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 18px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(6, 214, 160, 0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'transform 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <span>▶ Reprendre</span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    background: 'rgba(0, 0, 0, 0.22)',
                    padding: '2px 5px',
                    borderRadius: '4px',
                  }}
                >
                  ESC
                </span>
              </button>
            </div>

            {/* Section 1: Teleport / Trailhead Grid */}
            <div>
              <div style={sectionHeaderStyle}>⛰️ TÉLÉPORTATION & POINTS DE DÉPART</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {TRAILHEADS.map((t, idx) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      soundscape.init();
                      respawnAt(t.id as any, t.mode);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderLeft: `3.5px solid ${t.accent}`,
                      borderRadius: '12px',
                      padding: '9px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      gridColumn: idx === 4 ? 'span 2' : 'span 1',
                      transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)';
                      e.currentTarget.style.borderColor = `${t.accent}77`;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.borderLeft = `3.5px solid ${t.accent}`;
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: `${t.accent}22`,
                        fontSize: '17px',
                        flexShrink: 0,
                      }}
                    >
                      {t.icon}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f4f1ea' }}>
                        {t.title}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94a79f', marginTop: '1px' }}>
                        {t.subtitle}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Atmosphere, Camera & Sound */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={sectionHeaderStyle}>🌅 ATMOSPHÈRE, CAMÉRA & AUDIO</div>
              {/* Sky Presets Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px',
                  background: 'rgba(0, 0, 0, 0.22)',
                  padding: '4px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                {[
                  { label: 'Aube', icon: '🌅', id: 'DAWN' as const, col: '#fca5a5' },
                  { label: 'Midi', icon: '☀️', id: 'NOON' as const, col: '#93c5fd' },
                  { label: 'Golden', icon: '🌇', id: 'GOLDEN' as const, col: '#fdba74' },
                  { label: 'Nuit (N)', icon: '🌙', id: 'NIGHT' as const, col: '#c4b5fd' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleTimePreset(preset.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '7px 8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: preset.col,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Utility Toggles */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleCameraMode();
                  }}
                  style={utilPillStyle('#ffb703')}
                >
                  {cameraMode === 'COCKPIT' ? '🎥 Vue : 🛹 Skate Proche (V)' : '🎥 Vue : 🏔️ Diorama Surplomb (V)'}
                </button>
                <button
                  onClick={() => {
                    soundscape.init();
                    toggleAudioMute();
                  }}
                  style={utilPillStyle(audioMuted ? '#ef476f' : '#06d6a0')}
                >
                  {audioMuted ? '🔇 Audio Coupé' : '🔊 Son ASMR (Actif)'}
                </button>
                <button onClick={toggleTimePause} style={utilPillStyle('#a3b8b0')}>
                  {timeCyclePaused ? '▶️ Reprendre Ciel' : '⏸️ Figer Ciel'}
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
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📓 CARNET D'OBSERVATION</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      padding: '2px 7px',
                      borderRadius: '999px',
                    }}
                  >
                    {discoveredBirds.length}/{WILDLIFE_SPECIES.length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    soundscape.init();
                    setPaused(false);
                    toggleBinoculars();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 209, 102, 0.22) 0%, rgba(255, 209, 102, 0.08) 100%)',
                    color: '#ffd166',
                    border: '1px solid rgba(255, 209, 102, 0.4)',
                    borderRadius: '999px',
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  🔭 Mode Jumelles (B)
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {WILDLIFE_SPECIES.map((w) => {
                  const found = discoveredBirds.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        padding: '6px 10px',
                        borderRadius: '9px',
                        background: found ? 'rgba(6, 214, 160, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: found ? '#06d6a0' : '#7c8f88',
                        border: `1px solid ${found ? 'rgba(6, 214, 160, 0.35)' : 'rgba(255, 255, 255, 0.05)'}`,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ fontSize: '12px' }}>{found ? '✓' : '🔒'}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: found ? '#f4f1ea' : '#889e95', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {found ? w.frenchName : w.name}
                        </span>
                        <span style={{ fontSize: '9.5px', color: found ? '#06d6a0aa' : '#5f736b' }}>
                          {w.biome}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer: Compact Keyboard & Gamepad Guide */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '14px',
                padding: '11px 14px',
                fontSize: '11px',
                color: '#9ab0a7',
                lineHeight: 1.7,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
                <strong style={{ color: '#f4f1ea', marginRight: '4px' }}>Clavier :</strong>
                <span style={kbdChip}>W</span><span style={kbdChip}>A</span><span style={kbdChip}>S</span><span style={kbdChip}>D</span> <span style={{ color: '#6e857c' }}>Diriger</span> •{' '}
                <span style={kbdChip}>Shift</span> + Virage <span style={{ color: '#6e857c' }}>Slide</span> •{' '}
                <span style={kbdChip}>Espace</span> <span style={{ color: '#6e857c' }}>Saut</span> •{' '}
                <span style={kbdChip}>R</span> <span style={{ color: '#06d6a0', fontWeight: 700 }}>Rewind 40m</span> (<span style={{ color: '#6e857c' }}>Shift+R Sommet</span>) •{' '}
                <span style={kbdChip}>1–4</span> <span style={{ color: '#6e857c' }}>Équipement</span> •{' '}
                <span style={kbdChip}>V</span> <span style={{ color: '#6e857c' }}>Caméra</span> •{' '}
                <span style={kbdChip}>E</span> <span style={{ color: '#6e857c' }}>Action</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                <strong style={{ color: gamepadConnected ? '#06d6a0' : '#c9d6d0', marginRight: '4px' }}>
                  {gamepadConnected ? '🎮 Manette (Connectée) :' : '🎮 Manette :'}
                </strong>
                <span style={padChip}>Stick G</span> <span style={{ color: '#6e857c' }}>Diriger</span> •{' '}
                <span style={padChip}>RT</span> <span style={{ color: '#6e857c' }}>Pousser</span> •{' '}
                <span style={padChip}>LT / B</span> <span style={{ color: '#6e857c' }}>Slide</span> •{' '}
                <span style={padChip}>A</span> <span style={{ color: '#6e857c' }}>Saut</span> •{' '}
                <span style={padChip}>Back</span> <span style={{ color: '#06d6a0', fontWeight: 700 }}>Rewind 40m</span> •{' '}
                <span style={padChip}>X</span> <span style={{ color: '#6e857c' }}>Action</span> •{' '}
                <span style={padChip}>R3</span> <span style={{ color: '#6e857c' }}>Caméra</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.14em',
  color: '#889e95',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const TRAILHEADS = [
  {
    id: 'SUMMIT_ROAD',
    mode: 'LONGBOARD' as const,
    icon: '🛹',
    title: 'Sommet Route (Longboard)',
    subtitle: 'Col Alpin • Asphalte & Hairpins',
    accent: '#eb5e46',
  },
  {
    id: 'SUMMIT_TRAIL',
    mode: 'BIKE' as const,
    icon: '🚵',
    title: 'Crêtes des Rocheuses (VTT)',
    subtitle: 'Calcaire, Schiste & Flow Singletrack',
    accent: '#52b788',
  },
  {
    id: 'LAKE_SHORE',
    mode: 'CANOE' as const,
    icon: '🛶',
    title: "Rapides d'Eau Vive (Kayak)",
    subtitle: 'Gorges & Glisse sur le Lac',
    accent: '#4ea8de',
  },
  {
    id: 'FIREWATCH_TOWER',
    mode: 'WALK' as const,
    icon: '🗼',
    title: 'Tour de Guet (Tyrolienne)',
    subtitle: 'Panorama & Tyrolienne 160m',
    accent: '#ffd166',
  },
  {
    id: 'CAMPFIRE_HUB',
    mode: 'WALK' as const,
    icon: '🔥',
    title: 'Bivouac au Lac (Feu de Camp)',
    subtitle: 'Tente A-Frame, Banc & Braises ASMR',
    accent: '#ff9f1c',
  },
];

function utilPillStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#f4f1ea',
    border: `1px solid ${accent}55`,
    padding: '7px 12px',
    borderRadius: '10px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
}

const kbdChip: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  fontSize: '9.5px',
  fontFamily: 'monospace',
  fontWeight: 700,
  color: '#f4f1ea',
  background: 'rgba(255, 255, 255, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '4px',
  boxShadow: '0 1px 0 rgba(0, 0, 0, 0.4)',
};

const padChip: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  fontSize: '9.5px',
  fontWeight: 800,
  color: '#06d6a0',
  background: 'rgba(6, 214, 160, 0.12)',
  border: '1px solid rgba(6, 214, 160, 0.3)',
  borderRadius: '999px',
};
