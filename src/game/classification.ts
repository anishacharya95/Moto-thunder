import { RiderRaceState } from '../types/game';

/**
 * Pure race classification shared by the racing engine and headless tests.
 *
 * Ordering rules:
 *  1. Finished riders rank ahead of unfinished riders, ordered by finish time.
 *  2. Everyone else is ordered by race distance (laps completed + progress).
 *
 * Mutates each state's currentPosition and gap fields, and returns the
 * sorted list (leader first).
 */
export function classifyRiders(allRiders: RiderRaceState[]): RiderRaceState[] {
  allRiders.sort((a, b) => {
    const aFinished = a.finished && a.finishTime !== null;
    const bFinished = b.finished && b.finishTime !== null;
    if (aFinished && bFinished) return (a.finishTime as number) - (b.finishTime as number);
    if (aFinished) return -1;
    if (bFinished) return 1;
    return b.distanceOnTrack - a.distanceOnTrack;
  });

  allRiders.forEach((r, idx) => {
    r.currentPosition = idx + 1;
  });

  const leader = allRiders[0];
  allRiders.forEach((r, idx) => {
    r.gapToLeaderSec = estimateGapSec(leader, r);
    r.gapToAheadSec = idx === 0 ? 0 : estimateGapSec(allRiders[idx - 1], r);
    r.gapToBehindSec =
      idx === allRiders.length - 1 ? 0 : estimateGapSec(r, allRiders[idx + 1]);
  });

  return allRiders;
}

/** Time gap between a rider and the rider ahead (finish-time exact when
 *  both have finished, distance/speed estimate otherwise). */
export function estimateGapSec(ahead: RiderRaceState, rider: RiderRaceState): number {
  if (ahead === rider) return 0;

  const bothFinished =
    ahead.finished &&
    rider.finished &&
    ahead.finishTime !== null &&
    rider.finishTime !== null;
  if (bothFinished) {
    return Math.max(0, ((rider.finishTime as number) - (ahead.finishTime as number)) / 1000);
  }

  const distBehind = ahead.distanceOnTrack - rider.distanceOnTrack;
  if (distBehind <= 0) return 0;
  const speedMs = Math.max(10, rider.speedKmh / 3.6);
  return distBehind / speedMs;
}
