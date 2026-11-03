import * as THREE from 'three';
import { BuiltTrack } from './trackBuilder';

/**
 * Precomputed track geometry for AI decision making.
 *
 * Built once per track from the existing centerline samples, so per-frame AI
 * work is a pair of array lookups instead of spline tangent queries. All
 * arrays are indexed by `floor(progress * sampleCount) % sampleCount`.
 */
export interface RacingLineData {
  sampleCount: number;
  spacingM: number;          // meters between samples
  trackLength: number;
  halfWidth: number;
  /** Signed curvature per sample (1/m): > 0 turns toward +normal (right). */
  curvature: Float32Array;
  /** Corner radius per sample (m); straights clamp to RADIUS_STRAIGHT. */
  radius: Float32Array;
  /** Geometric racing line: outside entry -> apex -> outside exit (meters). */
  targetOffset: Float32Array;
  /** 1 when the next ~70 m ahead stays gentle (overtake/slipstream zone). */
  isStraight: Uint8Array;
}

export const RADIUS_STRAIGHT = 5000;
/** Curvature below this counts as a straight (radius > ~450 m). */
const KAPPA_THRESHOLD = 1 / 450;
/** How far before/after a corner the line runs wide (meters). */
const ENTRY_EXIT_EXTEND_M = 45;
/** Straight lookahead used for slipstream / overtaking decisions (meters). */
const STRAIGHT_LOOKAHEAD_M = 70;

const cache = new WeakMap<BuiltTrack, RacingLineData>();

function sampleIndexAt(line: RacingLineData, progress: number): number {
  const p = progress - Math.floor(progress); // wrap into [0, 1)
  // Round rather than floor so wrapped floats land on the same sample as
  // their exact value (1.2 must hit the same index as 0.2).
  return Math.round(p * line.sampleCount) % line.sampleCount;
}

export function lineIndexAt(line: RacingLineData, progress: number): number {
  return sampleIndexAt(line, progress);
}

/** Radius (m) at a progress point; straights return RADIUS_STRAIGHT. */
export function radiusAt(line: RacingLineData, progress: number): number {
  return line.radius[sampleIndexAt(line, progress)];
}

/** Base racing-line lateral offset (m) at a progress point. */
export function lineOffsetAt(line: RacingLineData, progress: number): number {
  return line.targetOffset[sampleIndexAt(line, progress)];
}

/** Signed corner direction at a progress point: +1 toward +normal, -1 away. 0 = straight. */
export function cornerDirAt(line: RacingLineData, progress: number): number {
  const k = line.curvature[sampleIndexAt(line, progress)];
  if (Math.abs(k) < KAPPA_THRESHOLD) return 0;
  return k > 0 ? 1 : -1;
}

export function isStraightAt(line: RacingLineData, progress: number): boolean {
  return line.isStraight[sampleIndexAt(line, progress)] === 1;
}

/**
 * Builds (and caches) the racing line for a built track.
 *
 * The line is derived purely from the track spline: contiguous runs of real
 * curvature become corners, each corner gets an outside-inside-outside
 * offset profile over its entry/apex/exit span, and everything else stays on
 * the centerline for the moment the overtaking logic adds dynamic offsets.
 */
export function getRacingLine(track: BuiltTrack): RacingLineData {
  const cached = cache.get(track);
  if (cached) return cached;

  const samples = track.centerlineSamples;
  const n = samples.length;
  const trackLength = track.trackLength;
  const spacingM = trackLength / n;
  const halfWidth = track.getTrackWidth() * 0.5;

  const curvature = new Float32Array(n);
  const radius = new Float32Array(n);
  const targetOffset = new Float32Array(n);
  const isStraight = new Uint8Array(n);

  // 1. Signed curvature from heading change between consecutive tangents.
  //    heading = atan2(t.x, -t.z) matches the physics heading convention,
  //    so a positive delta turns toward +normal (the normal is cross(t, up)).
  for (let i = 0; i < n; i++) {
    const t1 = samples[i].tangent;
    const t2 = samples[(i + 1) % n].tangent;
    const h1 = Math.atan2(t1.x, -t1.z);
    const h2 = Math.atan2(t2.x, -t2.z);
    let dh = h2 - h1;
    if (dh > Math.PI) dh -= Math.PI * 2;
    else if (dh < -Math.PI) dh += Math.PI * 2;
    curvature[i] = dh / spacingM;
  }

  // 2. Smooth curvature (3-sample moving average) so run detection and the
  //    radius ladder ignore single-sample spline noise.
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = curvature[(i - 1 + n) % n];
    const b = curvature[i];
    const c = curvature[(i + 1) % n];
    smooth[i] = (a + b + c) / 3;
  }

  // 3. Radius per sample from smoothed curvature (straights clamp high).
  for (let i = 0; i < n; i++) {
    const k = Math.abs(smooth[i]);
    radius[i] = k > 1e-7 ? Math.min(RADIUS_STRAIGHT, 1 / k) : RADIUS_STRAIGHT;
  }

  // 4. Corner runs: contiguous curvature beyond threshold, merged across
  //    short gaps (and across the start/finish seam) only when the corner
  //    direction matches, so an S-bend keeps opposite apex sides.
  const extSamples = Math.max(2, Math.round(ENTRY_EXIT_EXTEND_M / spacingM));
  const mergeGap = Math.max(2, Math.round(30 / spacingM));

  const raw: { start: number; len: number; dir: number }[] = [];
  let i = 0;
  while (i < n) {
    if (Math.abs(smooth[i]) < KAPPA_THRESHOLD) {
      i++;
      continue;
    }
    const start = i;
    let peak = smooth[i];
    while (i < n && Math.abs(smooth[i]) >= KAPPA_THRESHOLD) {
      if (Math.abs(smooth[i]) > Math.abs(peak)) peak = smooth[i];
      i++;
    }
    raw.push({ start, len: i - start, dir: peak >= 0 ? 1 : -1 });
  }

  // Merge adjacent same-direction runs separated by a short straight.
  const runs: { start: number; len: number; dir: number }[] = [];
  for (const run of raw) {
    const prev = runs[runs.length - 1];
    if (prev) {
      const gap = run.start - (prev.start + prev.len);
      if (gap <= mergeGap && prev.dir === run.dir) {
        prev.len += gap + run.len;
        continue;
      }
    }
    runs.push({ ...run });
  }

  // A corner crossing the start/finish line: stitch last + first when they
  // touch across the seam with the same direction (keeps `start` at the
  // later position so modulo painting walks forward through the wrap).
  if (runs.length >= 2) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    const seamGap = first.start + n - (last.start + last.len);
    if (seamGap <= mergeGap && first.dir === last.dir) {
      last.len += seamGap + first.len;
      runs.shift();
    }
  }

  // 5. Paint each corner's outside-inside-outside profile:
  //    offset = -dir * A * cos(2*pi*u), u across the extended span.
  //    u=0 outside, u=0.5 apex (inside), u=1 outside again.
  const A = Math.max(2.5, halfWidth - 1.5);
  const sum = new Float32Array(n);
  const count = new Uint8Array(n);

  for (const run of runs) {
    const span = run.len + extSamples * 2;
    for (let k = -extSamples; k < run.len + extSamples; k++) {
      const u = (k + extSamples) / span;
      const idx = (((run.start + k) % n) + n) % n;
      sum[idx] += -run.dir * A * Math.cos(2 * Math.PI * u);
      count[idx]++;
    }
  }

  for (let j = 0; j < n; j++) {
    targetOffset[j] = count[j] > 0 ? sum[j] / count[j] : 0;
  }

  // Light smoothing removes kinks where two corner profiles meet.
  const smoothed = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    smoothed[j] =
      (targetOffset[(j - 1 + n) % n] + targetOffset[j] * 2 + targetOffset[(j + 1) % n]) / 4;
  }
  targetOffset.set(smoothed);

  // 6. Straight flags: gentle curvature for the next ~70 m.
  const straightLook = Math.max(2, Math.round(STRAIGHT_LOOKAHEAD_M / spacingM));
  for (let j = 0; j < n; j++) {
    let gentle = true;
    for (let k = 0; k < straightLook; k++) {
      if (Math.abs(smooth[(j + k) % n]) >= KAPPA_THRESHOLD) {
        gentle = false;
        break;
      }
    }
    isStraight[j] = gentle ? 1 : 0;
  }

  const line: RacingLineData = {
    sampleCount: n,
    spacingM,
    trackLength,
    halfWidth,
    curvature,
    radius,
    targetOffset,
    isStraight,
  };
  cache.set(track, line);
  return line;
}

/** Scratch vectors for hot paths — never retained across calls. */
export const SCRATCH_P = new THREE.Vector3();
export const SCRATCH_T = new THREE.Vector3();
