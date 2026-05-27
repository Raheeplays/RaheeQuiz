// Professional High-Fidelity Web Audio Generative Ambient & Chill Mixer
// Syncs Synth pads, Indian Flute, Grand Piano, Classical Guitar, Chamber Strings/Violin, Ethereal Harp, and Lofi Beats
// under full synchronization. Supports client-side standard MIDI binary files and preset compositions.

import { parseMidiFile, ParsedMidiFile, ParsedMidiNote } from './midiParser';
import { midiPresets, midiToFreq } from './midiPresets';

export type BgmPresetType = 'synth' | 'flute' | 'piano' | 'guitar' | 'ensemble' | 'violin' | 'harp' | 'custom_midi';

interface MixSettings {
  synth?: number;
  flute?: number;
  piano?: number;
  guitar?: number;
  violin?: number;
  harp?: number;
  beats?: number;
  bpm?: number;
  midiPresetName?: string;
  midiUrlSynth?: string;
  midiUrlFlute?: string;
  midiUrlPiano?: string;
  midiUrlGuitar?: string;
  midiUrlViolin?: string;
  midiUrlHarp?: string;
}

class BgmService {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rootFilter: BiquadFilterNode | null = null;
  private isBgmPlaying = false;

  // Active synthesizer nodes for smooth fading
  private synthNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  // Real-time mixing volume sliders (from 0.0 to 1.0)
  private volSynth = 0.7;
  private volFlute = 0.4;
  private volPiano = 0.5;
  private volGuitar = 0.5;
  private volViolin = 0.4;
  private volHarp = 0.4;
  private volBeats = 0.25;
  private bpm = 95;

  // Active MIDI URLs / presets per track
  private activeMidiPreset = 'satie';
  private midiUrlSynth = '';
  private midiUrlFlute = '';
  private midiUrlPiano = '';
  private midiUrlGuitar = '';
  private midiUrlViolin = '';
  private midiUrlHarp = '';

  // Parsed MIDI structures per instrument track
  private parsedMidis: { [instrumentKey: string]: ParsedMidiFile | null } = {};
  private loadingMidis: { [instrumentKey: string]: boolean } = {};

  // Pattern sequencer state variables (for default generative chords)
  private sequencerTimer: any = null;
  private currentStep = 0; // 0 to 7
  private currentChordIndex = 0;

  // MIDI Clock/lookahead Scheduler variables
  private midiSchedulerTimer: any = null;
  private lookaheadSeconds = 0.15;
  private scheduleIntervalMs = 45;
  private playbackStartTimes: { [instrumentKey: string]: number } = {};
  private nextNoteIndices: { [instrumentKey: string]: number } = {};

  // Custom audio URL fallback player
  private customAudio: HTMLAudioElement | null = null;
  private currentCustomUrl = '';
  private shouldPlayCustom = false;

  // Progression chords for default generative mode (frequencies in Hz)
  private chords = [
    [130.81, 196.00, 246.94, 293.66, 329.63, 392.00], // C Maj 9
    [87.31, 130.81, 220.00, 261.63, 329.63, 392.00],  // F Maj 9
    [110.00, 164.81, 196.00, 261.63, 329.63, 493.88],  // A Min 9
    [98.00, 146.83, 196.00, 246.94, 293.66, 329.63],   // G Maj 6
  ];

  public init() {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      this.masterGain = this.audioCtx.createGain();
      // Master balance levels
      this.masterGain.gain.setValueAtTime(0.09, this.audioCtx.currentTime);

      this.rootFilter = this.audioCtx.createBiquadFilter();
      this.rootFilter.type = 'lowpass';
      this.rootFilter.frequency.setValueAtTime(1400, this.audioCtx.currentTime);

      this.masterGain.connect(this.rootFilter);
      this.rootFilter.connect(this.audioCtx.destination);
    } catch (err) {
      console.error('Failed to initialize high-fidelity generative AudioContext:', err);
    }
  }

  /**
   * Safe asynchronous loader to fetch and parse external URLs or apply local JSON MIDI presets
   */
  private async loadMidiSource(instrumentKey: string, presetName: string, url?: string) {
    if (this.loadingMidis[instrumentKey]) return;
    this.loadingMidis[instrumentKey] = true;

    try {
      if (url && url.trim().length > 0) {
        // Fetch and parse remote MIDI binary file over network
        const safeUrl = url.trim();
        const resp = await fetch(safeUrl);
        if (!resp.ok) throw new Error(`HTTP error status ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        const parsed = parseMidiFile(buffer);
        this.parsedMidis[instrumentKey] = parsed;
        console.log(`MIDI successfully fetched and parsed for [${instrumentKey}]: ${safeUrl}`);
      } else {
        // Fallback or use beautiful pre-bundled mathematical classical preset
        const activeName = presetName || this.activeMidiPreset;
        if (midiPresets[activeName]) {
          this.parsedMidis[instrumentKey] = midiPresets[activeName].generator();
        } else {
          this.parsedMidis[instrumentKey] = midiPresets['satie'].generator();
        }
      }
    } catch (err) {
      console.warn(`Could not load binary MIDI stream for [${instrumentKey}]. Reverting to preset "${presetName || 'satie'}":`, err);
      // Fallback cleanly to beautiful mathematical preset to keep system playing perfectly
      const activeName = presetName || this.activeMidiPreset;
      if (midiPresets[activeName]) {
        this.parsedMidis[instrumentKey] = midiPresets[activeName].generator();
      } else {
        this.parsedMidis[instrumentKey] = midiPresets['satie'].generator();
      }
    } finally {
      this.loadingMidis[instrumentKey] = false;
      // If playing, reset note triggers for this track so it catches up instantly
      if (this.isBgmPlaying && this.audioCtx) {
        this.nextNoteIndices[instrumentKey] = 0;
        this.playbackStartTimes[instrumentKey] = this.audioCtx.currentTime;
      }
    }
  }

  public updateState(
    globalEnabled: boolean,
    userEnabled: boolean,
    preset: BgmPresetType = 'synth',
    customUrl?: string,
    mix?: MixSettings
  ) {
    const shouldPlay = globalEnabled && (userEnabled !== false);

    // Sync volume sliders and track assignments in real-time
    if (mix) {
      if (mix.synth !== undefined) this.volSynth = mix.synth;
      if (mix.flute !== undefined) this.volFlute = mix.flute;
      if (mix.piano !== undefined) this.volPiano = mix.piano;
      if (mix.guitar !== undefined) this.volGuitar = mix.guitar;
      if (mix.violin !== undefined) this.volViolin = mix.violin;
      if (mix.harp !== undefined) this.volHarp = mix.harp;
      if (mix.beats !== undefined) this.volBeats = mix.beats;

      if (mix.bpm !== undefined) {
        const parsedBpm = Number(mix.bpm);
        if (!isNaN(parsedBpm) && parsedBpm >= 40 && parsedBpm <= 180) {
          this.bpm = parsedBpm;
        }
      }

      // Check for MIDI assignments Changes
      let midiSelectionChanged = false;
      if (mix.midiPresetName !== undefined && mix.midiPresetName !== this.activeMidiPreset) {
        this.activeMidiPreset = mix.midiPresetName;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlSynth !== undefined && mix.midiUrlSynth !== this.midiUrlSynth) {
        this.midiUrlSynth = mix.midiUrlSynth;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlFlute !== undefined && mix.midiUrlFlute !== this.midiUrlFlute) {
        this.midiUrlFlute = mix.midiUrlFlute;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlPiano !== undefined && mix.midiUrlPiano !== this.midiUrlPiano) {
        this.midiUrlPiano = mix.midiUrlPiano;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlGuitar !== undefined && mix.midiUrlGuitar !== this.midiUrlGuitar) {
        this.midiUrlGuitar = mix.midiUrlGuitar;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlViolin !== undefined && mix.midiUrlViolin !== this.midiUrlViolin) {
        this.midiUrlViolin = mix.midiUrlViolin;
        midiSelectionChanged = true;
      }
      if (mix.midiUrlHarp !== undefined && mix.midiUrlHarp !== this.midiUrlHarp) {
        this.midiUrlHarp = mix.midiUrlHarp;
        midiSelectionChanged = true;
      }

      if (midiSelectionChanged) {
        this.loadAllActiveMidis();
      }
    }

    if (shouldPlay) {
      if (customUrl && customUrl.trim().length > 0) {
        this.stopSynthesizedMusic();
        this.playCustomUrl(customUrl.trim());
      } else {
        this.stopCustomUrl();
        this.playSynthesizedMusic(preset);
      }
    } else {
      this.stop();
    }
  }

  private loadAllActiveMidis() {
    this.loadMidiSource('synth', this.activeMidiPreset, this.midiUrlSynth);
    this.loadMidiSource('flute', this.activeMidiPreset, this.midiUrlFlute);
    this.loadMidiSource('piano', this.activeMidiPreset, this.midiUrlPiano);
    this.loadMidiSource('guitar', this.activeMidiPreset, this.midiUrlGuitar);
    this.loadMidiSource('violin', this.activeMidiPreset, this.midiUrlViolin);
    this.loadMidiSource('harp', this.activeMidiPreset, this.midiUrlHarp);
  }

  private playCustomUrl(url: string) {
    this.shouldPlayCustom = true;
    if (this.currentCustomUrl !== url || !this.customAudio) {
      this.stopCustomUrl();
      this.currentCustomUrl = url;
      try {
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = 0.35;
        this.customAudio = audio;
      } catch (err) {
        console.error('Failed to play custom ambient MP3 stream:', err);
      }
    }

    if (this.customAudio) {
      this.customAudio.play().catch(() => {
        // Safe play gestures trigger in body wrapper
      });
    }
  }

  private stopCustomUrl() {
    this.shouldPlayCustom = false;
    if (this.customAudio) {
      try {
        this.customAudio.pause();
      } catch (e) {}
      this.customAudio = null;
      this.currentCustomUrl = '';
    }
  }

  private playSynthesizedMusic(preset: BgmPresetType = 'synth') {
    this.init();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.isBgmPlaying) {
      // Re-trigger lookahead intervals if tempo speed changes
      if (preset === 'custom_midi') {
        this.startMidiScheduler();
      } else {
        this.startTimeSequencer();
      }
      return;
    }

    this.isBgmPlaying = true;
    this.currentStep = 0;
    this.currentChordIndex = 0;

    // Load MIDIs once initially if not loaded yet
    this.loadAllActiveMidis();

    if (preset === 'custom_midi') {
      this.stopGenerativeSequencer();
      this.startMidiScheduler();
    } else {
      this.stopMidiStreams();
      this.playBackgroundPad();
      this.startTimeSequencer();
    }
  }

  // --- STANDARD GENERATIVE MODE ENGINE ---

  private startTimeSequencer() {
    if (this.sequencerTimer) clearInterval(this.sequencerTimer);
    const stepDurationMs = (60000 / this.bpm) / 2; // eighth notes step
    this.sequencerTimer = setInterval(() => {
      this.tickSequencerStep();
    }, stepDurationMs);
  }

  private stopGenerativeSequencer() {
    if (this.sequencerTimer) {
      clearInterval(this.sequencerTimer);
      this.sequencerTimer = null;
    }
    this.fadeBackgroundPads(1.5);
  }

  private tickSequencerStep() {
    if (!this.audioCtx || !this.isBgmPlaying) return;

    const step = this.currentStep;

    // Measure boundaries: chord switch triggers every bar (8 steps)
    if (step === 0) {
      this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
      this.playBackgroundPad();
    }

    // A. Drum Beats
    if ((step === 0 || step === 4) && this.volBeats > 0.05) {
      this.synthesizeLofiKick();
    }
    if ((step === 2 || step === 6 || (step === 7 && Math.random() > 0.6)) && this.volBeats > 0.05) {
      this.synthesizeNoiseShaker();
    }

    // B. Piano
    if (this.volPiano > 0.05 && Math.random() < (step % 2 === 0 ? 0.70 : 0.25)) {
      const activeChord = this.chords[this.currentChordIndex];
      const baseFreq = activeChord[Math.floor(Math.random() * activeChord.length)];
      const freq = baseFreq * (Math.random() > 0.5 ? 2.0 : 4.0);
      this.synthesizePianoPluck(freq, this.volPiano, 1.8, this.audioCtx.currentTime);
    }

    // C. Acoustic Guitar
    if (this.volGuitar > 0.05 && Math.random() < (step % 2 !== 0 ? 0.60 : 0.15)) {
      const activeChord = this.chords[this.currentChordIndex];
      const freq = activeChord[Math.floor(Math.random() * activeChord.length)] * (Math.random() > 0.6 ? 2.0 : 1.0);
      this.synthesizeGuitarPluck(freq, this.volGuitar, 1.2, this.audioCtx.currentTime);
    }

    // D. Soft Flute
    if (this.volFlute > 0.05 && (step === 0 || (step === 4 && Math.random() > 0.6))) {
      const activeChord = this.chords[this.currentChordIndex];
      const freq = activeChord[Math.floor(Math.random() * activeChord.length)] * 2.0;
      this.synthesizeFluteNote(freq, this.volFlute, 2.8, this.audioCtx.currentTime);
    }

    // E. Bowed Strings
    if (this.volViolin > 0.05 && step === 0) {
      const activeChord = this.chords[this.currentChordIndex];
      const freq = activeChord[0] * 2.0; // Drone root string voice
      this.synthesizeViolinNote(freq, this.volViolin, 3.8, this.audioCtx.currentTime);
    }

    // F. Harp Pluck
    if (this.volHarp > 0.05 && step % 3 === 0) {
      const activeChord = this.chords[this.currentChordIndex];
      const freq = activeChord[Math.floor(Math.random() * activeChord.length)] * 4.0;
      this.synthesizeHarpNote(freq, this.volHarp, 2.0, this.audioCtx.currentTime);
    }

    this.currentStep = (this.currentStep + 1) % 8;
  }

  // --- MULTI-TRACK MIDI SCHEDULER ENGINE ---

  private startMidiScheduler() {
    if (this.midiSchedulerTimer) clearInterval(this.midiSchedulerTimer);

    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    const keys = ['synth', 'flute', 'piano', 'guitar', 'violin', 'harp', 'beats'];
    keys.forEach(key => {
      this.playbackStartTimes[key] = now + 0.2; // slight start offset
      this.nextNoteIndices[key] = 0;
    });

    this.midiSchedulerTimer = setInterval(() => {
      this.tickMidiScheduler();
    }, this.scheduleIntervalMs);
  }

  private stopMidiStreams() {
    if (this.midiSchedulerTimer) {
      clearInterval(this.midiSchedulerTimer);
      this.midiSchedulerTimer = null;
    }
  }

  private tickMidiScheduler() {
    if (!this.audioCtx || !this.isBgmPlaying) return;

    const now = this.audioCtx.currentTime;
    const keys = ['synth', 'flute', 'piano', 'guitar', 'violin', 'harp', 'beats'];

    keys.forEach(key => {
      const parsedFile = this.parsedMidis[key];
      if (!parsedFile) return;

      const startTime = this.playbackStartTimes[key] || now;
      const elapsedTime = now - startTime;

      // Extract notes inside all tracks of this parsed file
      let allNotes: ParsedMidiNote[] = [];
      parsedFile.tracks.forEach(track => {
        allNotes = allNotes.concat(track.notes);
      });

      // Maintain chronological list sorted
      allNotes.sort((a,b) => a.time - b.time);

      let nextIndex = this.nextNoteIndices[key] || 0;

      while (nextIndex < allNotes.length) {
        const note = allNotes[nextIndex];

        // Is the note inside our scheduling window?
        if (note.time <= elapsedTime + this.lookaheadSeconds) {
          if (note.time >= elapsedTime) {
            const triggerTime = startTime + note.time;
            const targetFreq = midiToFreq(note.pitch);
            this.playMidiTrackInstrument(key, targetFreq, note.velocity, note.duration, triggerTime);
          }
          nextIndex++;
        } else {
          break; // Since notes are sorted, we can safely exit loop
        }
      }

      this.nextNoteIndices[key] = nextIndex;

      // Wrap-around looping mechanism
      if (elapsedTime >= parsedFile.duration || nextIndex >= allNotes.length) {
        this.nextNoteIndices[key] = 0;
        this.playbackStartTimes[key] = now + 0.1; // wrap loop points cleanly
      }
    });

    // Provide background drum beat pulses if bpm-based beat tracks are enabled
    if (this.volBeats > 0.05) {
      const beatsCycleSeconds = 60 / this.bpm;
      const currentQuarterBeat = Math.floor((now % 100) / beatsCycleSeconds);
      if (now % beatsCycleSeconds < 0.04) {
        if (currentQuarterBeat % 2 === 0) {
          this.synthesizeLofiKick();
        } else {
          this.synthesizeNoiseShaker();
        }
      }
    }
  }

  /**
   * Routes MIDI note events to respective custom physical string/woodwind model synthesizers
   */
  private playMidiTrackInstrument(key: string, freq: number, velocity: number, duration: number, time: number) {
    switch (key) {
      case 'synth':
        this.synthesizeMidiPadVoice(freq, velocity, duration, time);
        break;
      case 'flute':
        this.synthesizeFluteNote(freq, this.volFlute * velocity, duration, time);
        break;
      case 'piano':
        this.synthesizePianoPluck(freq, this.volPiano * velocity, duration, time);
        break;
      case 'guitar':
        this.synthesizeGuitarPluck(freq, this.volGuitar * velocity, duration, time);
        break;
      case 'violin':
        this.synthesizeViolinNote(freq, this.volViolin * velocity, duration, time);
        break;
      case 'harp':
        this.synthesizeHarpNote(freq, this.volHarp * velocity, duration, time);
        break;
    }
  }

  // --- DETAILED ACOUSTIC SYNTHESIZERS ---

  private playBackgroundPad() {
    if (!this.audioCtx || !this.masterGain || !this.isBgmPlaying) return;

    const volume = this.volSynth;
    if (volume < 0.02) {
      this.fadeBackgroundPads(3.5);
      return;
    }

    const chord = this.chords[this.currentChordIndex];
    const now = this.audioCtx.currentTime;
    const nextNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

    // Fade out previous chord voices
    const oldNodes = [...this.synthNodes];
    this.synthNodes = [];

    oldNodes.forEach(node => {
      try {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(node.gain.gain.value, now);
        node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
        setTimeout(() => {
          try {
            node.osc.stop();
            node.osc.disconnect();
            node.gain.disconnect();
          } catch (e) {}
        }, 3500);
      } catch (e) {}
    });

    // Fade in new sweep pads
    chord.slice(0, 4).forEach((freq, index) => {
      if (!this.audioCtx || !this.masterGain) return;
      try {
        const osc = this.audioCtx.createOscillator();
        const voiceGain = this.audioCtx.createGain();

        osc.type = index === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        voiceGain.gain.setValueAtTime(0, now);
        const primaryVol = index === 0 ? 0.35 : 0.20;
        const targetGainValue = primaryVol * volume;

        voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetGainValue), now + 3.5);

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);

        osc.connect(filter);
        filter.connect(voiceGain);
        voiceGain.connect(this.masterGain);
        osc.start(now);

        nextNodes.push({ osc, gain: voiceGain });
      } catch (e) {}
    });

    this.synthNodes = nextNodes;
  }

  private synthesizeMidiPadVoice(freq: number, velocity: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    const volume = this.volSynth * velocity;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.35 * volume, time + 0.35); // Slow pad attack
      gain.gain.setValueAtTime(0.35 * volume, time + duration - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 1.5);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, time);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + duration + 1.8);
    } catch (e) {}
  }

  private synthesizeLofiKick() {
    if (!this.audioCtx || !this.masterGain) return;
    const now = this.audioCtx.currentTime;
    const volume = this.volBeats;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.55 * volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  private synthesizeNoiseShaker() {
    if (!this.audioCtx || !this.masterGain) return;
    const now = this.audioCtx.currentTime;
    const volume = this.volBeats;

    try {
      const bufferSize = this.audioCtx.sampleRate * 0.04;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(7500, now);
      filter.Q.value = 1.2;

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12 * volume, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(now);
    } catch (e) {}
  }

  private synthesizePianoPluck(freq: number, volume: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const oscPrime = this.audioCtx.createOscillator();
      const oscHarmonic = this.audioCtx.createOscillator();
      const voiceGain = this.audioCtx.createGain();

      oscPrime.type = 'sine';
      oscPrime.frequency.setValueAtTime(freq, time);

      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 1.503, time);

      const overtoneGain = this.audioCtx.createGain();
      overtoneGain.gain.setValueAtTime(0.18, time);

      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(0.50 * volume, time + 0.01);
      voiceGain.gain.exponentialRampToValueAtTime(0.08 * volume, time + 0.25);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      const delayFilter = this.audioCtx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(1400, time);

      oscPrime.connect(delayFilter);
      oscHarmonic.connect(overtoneGain).connect(delayFilter);
      delayFilter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      oscPrime.start(time);
      oscHarmonic.start(time);

      oscPrime.stop(time + duration + 0.5);
      oscHarmonic.stop(time + duration + 0.5);
    } catch (e) {}
  }

  private synthesizeGuitarPluck(freq: number, volume: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const voiceGain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(0.55 * volume, time + 0.008);
      voiceGain.gain.exponentialRampToValueAtTime(0.12 * volume, time + 0.15);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      const bodyFilter = this.audioCtx.createBiquadFilter();
      bodyFilter.type = 'lowpass';
      bodyFilter.frequency.setValueAtTime(1000, time);
      bodyFilter.frequency.exponentialRampToValueAtTime(180, time + 0.35);
      bodyFilter.Q.value = 3.5;

      osc.connect(bodyFilter);
      bodyFilter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + duration + 0.5);
    } catch (e) {}
  }

  private synthesizeFluteNote(freq: number, volume: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const voiceGain = this.audioCtx.createGain();
      const vibratoLfo = this.audioCtx.createOscillator();
      const vibratoGain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      vibratoLfo.frequency.value = 5.2;
      vibratoGain.gain.value = 5.5;
      vibratoLfo.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(0.35 * volume, time + 0.35);
      voiceGain.gain.exponentialRampToValueAtTime(0.15 * volume, time + 1.1);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 1.5, time);
      filter.Q.value = 1.2;

      osc.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      vibratoLfo.start(time);
      osc.start(time);

      vibratoLfo.stop(time + duration + 0.5);
      osc.stop(time + duration + 0.5);
    } catch (e) {}
  }

  private synthesizeViolinNote(freq: number, volume: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const voiceGain = this.audioCtx.createGain();
      const vibrato = this.audioCtx.createOscillator();
      const vibratoGain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      vibrato.frequency.value = 5.8;
      vibratoGain.gain.value = freq * 0.015;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, time);
      filter.frequency.exponentialRampToValueAtTime(750, time + 0.6);

      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(0.35 * volume, time + 0.35); // bow attack shape
      voiceGain.gain.setValueAtTime(0.35 * volume, time + duration - 0.2);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.8);

      osc.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      vibrato.start(time);
      osc.start(time);

      vibrato.stop(time + duration + 1.2);
      osc.stop(time + duration + 1.2);
    } catch (e) {}
  }

  private synthesizeHarpNote(freq: number, volume: number, duration: number, time: number) {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const voiceGain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      voiceGain.gain.setValueAtTime(0, time);
      voiceGain.gain.linearRampToValueAtTime(0.55 * volume, time + 0.003); // extreme transient attack plucking
      voiceGain.gain.exponentialRampToValueAtTime(0.04 * volume, time + 0.15);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, time);
      filter.frequency.exponentialRampToValueAtTime(280, time + 0.8);

      // Dedicated reflection delays representation
      const delay = this.audioCtx.createDelay();
      delay.delayTime.value = 0.22;
      const feedback = this.audioCtx.createGain();
      feedback.gain.value = 0.35;

      osc.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(this.masterGain);

      voiceGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + duration + 0.5);
    } catch (e) {}
  }

  // --- CLEANUPS ---

  private fadeBackgroundPads(duration: number) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    this.synthNodes.forEach(node => {
      try {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(node.gain.gain.value, now);
        node.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        setTimeout(() => {
          try {
            node.osc.stop();
            node.osc.disconnect();
            node.gain.disconnect();
          } catch (e) {}
        }, (duration + 0.5) * 1000);
      } catch (e) {}
    });
    this.synthNodes = [];
  }

  private stopSynthesizedMusic() {
    if (!this.isBgmPlaying) return;
    this.isBgmPlaying = false;

    this.stopGenerativeSequencer();
    this.stopMidiStreams();
  }

  public stop() {
    this.stopCustomUrl();
    this.stopSynthesizedMusic();
  }

  public resumeOnInteraction() {
    if (this.shouldPlayCustom && this.customAudio) {
      this.customAudio.play().catch(() => {});
    }
    if (this.isBgmPlaying && this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }
}

export const bgm = new BgmService();
