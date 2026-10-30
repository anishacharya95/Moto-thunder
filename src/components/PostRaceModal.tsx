import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { RiderRaceState } from '../types/game';
import { Trophy, Award, Clock, ArrowRight, RotateCcw, Home } from 'lucide-react';

interface PostRaceModalProps {
  results: RiderRaceState[];
  circuitName: string;
  earnedCredits: number;
  onRestart: () => void;
  onMenu: () => void;
  onNextRace?: () => void;
}

function formatTime(ms: number | null): string {
  if (!ms) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export const PostRaceModal: React.FC<PostRaceModalProps> = ({
  results,
  circuitName,
  earnedCredits,
  onRestart,
  onMenu,
  onNextRace,
}) => {
  const playerResult = results.find((r) => r.rider.isPlayer) || results[0];
  const playerPos = playerResult.currentPosition;
  const isPodium = playerPos <= 3;

  useEffect(() => {
    if (isPodium) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#ef4444', '#10b981', '#3b82f6'],
        });
      } catch {}
    }
  }, [isPodium]);

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 font-racing">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">
              Race Finished • {circuitName}
            </div>
            <h2 className="text-2xl font-teko font-bold uppercase tracking-wide text-white">
              Official Classification
            </h2>
          </div>

          {/* Position Emblem */}
          <div className="flex items-center gap-3">
            <div className={`px-4 py-1.5 rounded-2xl flex items-center gap-2 border ${
              playerPos === 1
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : isPodium
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-teko font-bold">
                P{playerPos}
              </span>
            </div>

            {/* Prize Credits */}
            <div className="px-4 py-1.5 rounded-2xl bg-emerald-950/60 border border-emerald-600/60 text-emerald-300 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <span className="text-lg font-teko font-bold tracking-wide">
                +${earnedCredits.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-y-auto mb-4 border border-zinc-800 rounded-2xl bg-zinc-900/40">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 text-zinc-400 uppercase text-[10px] tracking-wider sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Pos</th>
                <th className="py-2.5 px-3">Rider</th>
                <th className="py-2.5 px-3">Bike</th>
                <th className="py-2.5 px-3">Best Lap</th>
                <th className="py-2.5 px-3">Gap / Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {results.map((r) => {
                const isP = r.rider.isPlayer;
                return (
                  <tr
                    key={r.rider.id}
                    className={`${isP ? 'bg-amber-500/15 font-bold text-amber-200' : 'text-zinc-300 hover:bg-zinc-800/30'}`}
                  >
                    <td className="py-2 px-3 font-teko text-base">
                      #{r.currentPosition}
                    </td>
                    <td className="py-2 px-3 flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 font-mono">#{r.rider.number}</span>
                      <span>{r.rider.name}</span>
                      {isP && <span className="text-[9px] bg-amber-400 text-black px-1.5 py-0.2 rounded font-bold">YOU</span>}
                    </td>
                    <td className="py-2 px-3 text-zinc-400">{r.rider.bikeId.replace('_', ' ').toUpperCase()}</td>
                    <td className="py-2 px-3 font-mono">{formatTime(r.bestLapTime)}</td>
                    <td className="py-2 px-3 font-mono text-zinc-400">
                      {r.finishTime ? formatTime(r.finishTime) : '+0.00s'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={onMenu}
            className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 flex items-center gap-2 text-sm font-bold active:scale-95 transition-transform"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>

          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="px-5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 text-white flex items-center gap-2 text-sm font-bold active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>Restart Race</span>
            </button>

            {onNextRace && (
              <button
                onClick={onNextRace}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-2 text-sm font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-transform"
              >
                <span>Next Round</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
