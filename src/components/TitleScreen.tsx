import React, { useState } from 'react';
import { useGameStore, MovementMode } from '../state/gameStore';
import { soundscape } from '../audio/soundscape';

interface VehicleChoice {
  mode: MovementMode;
  icon: string;
  title: string;
  badge: string;
  desc: string;
  accent: string;
}

const VEHICLE_CHOICES: VehicleChoice[] = [
  {
    mode: 'LONGBOARD',
    icon: '🛹',
    title: 'Longboard Alpin',
    badge: 'Route & Hairpins',
    desc: 'Grandes courbes sur asphalte lisse, dérapages contrôlés et vitesse de pointe.',
    accent: '#eb5e46',
  },
  {
    mode: 'BIKE',
    icon: '🚵',
    title: 'VTT Singletrack',
    badge: 'Flow & Sauts',
    desc: 'Bermes en terre, passerelles North Shore en bois, kickers et roue libre cliquetante.',
    accent: '#52b788',
  },
  {
    mode: 'CANOE',
    icon: '🛶',
    title: "Canoë d'Eau Vive",
    badge: 'Rapides & Lac',
    desc: 'Descente des gorges tumultueuses en kayak jusquaux eaux calmes du Lac Miroir.',
    accent: '#4ea8de',
  },
  {
    mode: 'WALK',
    icon: '🥾',
    title: 'Randonnée Pédestre',
    badge: 'Cozy & Zen',
    desc: 'Balade contemplative, observation des oiseaux aux jumelles et bivouac.',
    accent: '#f4a261',
  },
];

export const TitleScreen: React.FC = () => {
  const gameStarted = useGameStore((s) => s.gameStarted);
  const startGame = useGameStore((s) => s.startGame);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const [selectedMode, setSelectedMode] = useState<MovementMode>('LONGBOARD');
  const [isStarting, setIsStarting] = useState(false);

  if (gameStarted) return null;

  const handleLaunch = () => {
    if (isStarting) return;
    setIsStarting(true);
    soundscape.init();
    soundscape.triggerDiscoveryChime();

    setTimeout(() => {
      startGame(selectedMode);
    }, 280);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 28%, rgba(20, 32, 28, 0.72) 0%, rgba(8, 14, 12, 0.94) 85%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: '#fdfcf7',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: '24px',
        opacity: isStarting ? 0 : 1,
        transform: isStarting ? 'scale(1.03)' : 'scale(1)',
        transition: 'opacity 0.32s ease, transform 0.32s ease',
        pointerEvents: isStarting ? 'none' : 'auto',
      }}
    >
      {/* Top Banner Tag */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '999px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#ffd166',
          marginBottom: '16px',
        }}
      >
        <span>🍁 EXPÉDITION FORESTIÈRE CANADIENNE</span>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
        <span>1 600M DE DESCENTE</span>
      </div>

      {/* Main Logo & Title */}
      <h1
        style={{
          fontSize: 'clamp(44px, 7vw, 76px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          margin: 0,
          lineHeight: 1.05,
          textAlign: 'center',
          background: 'linear-gradient(180deg, #ffffff 30%, #d8e5df 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.6))',
        }}
      >
        BOREAL FLOW
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 'clamp(14px, 2vw, 17px)',
          color: '#a3b8b0',
          maxWidth: '540px',
          textAlign: 'center',
          marginTop: '10px',
          marginBottom: '26px',
          lineHeight: 1.5,
        }}
      >
        Dévalez les crêtes des Rocheuses jusqu'au Lac Miroir. Aucun temps de chargement, pur flow-state.
      </p>

      {/* Vehicle / Mode Selection Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          width: '100%',
          maxWidth: '860px',
          marginBottom: '28px',
        }}
      >
        {VEHICLE_CHOICES.map((choice) => {
          const isSelected = selectedMode === choice.mode;
          return (
            <div
              key={choice.mode}
              onClick={() => setSelectedMode(choice.mode)}
              style={{
                background: isSelected
                  ? `linear-gradient(145deg, ${choice.accent}26 0%, rgba(255,255,255,0.06) 100%)`
                  : 'rgba(255, 255, 255, 0.03)',
                border: isSelected
                  ? `2px solid ${choice.accent}`
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                position: 'relative',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                boxShadow: isSelected
                  ? `0 10px 24px -6px ${choice.accent}44`
                  : '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '28px' }}>{choice.icon}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: choice.accent,
                    background: `${choice.accent}1a`,
                    padding: '3px 7px',
                    borderRadius: '6px',
                  }}
                >
                  {choice.badge}
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f4f1ea' }}>
                {choice.title}
              </div>
              <div style={{ fontSize: '11.5px', color: '#90a49c', lineHeight: 1.4 }}>
                {choice.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Start Action Button */}
      <button
        onClick={handleLaunch}
        style={{
          background: 'linear-gradient(135deg, #06d6a0 0%, #059669 100%)',
          color: '#06281e',
          border: 'none',
          borderRadius: '999px',
          padding: '16px 42px',
          fontSize: '17px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          boxShadow: '0 8px 28px rgba(6, 214, 160, 0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'all 0.16s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.04)';
          e.currentTarget.style.boxShadow = '0 12px 36px rgba(6, 214, 160, 0.65)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 28px rgba(6, 214, 160, 0.45)';
        }}
      >
        <span>DÉVALER LA MONTAGNE</span>
        <span style={{ fontSize: '20px' }}>🌲</span>
      </button>

      {/* Bottom Controls Preview & Gamepad Indicator */}
      <div
        style={{
          marginTop: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          fontSize: '11.5px',
          color: '#82998f',
        }}
      >
        <div>
          <strong style={{ color: '#dbe7e1' }}>Clavier :</strong> ZQSD / Flèches pour diriger • Shift pour glisser • Espace pour sauter • [R] Rewind
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)' }}>•</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🎮</span>
          <span style={{ color: gamepadConnected ? '#06d6a0' : '#82998f' }}>
            {gamepadConnected ? 'Manette Détectée' : 'Manette Compatible'}
          </span>
        </div>
      </div>
    </div>
  );
};
