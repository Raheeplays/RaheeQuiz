// High-Fidelity Mathematical MIDI Song Generators
// Generates deep classical and ambient sequences, allowing flawless offline-first playback
// with pitch, timing, duration, and velocity mapping across multiple tracks.

import { ParsedMidiNote, ParsedMidiFile } from './midiParser';

// Map MIDI pitch to frequency
export function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/**
 * Bach's Prelude in C Major (BWV 846) - Fully dynamic 32-bar arpeggio generator
 */
export function generateBachPrelude(): ParsedMidiFile {
  const tracks: ParsedMidiNote[] = [];
  
  // List of standard Bach arpeggiated chords (each bar repeats the same 8-note motif twice)
  const chords = [
    [48, 52, 55, 60, 64], // Bar 1: C Maj
    [48, 50, 57, 58, 62], // Bar 2: Dm7/C
    [47, 50, 55, 57, 62], // Bar 3: G7/B
    [48, 52, 55, 60, 64], // Bar 4: C Maj
    [48, 52, 57, 60, 65], // Bar 5: Am/C
    [46, 50, 55, 58, 62], // Bar 6: G7/Bb
    [45, 48, 53, 57, 60], // Bar 7: F Maj/A
    [45, 50, 53, 57, 62], // Bar 8: Dm7/A
    [43, 50, 55, 59, 62], // Bar 9: G7
    [48, 52, 55, 60, 64], // Bar 10: C Maj
    [48, 52, 56, 58, 64], // Bar 11: C7
    [49, 53, 56, 60, 65], // Bar 12: F Maj7/C#
    [50, 53, 57, 58, 65], // Bar 13: Dm7
    [40, 50, 53, 55, 62], // Bar 14: G7/E
    [41, 48, 53, 57, 60], // Bar 15: F Maj/F
    [41, 47, 50, 53, 59], // Bar 16: G7/F
    [43, 47, 50, 55, 59], // Bar 17: G7
    [48, 52, 55, 60, 64], // Bar 18: C Maj
    [48, 53, 57, 60, 65], // Bar 19: Am/C
    [50, 54, 57, 59, 66], // Bar 20: D7/F#
    [43, 47, 50, 55, 59], // Bar 21: G Maj
    [48, 50, 53, 57, 60], // Bar 22: F Maj7/C
    [47, 50, 53, 57, 59], // Bar 23: Dm7/B
    [43, 47, 50, 55, 59], // Bar 24: G7
    [48, 52, 55, 57, 64], // Bar 25: C Maj7
    [48, 53, 57, 58, 65], // Bar 26: F Maj7/C
    [47, 50, 53, 57, 59], // Bar 27: Dm7/B
    [43, 47, 50, 55, 59], // Bar 28: G7
    [48, 52, 55, 60, 64], // Bar 29: C Maj
    [48, 52, 55, 60, 64], // Bar 30: C Maj
    [48, 52, 55, 60, 64], // Bar 31: C Maj
  ];

  const noteDuration = 0.25; // Sixteenth notes at rest speed
  let currentTime = 0;

  chords.forEach((chord) => {
    // Each bar does the 8-note motif twice
    for (let motif = 0; motif < 2; motif++) {
      const notesInMotif = [
        chord[0], // Root
        chord[1], // Third
        chord[2], // Fifth
        chord[3], // Octave
        chord[4], // Tenth
        chord[2], // Fifth
        chord[3], // Octave
        chord[4]  // Tenth
      ];

      notesInMotif.forEach((pitch, i) => {
        tracks.push({
          pitch,
          time: currentTime + i * noteDuration,
          duration: noteDuration * 1.8, // smooth overlap decay
          velocity: i === 0 ? 0.85 : 0.65 // downbeat volume emphasize
        });
      });
      currentTime += 8 * noteDuration;
    }
  });

  return {
    format: 1,
    ticksPerBeat: 120,
    bpm: 78,
    duration: currentTime,
    tracks: [
      { id: 0, name: 'Classical Piano Arpeggio', notes: tracks }
    ]
  };
}

/**
 * Satie's Gymnopédie No. 1 - Famous 3/4 time signature calming ambient dream
 */
export function generateSatieGymnopudie(): ParsedMidiFile {
  const bassNotes: ParsedMidiNote[] = [];
  const harmonyNotes: ParsedMidiNote[] = [];
  const melodyNotes: ParsedMidiNote[] = [];

  const timePerBeat = 1.15; // Slow deliberate tempo (~52 BPM)
  const timePerMeasure = timePerBeat * 3; // 3/4 time signature

  // Chord progression structure (36 Bars)
  const progression = [
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 1: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 2: Dmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 3: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 4: Dmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 5: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 6: Dmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 7: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 8: Dmaj7
    { bass: 41, chord: [52, 56, 59, 64] }, // Bar 9: Fmaj7
    { bass: 36, chord: [52, 55, 59, 62] }, // Bar 10: Cmaj7
    { bass: 41, chord: [52, 56, 59, 64] }, // Bar 11: Fmaj7
    { bass: 36, chord: [52, 55, 59, 62] }, // Bar 12: Cmaj7
    { bass: 41, chord: [52, 56, 59, 64] }, // Bar 13: Fmaj7
    { bass: 36, chord: [48, 55, 59, 62] }, // Bar 14: Cmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 15: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 16: Dmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 17: Gmaj7
    { bass: 38, chord: [55, 57, 59, 64] }, // Bar 18: Dmaj7(no3)
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 19: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 20: Dmaj7
    { bass: 43, chord: [54, 57, 59, 64] }, // Bar 21: Gmaj7
    { bass: 38, chord: [52, 57, 59, 64] }, // Bar 22: Dmaj7
    { bass: 41, chord: [52, 56, 59, 64] }, // Bar 23: Fmaj7
    { bass: 36, chord: [52, 55, 59, 62] }, // Bar 24: Cmaj7
    { bass: 41, chord: [52, 56, 59, 64] }, // Bar 25: Fmaj7
    { bass: 36, chord: [52, 55, 59, 62] }, // Bar 26: Cmaj7
  ];

  // Draw the bass and chord patterns
  progression.forEach((bar, index) => {
    const startSec = index * timePerMeasure;

    // Bass note plucks isolated on beat 1
    bassNotes.push({
      pitch: bar.bass,
      time: startSec,
      duration: timePerBeat * 2.8,
      velocity: 0.75
    });

    // Chord cluster registers on Beat 2 and rings for the rest of the bar
    bar.chord.forEach((pitch) => {
      harmonyNotes.push({
        pitch,
        time: startSec + timePerBeat,
        duration: timePerBeat * 1.9,
        velocity: 0.50
      });
    });
  });

  // Calm drift melody line (registers in the higher register piano keys)
  const melodyData = [
    { pitch: 66, start: 2.5, len: 1.5 },
    { pitch: 67, start: 4.0, len: 1.5 },
    { pitch: 69, start: 5.5, len: 2.5 },
    { pitch: 64, start: 8.5, len: 2.0 },
    { pitch: 66, start: 11.5, len: 1.5 },
    { pitch: 67, start: 13.0, len: 1.5 },
    { pitch: 69, start: 14.5, len: 2.5 },
    { pitch: 71, start: 17.5, len: 1.5 },
    { pitch: 72, start: 20.5, len: 2.0 },
    { pitch: 76, start: 23.5, len: 1.5 },
    { pitch: 74, start: 25.0, len: 1.5 },
    { pitch: 71, start: 26.5, len: 2.5 },
    { pitch: 69, start: 29.5, len: 2.5 },
    { pitch: 66, start: 32.5, len: 1.5 },
    { pitch: 67, start: 34.0, len: 1.5 },
    { pitch: 69, start: 35.5, len: 2.5 },
    { pitch: 64, start: 38.5, len: 2.0 },
    { pitch: 66, start: 41.5, len: 1.5 },
    { pitch: 67, start: 43.0, len: 1.5 },
    { pitch: 69, start: 44.5, len: 2.5 },
    { pitch: 71, start: 47.5, len: 1.5 },
    { pitch: 74, start: 50.5, len: 2.0 }
  ];

  melodyData.forEach(m => {
    // scale coordinates
    melodyNotes.push({
      pitch: m.pitch,
      time: m.start * timePerBeat,
      duration: m.len * timePerBeat * 1.1,
      velocity: 0.85
    });
  });

  return {
    format: 1,
    ticksPerBeat: 120,
    bpm: 54,
    duration: progression.length * timePerMeasure,
    tracks: [
      { id: 0, name: 'Gymnopédie Bass Line', notes: bassNotes },
      { id: 1, name: 'Gymnopédie Harmony Chords', notes: harmonyNotes },
      { id: 2, name: 'Gymnopédie Solitary Melody', notes: melodyNotes }
    ]
  };
}

/**
 * Beethoven's Moonlight Sonata (Adagio) - Hypnotic triplet arpeggiations
 */
export function generateMoonlightSonata(): ParsedMidiFile {
  const triplets: ParsedMidiNote[] = [];
  const bass: ParsedMidiNote[] = [];

  const tripletDuration = 0.40; // triplets duration (~50 BPM)
  const barDuration = tripletDuration * 12; // 12 triplets per bar (4 groups of 3)

  // Arpeggio groups of chords (pitch shifts)
  const progression = [
    [52, 55, 60], // Bar 1: C# minor
    [52, 55, 60],
    [52, 56, 60], // Bar 2: D Major octaves
    [53, 57, 60],
    [52, 57, 60], // Bar 3: F# minor
    [54, 57, 61],
    [54, 57, 62], // Bar 4: G# Dominant 7
    [53, 56, 61],
    [52, 55, 60], // Bar 5: Resolve
  ];

  let currentTime = 0;

  progression.forEach((chordData, index) => {
    // Play deep tonic root octave in bass track
    bass.push({
      pitch: index === 1 ? 38 : 40,
      time: currentTime,
      duration: barDuration * 0.95,
      velocity: 0.80
    });
    bass.push({
      pitch: index === 1 ? 26 : 28,
      time: currentTime,
      duration: barDuration * 0.95,
      velocity: 0.75
    });

    // 4 triplets per bar
    for (let triple = 0; triple < 4; triple++) {
      chordData.forEach((pitch, offsetId) => {
        triplets.push({
          pitch: offsetId === 0 ? pitch : (offsetId === 1 ? pitch : pitch + 12),
          time: currentTime,
          duration: tripletDuration * 1.7, // ringing pedal decay
          velocity: 0.60 + offsetId * 0.05
        });
        currentTime += tripletDuration;
      });
    }
  });

  return {
    format: 1,
    ticksPerBeat: 120,
    bpm: 50,
    duration: currentTime,
    tracks: [
      { id: 0, name: 'Moonlight Bass Pedals', notes: bass },
      { id: 1, name: 'Moonlight Triplet Arpeggios', notes: triplets }
    ]
  };
}

/**
 * Peaceful Lotus Morning Raga - Meditative Pentatonic Indian Sitar / Flute journey
 */
export function generateMorningRaga(): ParsedMidiFile {
  const drone: ParsedMidiNote[] = [];
  const melody: ParsedMidiNote[] = [];
  
  const stepDuration = 0.55; // meditative pulse tempo
  let currentTime = 0;

  // 1. Generate slow deep atmospheric drone base (C2 & C3 octave + G2 perfect 5th)
  for (let i = 0; i < 20; i++) {
    const droneSpan = stepDuration * 16;
    drone.push({ pitch: 36, time: currentTime, duration: droneSpan * 0.98, velocity: 0.45 });
    drone.push({ pitch: 48, time: currentTime, duration: droneSpan * 0.98, velocity: 0.35 });
    drone.push({ pitch: 43, time: currentTime, duration: droneSpan * 0.98, velocity: 0.30 });
    currentTime += droneSpan;
  }

  // 2. Beautiful classical pentatonic scale transitions (notes: C-Eb-F-G-Bb-C)
  const ragaScale = [60, 63, 65, 67, 70, 72, 75, 77, 79];
  let melTime = 0;

  while (melTime < currentTime - 12) {
    const randPattern = Math.floor(Math.random() * 4);
    if (randPattern === 0) {
      // Ascending phrase
      for (let j = 0; j < 4; j++) {
        melody.push({
          pitch: ragaScale[j],
          time: melTime,
          duration: stepDuration * (1.2 + Math.random() * 0.8),
          velocity: 0.65 + Math.random() * 0.15
        });
        melTime += stepDuration;
      }
    } else if (randPattern === 1) {
      // High-register soaring phrase
      const highIdx = 4 + Math.floor(Math.random() * 4);
      melody.push({ pitch: ragaScale[highIdx], time: melTime, duration: stepDuration * 2.5, velocity: 0.80 });
      melTime += stepDuration * 2;
      melody.push({ pitch: ragaScale[highIdx - 1], time: melTime, duration: stepDuration * 1.5, velocity: 0.70 });
      melTime += stepDuration * 2;
    } else if (randPattern === 2) {
      // Syncopated flutter
      const scaleBase = Math.floor(Math.random() * 3);
      melody.push({ pitch: ragaScale[scaleBase + 2], time: melTime, duration: stepDuration * 0.5, velocity: 0.75 });
      melTime += stepDuration * 0.5;
      melody.push({ pitch: ragaScale[scaleBase + 1], time: melTime, duration: stepDuration * 0.5, velocity: 0.70 });
      melTime += stepDuration * 0.5;
      melody.push({ pitch: ragaScale[scaleBase], time: melTime, duration: stepDuration * 2.0, velocity: 0.85 });
      melTime += stepDuration * 3.0;
    } else {
      // Responding silence
      melTime += stepDuration * 4.0;
    }
  }

  return {
    format: 1,
    ticksPerBeat: 120,
    bpm: 65,
    duration: currentTime,
    tracks: [
      { id: 0, name: 'Sitar Drone backdrop', notes: drone },
      { id: 1, name: 'Raga Meditative Lead Flute', notes: melody }
    ]
  };
}

/**
 * Dictionary of preset songs
 */
export const midiPresets: { [key: string]: { name: string; generator: () => ParsedMidiFile } } = {
  satie: {
    name: "Erik Satie - Gymnopédie No. 1",
    generator: generateSatieGymnopudie
  },
  bach: {
    name: "J.S. Bach - Prelude in C Major",
    generator: generateBachPrelude
  },
  beethoven: {
    name: "L. Beethoven - Moonlight Sonata (Adagio)",
    generator: generateMoonlightSonata
  },
  raga: {
    name: "Atmospheric Morning Lotus Raga",
    generator: generateMorningRaga
  }
};
