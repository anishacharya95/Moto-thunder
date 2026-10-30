import React from 'react';
import { CIRCUITS } from '../data/circuits';
import { PlayerSaveData } from '../types/game';
import { Trophy, ArrowLeft, Flag, CheckCircle, Play } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface ChampionshipViewProps {
  saveData: PlayerSaveData;
  onStartRound: (circuitId: string) => void;
  onBack: () => void;
}

export const ChampionshipView: React.FC<ChampionshipViewProps> = ({
  saveData,
  onStartRound,
  onBack,
}) => {
  const currentRound = saveData.championshipCurrentRound;
  const isCompleted = currentRound >= CIRCUITS.length;
  const activeCircuit = CIRCUITS[Math.min(currentRound, CIRCUITS.length - 1)];

  // Sort standings by points descending
  const standings = [...saveData.championshipStandings].sort((a, b) => b.points - a.points);
  const playerRank = standings.findIndex((s) => s.isPlayer) + 1;

  return (
    <div className="absolute inset-0 bg-zinc-950 flex flex-col z-30 font-racing overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/80">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex items-center gap-2 text-xs font-bold uppercase active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="text-center">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">
            OFFICIAL WORLD GRAND PRIX
          </div>
          <h1 className="text-xl font-teko font-bold uppercase tracking-wider text-white">
            Moto Thunder Cup
          </h1>
        </div>

        {/* Player Current Standing */}
        <div className="px-4 py-1.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center gap-2 text-amber-300">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-lg font-teko font-bold tracking-wide">
            Rank P{playerRank}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
        {/* Left Column: Calendar & Next Round Card */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div className="text-xs uppercase font-bold text-zinc-400 tracking-wider">
            Season Calendar (5 Rounds)
          </div>

          <div className="space-y-2.5">
            {CIRCUITS.map((circuit, idx) => {
              const isPast = idx < currentRound;
              const isCurrent = idx === currentRound;

              return (
                <div
                  key={circuit.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                    isCurrent
                      ? 'bg-amber-500/15 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : isPast
                      ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{circuit.flag}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white uppercase">
                          R{idx + 1}: {circuit.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {circuit.lengthKm} km • {circuit.turns} Turns
                      </div>
                    </div>
                  </div>

                  {isPast ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase">
                      Current
                    </span>
                  ) : (
                    <Flag className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Action button */}
          <div className="mt-auto pt-4">
            {!isCompleted ? (
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onStartRound(activeCircuit.id);
                }}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase text-sm tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-95 transition-transform"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Enter Round {currentRound + 1}: {activeCircuit.name}</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-600 text-emerald-300 text-center font-bold">
                🏆 Season Completed! You finished in Position {playerRank}!
              </div>
            )}
          </div>
        </div>

        {/* Right 2 Columns: Standings Table */}
        <div className="md:col-span-2 flex flex-col bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800">
            <h2 className="text-lg font-teko font-bold uppercase tracking-wider text-white">
              Championship Standings
            </h2>
            <span className="text-xs text-zinc-400 font-mono">
              Round {Math.min(currentRound, 5)} of 5
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Rider</th>
                  <th className="py-2.5 px-3">Machine</th>
                  <th className="py-2.5 px-3 text-center">Wins</th>
                  <th className="py-2.5 px-3 text-center">Podiums</th>
                  <th className="py-2.5 px-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {standings.map((s, idx) => (
                  <tr
                    key={s.riderId}
                    className={`${s.isPlayer ? 'bg-amber-500/15 font-bold text-amber-200' : 'text-zinc-300'}`}
                  >
                    <td className="py-2.5 px-3 font-teko text-lg">
                      #{idx + 1}
                    </td>
                    <td className="py-2.5 px-3 flex items-center gap-2">
                      <span>{s.name}</span>
                      {s.isPlayer && (
                        <span className="text-[9px] bg-amber-400 text-black px-1.5 py-0.2 rounded font-bold">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400">{s.bikeName}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{s.wins}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{s.podiums}</td>
                    <td className="py-2.5 px-3 text-right font-teko text-xl font-bold text-amber-400">
                      {s.points} PTS
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
