/**
 * Procedural Web Audio Engine for Moto Thunder GP
 * Zero external audio dependencies - 100% synthesized in Web Audio API.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private scrapeGain: GainNode | null = null;
  private kerbGain: GainNode | null = null;

  // Engine oscillators
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Wind noise nodes
  private windFilter: BiquadFilterNode | null = null;

  // Skid noise nodes
  private skidFilter: BiquadFilterNode | null = null;

  private isInitialized = false;
  private isMuted = false;

  private volumes = {
    master: 0.8,
    engine: 0.85,
    fx: 0.75,
  };

  public init() {
    if (this.isInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volumes.master, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // --- Engine Rig ---
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
      this.engineFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(80, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.setValueAtTime(160, this.ctx.currentTime);

      this.oscSub = this.ctx.createOscillator();
      this.oscSub.type = 'sawtooth';
      this.oscSub.frequency.setValueAtTime(40, this.ctx.currentTime);

      this.osc1.connect(this.engineFilter);
      this.osc2.connect(this.engineFilter);
      this.oscSub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();
      this.oscSub.start();

      // --- Procedural Noise Generator for Wind, Skid, Scrape & Kerb ---
      const noiseBuffer = this.createNoiseBuffer(2);

      // Wind channel
      const windSource = this.ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.setValueAtTime(600, this.ctx.currentTime);
      this.windFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);
      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
      windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      windSource.start();

      // Skid channel
      const skidSource = this.ctx.createBufferSource();
      skidSource.buffer = noiseBuffer;
      skidSource.loop = true;
      this.skidFilter = this.ctx.createBiquadFilter();
      this.skidFilter.type = 'highpass';
      this.skidFilter.frequency.setValueAtTime(1800, this.ctx.currentTime);
      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);
      skidSource.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);
      skidSource.start();

      // Knee-slider scrape channel
      const scrapeSource = this.ctx.createBufferSource();
      scrapeSource.buffer = noiseBuffer;
      scrapeSource.loop = true;
      const scrapeFilter = this.ctx.createBiquadFilter();
      scrapeFilter.type = 'bandpass';
      scrapeFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);
      scrapeFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);
      this.scrapeGain = this.ctx.createGain();
      this.scrapeGain.gain.setValueAtTime(0, this.ctx.currentTime);
      scrapeSource.connect(scrapeFilter);
      scrapeFilter.connect(this.scrapeGain);
      this.scrapeGain.connect(this.masterGain);
      scrapeSource.start();

      // Kerb vibration channel
      const kerbSource = this.ctx.createOscillator();
      kerbSource.type = 'square';
      kerbSource.frequency.setValueAtTime(45, this.ctx.currentTime);
      this.kerbGain = this.ctx.createGain();
      this.kerbGain.gain.setValueAtTime(0, this.ctx.currentTime);
      kerbSource.connect(this.kerbGain);
      this.kerbGain.connect(this.masterGain);
      kerbSource.start();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio not initialized yet:', e);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const rate = this.ctx?.sampleRate || 44100;
    const length = rate * seconds;
    const buffer = this.ctx!.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public setVolumes(master: number, engine: number, fx: number) {
    this.volumes = { master, engine, fx };
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : master, this.ctx.currentTime);
    }
  }

  /**
   * Update engine sound each frame
   */
  public updateEngine(
    rpm: number,
    throttle: number,
    speedKmh: number,
    pitchMult = 1.0,
    isLimiter = false
  ) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;

    const baseFreq = 50 + (rpm / 18500) * 360 * pitchMult;
    const now = this.ctx.currentTime;

    // Apply rev limiter bounce stutter
    const freq = isLimiter ? baseFreq * (0.95 + Math.random() * 0.1) : baseFreq;

    if (this.osc1 && this.osc2 && this.oscSub && this.engineFilter && this.engineGain) {
      this.osc1.frequency.setTargetAtTime(freq, now, 0.03);
      this.osc2.frequency.setTargetAtTime(freq * 1.5, now, 0.03);
      this.oscSub.frequency.setTargetAtTime(freq * 0.5, now, 0.03);

      const cutoff = 600 + (rpm / 18500) * 3400 + throttle * 1200;
      this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.04);

      // Volume increases with RPM and throttle
      const vol = (0.25 + 0.35 * (rpm / 18500) + 0.4 * throttle) * this.volumes.engine;
      this.engineGain.gain.setTargetAtTime(vol, now, 0.03);
    }

    // Wind noise proportional to speed
    if (this.windGain && this.windFilter) {
      const speedNorm = Math.min(speedKmh / 350, 1.0);
      const windVol = Math.pow(speedNorm, 2) * 0.45 * this.volumes.fx;
      this.windGain.gain.setTargetAtTime(windVol, now, 0.05);
      this.windFilter.frequency.setTargetAtTime(400 + speedNorm * 1200, now, 0.05);
    }
  }

  public updateTireEffects(skidRatio: number, isOverKerb: boolean, isScrapingKnee: boolean) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Tire slide / screech
    if (this.skidGain) {
      const targetSkid = Math.min(Math.max(skidRatio, 0), 1) * 0.5 * this.volumes.fx;
      this.skidGain.gain.setTargetAtTime(targetSkid, now, 0.04);
    }

    // Kerb rumble
    if (this.kerbGain) {
      const targetKerb = (isOverKerb ? 0.35 : 0) * this.volumes.fx;
      this.kerbGain.gain.setTargetAtTime(targetKerb, now, 0.03);
    }

    // Knee slider spark/scrape
    if (this.scrapeGain) {
      const targetScrape = (isScrapingKnee ? 0.4 : 0) * this.volumes.fx;
      this.scrapeGain.gain.setTargetAtTime(targetScrape, now, 0.04);
    }
  }

  /**
   * Gear upshift pop / ignition cut
   */
  public triggerGearShiftPop() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Quick ignition cut
    if (this.engineGain) {
      this.engineGain.gain.setValueAtTime(0.05, now);
      this.engineGain.gain.setTargetAtTime(0.5, now + 0.05, 0.02);
    }

    // Exhaust crackle burst
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

    gain.gain.setValueAtTime(0.4 * this.volumes.fx, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Start lights countdown beep
   */
  public playCountdownBeep(isGo = false) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isGo ? 880 : 440;
    const duration = isGo ? 0.6 : 0.18;

    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.4 * this.volumes.fx, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Checkered flag victory fanfare
   */
  public playVictoryFanfare() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + idx * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35 * this.volumes.fx, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.55);
    });
  }

  /**
   * UI Click sound
   */
  public playClick() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    gain.gain.setValueAtTime(0.2 * this.volumes.fx, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.skidGain) this.skidGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.scrapeGain) this.scrapeGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.kerbGain) this.kerbGain.gain.setTargetAtTime(0, now, 0.05);
  }
}

export const soundEngine = new SoundEngine();
