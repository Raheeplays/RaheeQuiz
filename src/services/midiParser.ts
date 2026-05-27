// Robust Client-Side Standard Binary MIDI File Parser
// Decodes raw .mid ArrayBuffer into musical event sequences of note pitches, velocities, and note durations in seconds.

export interface ParsedMidiNote {
  pitch: number;      // MIDI pitch number (e.g. 60 = Middle C)
  time: number;       // Absolute start time in seconds
  duration: number;   // Duration of the note in seconds
  velocity: number;   // Note strike velocity (0.0 to 1.0)
}

export interface ParsedMidiTrack {
  id: number;
  name: string;
  notes: ParsedMidiNote[];
}

export interface ParsedMidiFile {
  format: number;
  ticksPerBeat: number;
  bpm: number;
  duration: number; // overall duration in seconds
  tracks: ParsedMidiTrack[];
}

/**
 * Parses any standard MIDI file (.mid) from an ArrayBuffer
 */
export function parseMidiFile(arrayBuffer: ArrayBuffer): ParsedMidiFile {
  const view = new DataView(arrayBuffer);
  const reader = { offset: 0 };

  const readString = (length: number): string => {
    let s = '';
    for (let i = 0; i < length; i++) {
      if (reader.offset >= view.byteLength) break;
      s += String.fromCharCode(view.getUint8(reader.offset++));
    }
    return s;
  };

  const readUint32 = (): number => {
    if (reader.offset + 4 > view.byteLength) return 0;
    const v = view.getUint32(reader.offset);
    reader.offset += 4;
    return v;
  };

  const readUint16 = (): number => {
    if (reader.offset + 2 > view.byteLength) return 0;
    const v = view.getUint16(reader.offset);
    reader.offset += 2;
    return v;
  };

  const readUint8 = (): number => {
    if (reader.offset >= view.byteLength) return 0;
    return view.getUint8(reader.offset++);
  };

  const readVLQ = (): number => {
    let value = 0;
    while (true) {
      if (reader.offset >= view.byteLength) break;
      const b = readUint8();
      value = (value << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return value;
  };

  // 1. Read 'MThd' header
  const headerId = readString(4);
  if (headerId !== 'MThd') {
    throw new Error('Invalid MIDI File: Missing MThd header. Found identifier: ' + headerId);
  }

  const headerLength = readUint32();
  const format = readUint16();
  const numTracks = readUint16();
  const division = readUint16();

  // If header length was larger than standard 6 bytes, seek past any extra data
  if (headerLength > 6) {
    reader.offset += (headerLength - 6);
  }

  // Ticks per beat (usually 96, 120, 192, 480, etc.)
  let ticksPerBeat = division;
  if (division & 0x8000) {
    // SMPTE timecode (rarely used for ambient MIDI targets, default to 192 ticks/beat fallback)
    ticksPerBeat = 192;
  }

  let globalBpm = 120; // Default MIDI tempo is 120 BPM
  const tracks: ParsedMidiTrack[] = [];

  // Maintain active tempos across the sequence to map tick timestamps to absolute seconds
  // Standard format: [ { tick: number, tempoBpm: number, cumulativeSeconds: number } ]
  const tempoChanges: { tick: number; bpm: number; sec: number }[] = [
    { tick: 0, bpm: 120, sec: 0 }
  ];

  const convertTicksToSeconds = (absoluteTicks: number): number => {
    let currentSec = 0;
    let lastTick = 0;
    let lastBpm = 120;

    for (const change of tempoChanges) {
      if (absoluteTicks <= change.tick) {
        break;
      }
      const deltaTicks = change.tick - lastTick;
      const ticksPerSec = (lastBpm * ticksPerBeat) / 60;
      currentSec += deltaTicks / ticksPerSec;
      
      lastTick = change.tick;
      lastBpm = change.bpm;
    }

    const remainingTicks = absoluteTicks - lastTick;
    const ticksPerSec = (lastBpm * ticksPerBeat) / 60;
    return currentSec + (remainingTicks / ticksPerSec);
  };

  // 2. Parse MTrk chunks
  for (let t = 0; t < numTracks; t++) {
    // Guard against corrupt arrays extending beyond boundaries
    if (reader.offset >= view.byteLength) break;

    const trackId = readString(4);
    if (trackId !== 'MTrk') {
      // Skip unknown/corrupted chunks gracefully
      if (reader.offset + 4 <= view.byteLength) {
        const skipLen = readUint32();
        reader.offset += skipLen;
      }
      continue;
    }

    const trackLen = readUint32();
    const trackEndOffset = reader.offset + trackLen;

    let currentTick = 0;
    let runningStatus = 0;
    
    interface MidiNodeOpen {
      pitch: number;
      startTick: number;
      velocity: number;
    }
    const openNotes = new Map<number, MidiNodeOpen>();
    const notesList: ParsedMidiNote[] = [];
    let trackName = `Track ${t + 1}`;

    while (reader.offset < trackEndOffset && reader.offset < view.byteLength) {
      const deltaTicks = readVLQ();
      currentTick += deltaTicks;

      let statusByte = readUint8();
      
      // Running status support:
      // If the byte doesn't have the MSB set (0x80), it is a data byte of previous status
      if ((statusByte & 0x80) === 0) {
        if (runningStatus === 0) {
          // Fallback if file is corrupted
          continue;
        }
        statusByte = runningStatus;
        reader.offset--; // Put the data byte back
      } else {
        runningStatus = statusByte;
      }

      const messageType = statusByte & 0xF0;
      const channel = statusByte & 0x0F;

      if (statusByte === 0xFF) {
        // Meta Events
        const metaType = readUint8();
        const metaLength = readVLQ();
        const metaStartOffset = reader.offset;

        if (metaType === 0x03) {
          // Track Name
          const tempName = readString(metaLength);
          if (tempName.trim().length > 0) {
            trackName = tempName.trim();
          }
        } else if (metaType === 0x51) {
          // Set Tempo Meta Event
          // 3-byte tempo value (microseconds per beat)
          if (metaLength >= 3) {
            const byte1 = readUint8();
            const byte2 = readUint8();
            const byte3 = readUint8();
            const uSecPerBeat = (byte1 << 16) | (byte2 << 8) | byte3;
            const bpmValue = Math.round(60000000 / uSecPerBeat);
            
            if (bpmValue > 10 && bpmValue < 300) {
              if (t === 0) {
                globalBpm = bpmValue;
              }
              // Calculate and register tempo changes
              const elapsedSeconds = convertTicksToSeconds(currentTick);
              tempoChanges.push({ tick: currentTick, bpm: bpmValue, sec: elapsedSeconds });
              tempoChanges.sort((a, b) => a.tick - b.tick);
            }
          }
          // Consume any remaining meta length bytes
          const remaining = metaLength - (reader.offset - metaStartOffset);
          if (remaining > 0) reader.offset += remaining;
        } else if (metaType === 0x2F) {
          // End of Track
          reader.offset = trackEndOffset; // Skip to end of track
          break;
        } else {
          // Other Meta Event (e.g. copyright, lyrics, key signature) - Skip
          reader.offset += metaLength;
        }
      } else if (messageType === 0x90) {
        // Note On event
        const pitch = readUint8();
        const velocity = readUint8();

        if (velocity > 0) {
          // Close old note if it was somehow open
          if (openNotes.has(pitch)) {
            const old = openNotes.get(pitch)!;
            const noteStartSec = convertTicksToSeconds(old.startTick);
            const noteEndSec = convertTicksToSeconds(currentTick);
            notesList.push({
              pitch,
              time: noteStartSec,
              duration: Math.max(0.05, noteEndSec - noteStartSec),
              velocity: old.velocity / 127
            });
          }
          openNotes.set(pitch, {
            pitch,
            startTick: currentTick,
            velocity
          });
        } else {
          // Velocity is 0, behaves like Note Off
          if (openNotes.has(pitch)) {
            const old = openNotes.get(pitch)!;
            const noteStartSec = convertTicksToSeconds(old.startTick);
            const noteEndSec = convertTicksToSeconds(currentTick);
            notesList.push({
              pitch,
              time: noteStartSec,
              duration: Math.max(0.05, noteEndSec - noteStartSec),
              velocity: old.velocity / 127
            });
            openNotes.delete(pitch);
          }
        }
      } else if (messageType === 0x80) {
        // Note Off event
        const pitch = readUint8();
        const velocity = readUint8(); // release velocity (not heavily used, skip)
        
        if (openNotes.has(pitch)) {
          const old = openNotes.get(pitch)!;
          const noteStartSec = convertTicksToSeconds(old.startTick);
          const noteEndSec = convertTicksToSeconds(currentTick);
          notesList.push({
            pitch,
            time: noteStartSec,
            duration: Math.max(0.05, noteEndSec - noteStartSec),
            velocity: old.velocity / 127
          });
          openNotes.delete(pitch);
        }
      } else if (messageType === 0xB0 || messageType === 0xE0 || messageType === 0xA0) {
        // Control Change, Pitch Bend, Poly Pressure (2 parameters)
        readUint8();
        readUint8();
      } else if (messageType === 0xC0 || messageType === 0xD0) {
        // Program Change, Channel Pressure (1 parameter)
        readUint8();
      } else if (statusByte === 0xF0 || statusByte === 0xF7) {
        // SysEx messages
        const sysexLength = readVLQ();
        reader.offset += sysexLength;
      }
    }

    // Force close any notes still open at the end of the track
    openNotes.forEach((old) => {
      const noteStartSec = convertTicksToSeconds(old.startTick);
      const noteEndSec = convertTicksToSeconds(currentTick);
      notesList.push({
        pitch: old.pitch,
        time: noteStartSec,
        duration: Math.max(0.1, noteEndSec - noteStartSec),
        velocity: old.velocity / 127
      });
    });

    if (notesList.length > 0) {
      // Sort notes chronologically by start time
      notesList.sort((a, b) => a.time - b.time);
      tracks.push({
        id: t,
        name: trackName,
        notes: notesList
      });
    }

    // Always seek right to the end offset of current track
    reader.offset = trackEndOffset;
  }

  // Calculate overall midi file duration
  let maxDuration = 0;
  tracks.forEach(track => {
    track.notes.forEach(note => {
      if (note.time + note.duration > maxDuration) {
        maxDuration = note.time + note.duration;
      }
    });
  });

  return {
    format,
    ticksPerBeat,
    bpm: globalBpm,
    duration: maxDuration,
    tracks
  };
}
