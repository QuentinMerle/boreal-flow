import * as THREE from 'three';
import { MovementMode, mutablePhysics } from '../state/gameStore';
import { WILDLIFE_SPECIES, WildlifeSpecies } from '../world/parkActivitiesData';

/**
 * Step 2.3, Step 3.2 & Step 4.2 - Native Web Audio API Procedural Soundscape
 */
class BorealSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private rollFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;
  private urethaneOsc: OscillatorNode | null = null;
  private urethaneOscGain: GainNode | null = null;

  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;

  private zipOsc: OscillatorNode | null = null;
  private zipGain: GainNode | null = null;

  private fireFilter: BiquadFilterNode | null = null;
  private fireGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private isMuted = false;
  private initialized = false;
  private lastPaddleStrokeSign = 1;
  private birdTimer = 3.2;
  private lastPoofCounter = 0;
  private lastEmoteCounter = 0;

  public init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.7;
    this.masterGain.connect(this.ctx.destination);

    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 4;
    this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    }

    // 1. Ambient Mountain Wind Loop
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = this.noiseBuffer;
    windSource.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 260;
    this.windFilter.Q.value = 1.8;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.08;
    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSource.start(0);

    // 2. Surface Rolling Loop
    const rollSource = this.ctx.createBufferSource();
    rollSource.buffer = this.noiseBuffer;
    rollSource.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 220;
    this.rollFilter.Q.value = 1.2;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0.0;
    rollSource.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.masterGain);
    rollSource.start(0.5);

    this.urethaneOsc = this.ctx.createOscillator();
    this.urethaneOsc.type = 'triangle';
    this.urethaneOsc.frequency.value = 110;
    this.urethaneOscGain = this.ctx.createGain();
    this.urethaneOscGain.gain.value = 0.0;
    this.urethaneOsc.connect(this.urethaneOscGain);
    this.urethaneOscGain.connect(this.masterGain);
    this.urethaneOsc.start();

    // 3. Powerslide / Dirt Skid Loop
    const driftSource = this.ctx.createBufferSource();
    driftSource.buffer = this.noiseBuffer;
    driftSource.loop = true;
    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 950;
    this.driftFilter.Q.value = 3.5;
    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0.0;
    driftSource.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    driftSource.start(1.1);

    // 4. Water Hull Wake Loop
    const waterSource = this.ctx.createBufferSource();
    waterSource.buffer = this.noiseBuffer;
    waterSource.loop = true;
    this.waterFilter = this.ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 480;
    this.waterGain = this.ctx.createGain();
    this.waterGain.gain.value = 0.0;
    waterSource.connect(this.waterFilter);
    this.waterFilter.connect(this.waterGain);
    this.waterGain.connect(this.masterGain);
    waterSource.start(1.7);

    // 5. Zipline Pulley Whirr Oscillator
    this.zipOsc = this.ctx.createOscillator();
    this.zipOsc.type = 'sawtooth';
    this.zipOsc.frequency.value = 320;
    const zipFilter = this.ctx.createBiquadFilter();
    zipFilter.type = 'bandpass';
    zipFilter.frequency.value = 680;
    zipFilter.Q.value = 2.5;
    this.zipGain = this.ctx.createGain();
    this.zipGain.gain.value = 0.0;
    this.zipOsc.connect(zipFilter);
    zipFilter.connect(this.zipGain);
    this.zipGain.connect(this.masterGain);
    this.zipOsc.start();

    // 6. Step 4.2: Campfire Warm Crackling Hearth Loop
    const fireSource = this.ctx.createBufferSource();
    fireSource.buffer = this.noiseBuffer;
    fireSource.loop = true;
    this.fireFilter = this.ctx.createBiquadFilter();
    this.fireFilter.type = 'bandpass';
    this.fireFilter.frequency.value = 1400;
    this.fireFilter.Q.value = 0.9;
    this.fireGain = this.ctx.createGain();
    this.fireGain.gain.value = 0.0;
    fireSource.connect(this.fireFilter);
    this.fireFilter.connect(this.fireGain);
    this.fireGain.connect(this.masterGain);
    fireSource.start(2.3);

    this.lastPoofCounter = mutablePhysics.poofCounter;
    this.lastEmoteCounter = mutablePhysics.emoteCounter;
    this.initialized = true;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.08);
    }
  }

  public triggerHopSound() {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public triggerPoofSound() {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.09);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Step 4.2: Non-Verbal Emote Sound (Double Brass Bike Bell in BIKE mode, Journey Harmonic Chime otherwise)
  public triggerEmoteSound(mode: MovementMode) {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (mode === 'BIKE') {
      // Crisp Double-Ring Brass Bicycle Bell ("Brrring-Brrring!")
      const bellStrikes = [0, 0.045, 0.16, 0.21];
      bellStrikes.forEach((offset, i) => {
        if (!this.ctx || !this.masterGain) return;
        const t0 = now + offset;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        // Inharmonic metallic bell partials
        osc1.frequency.setValueAtTime(2480, t0);
        osc2.frequency.setValueAtTime(3890, t0);
        const peak = i >= 2 ? 0.16 : 0.11;
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.65);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);
        osc1.start(t0);
        osc2.start(t0);
        osc1.stop(t0 + 0.68);
        osc2.stop(t0 + 0.68);
      });
    } else {
      // Cozy Journey-style Warm Pentatonic Chime Call
      const chord = [587.33, 880.0, 1174.66]; // D5, A5, D6
      chord.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const t0 = now + idx * 0.04;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.01, t0 + 0.5);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.11 / (idx + 1), t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.75);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.78);
      });
    }
  }

  public triggerDiscoveryChime() {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t0 = now + idx * 0.07;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.48);
    });
  }

  public triggerPaddleSplash() {
    if (!this.initialized || !this.ctx || !this.noiseBuffer || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.32);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.36);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 2, 0.38);
  }

  private triggerSpatialBirdCall(bird: WildlifeSpecies) {
    if (!this.initialized || !this.ctx || !this.masterGain || this.isMuted) return;
    const p = mutablePhysics;
    const dx = bird.basePos.x - p.position.x;
    const dy = bird.basePos.y - p.position.y;
    const dz = bird.basePos.z - p.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 260) return;

    const activeYaw = p.binocularsYaw || p.yaw;
    const rightX = Math.cos(activeYaw);
    const rightZ = -Math.sin(activeYaw);
    const invHorizontalDist = 1 / Math.max(1, Math.hypot(dx, dz));
    const pan = THREE.MathUtils.clamp((dx * rightX + dz * rightZ) * invHorizontalDist, -0.95, 0.95);

    const distGain = THREE.MathUtils.clamp(1.0 - dist / 240, 0.08, 1.0) * 0.085;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    osc.type = 'sine';

    if (bird.callPattern === 'LOON') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(790, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(620, now + 1.25);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(distGain, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.35);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.4);
    } else if (bird.callPattern === 'OWL') {
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.setValueAtTime(315, now + 0.35);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(distGain * 1.2, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.004, now + 0.28);
      gain.gain.linearRampToValueAtTime(distGain * 1.1, now + 0.38);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.95);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.0);
    } else if (bird.callPattern === 'EAGLE') {
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(1750, now + 0.45);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(distGain * 0.7, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      osc.frequency.setValueAtTime(1750, now);
      osc.frequency.setValueAtTime(2220, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(distGain, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.004, now + 0.11);
      gain.gain.linearRampToValueAtTime(distGain, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.32);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  }

  public update(dt: number, mode: MovementMode) {
    if (!this.initialized || !this.ctx) return;
    const p = mutablePhysics;
    const now = this.ctx.currentTime;
    const speedRatio = THREE.MathUtils.clamp(p.speed / 32, 0, 1);
    const altRatio = THREE.MathUtils.clamp(p.position.y / 75, 0, 1);

    if (p.poofCounter !== this.lastPoofCounter) {
      this.lastPoofCounter = p.poofCounter;
      this.triggerPoofSound();
    }

    if (p.emoteCounter !== this.lastEmoteCounter) {
      this.lastEmoteCounter = p.emoteCounter;
      this.triggerEmoteSound(mode);
    }

    // 1. Update Altitude & Speed Wind
    if (this.windFilter && this.windGain) {
      const targetWindFreq = 180 + altRatio * 240 + speedRatio * 520;
      const targetWindGain = 0.06 + altRatio * 0.12 + speedRatio * 0.25;
      this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.1);
      this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.1);
    }

    // 2. Update Surface Rolling
    const onLand = p.isGrounded && p.surface !== 'WATER' && p.specialState === 'NONE';
    if (this.rollFilter && this.rollGain && this.urethaneOsc && this.urethaneOscGain) {
      if (onLand && p.speed > 0.6 && mode !== 'WALK') {
        const isAsphalt = p.surface === 'ASPHALT';
        const baseFreq = isAsphalt ? 190 : 950;
        const freqSpan = isAsphalt ? 320 : 1400;
        this.rollFilter.frequency.setTargetAtTime(baseFreq + speedRatio * freqSpan, now, 0.06);
        this.rollFilter.Q.setTargetAtTime(isAsphalt ? 1.8 : 0.7, now, 0.08);
        this.rollGain.gain.setTargetAtTime(
          THREE.MathUtils.clamp(speedRatio * (isAsphalt ? 0.24 : 0.32), 0, 0.35),
          now,
          0.06
        );

        const humGain = isAsphalt && mode === 'LONGBOARD' ? speedRatio * 0.035 : 0;
        this.urethaneOsc.frequency.setTargetAtTime(85 + speedRatio * 145, now, 0.06);
        this.urethaneOscGain.gain.setTargetAtTime(humGain, now, 0.08);
      } else {
        this.rollGain.gain.setTargetAtTime(0, now, 0.06);
        this.urethaneOscGain.gain.setTargetAtTime(0, now, 0.06);
      }
    }

    // 3. Update Powerslide / Dirt Skid
    if (this.driftFilter && this.driftGain) {
      if (p.isDrifting && onLand) {
        const isAsphalt = p.surface === 'ASPHALT';
        const slideFreq = isAsphalt ? 1150 + speedRatio * 450 : 1650 + speedRatio * 600;
        this.driftFilter.frequency.setTargetAtTime(slideFreq, now, 0.05);
        this.driftFilter.Q.setTargetAtTime(isAsphalt ? 4.2 : 1.1, now, 0.05);
        this.driftGain.gain.setTargetAtTime(
          THREE.MathUtils.clamp(speedRatio * 0.34, 0.05, 0.35),
          now,
          0.04
        );
      } else {
        this.driftGain.gain.setTargetAtTime(0, now, 0.06);
      }
    }

    // 4. Update Water Glide & Rhythmic Paddle Splash
    const inWater = p.waterDepth > 0.15 && p.specialState === 'NONE';
    if (this.waterFilter && this.waterGain) {
      if (inWater && p.speed > 0.4) {
        this.waterFilter.frequency.setTargetAtTime(320 + speedRatio * 650, now, 0.08);
        this.waterGain.gain.setTargetAtTime(
          THREE.MathUtils.clamp(speedRatio * 0.28, 0.02, 0.28),
          now,
          0.08
        );
      } else {
        this.waterGain.gain.setTargetAtTime(0, now, 0.1);
      }
    }

    if (mode === 'CANOE' && inWater && p.paddlePhase > 0.1) {
      const s = Math.sin(p.paddlePhase);
      const sign = s >= 0 ? 1 : -1;
      if (sign > 0 && this.lastPaddleStrokeSign <= 0) {
        this.triggerPaddleSplash();
      }
      this.lastPaddleStrokeSign = sign;
    }

    // 5. Zipline Pulley Whirr
    if (this.zipOsc && this.zipGain) {
      if (p.specialState === 'ZIPLINE') {
        this.zipOsc.frequency.setTargetAtTime(240 + p.speed * 18, now, 0.06);
        this.zipGain.gain.setTargetAtTime(0.085, now, 0.05);
      } else {
        this.zipGain.gain.setTargetAtTime(0, now, 0.06);
      }
    }

    // 6. Step 4.2: Campfire Warm Crackling Hearth
    if (this.fireFilter && this.fireGain) {
      const distToFire = Math.hypot(p.position.x - -7.9, p.position.z - 117.7);
      if (p.specialState === 'CAMPFIRE' || distToFire < 18) {
        const proximity = p.specialState === 'CAMPFIRE' ? 1.0 : 1.0 - distToFire / 18;
        const crackleMod = 900 + Math.random() * 1400;
        this.fireFilter.frequency.setTargetAtTime(crackleMod, now, 0.04);
        this.fireGain.gain.setTargetAtTime(proximity * 0.16, now, 0.08);
      } else {
        this.fireGain.gain.setTargetAtTime(0, now, 0.1);
      }
    }

    // 7. Spatialized 3D Birdwatching Calls
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 4.2 + Math.random() * 4.5;
      const birdIdx = Math.floor(Math.random() * WILDLIFE_SPECIES.length);
      this.triggerSpatialBirdCall(WILDLIFE_SPECIES[birdIdx]);
    }
  }
}

export const soundscape = new BorealSoundscape();
