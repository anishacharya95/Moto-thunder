import React, { useState } from 'react';
import { CIRCUITS } from '../data/circuits';
import { CircuitDefinition } from '../types/game';
import { X, Play, Clock, MapPin, Flag, ChevronLeft, ChevronRight } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface CircuitSelectModalProps {
  bestLaps: Record<string, number>;
  onSelectCircuit: (circuit: CircuitDefinition, laps: number) => void;
  onClose: () => void;
}

function formatLapTime(ms: number | undefined): string {
  if (!ms) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export const CircuitSelectModal: React.FC<CircuitSelectModalProps> = ({
  bestLaps,
  onSelectCircuit,
  onClose,
}) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [laps, setLaps] = useState(3);

  const circuit = CIRCUITS[selectedIdx];
  const bestLap = bestLaps[circuit.id];

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-40 font-racing select-none">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-amber-400">
              Grand Prix Calendar
            </div>
            <h2 className="text-2xl font-teko font-bold uppercase tracking-wider text-white">
              Select Circuit
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Circuit Card */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
            <button
              onClick={() => {
                setSelectedIdx((prev) => (prev > 0 ? prev - 1 : CIRCUITS.length - 1));
                soundEngine.playClick();
              }}
              className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 text-white active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-3xl mb-1 block">{circuit.flag}</span>
              <h3 className="text-xl font-bold uppercase text-white tracking-wide">
                {circuit.name}
              </h3>
              <div className="text-xs text-zinc-400">
                {circuit.country} • {circuit.lengthKm} km • {circuit.turns} Corners
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedIdx((prev) => (prev < CIRCUITS.length - 1 ? prev + 1 : 0));
                soundEngine.playClick();
              }}
              className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 text-white active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Circuit 2D Track Map Visualizer */}
          <div className="h-44 bg-zinc-900/40 rounded-2xl border border-zinc-800 flex items-center justify-center p-3 relative">
            <svg viewBox="-250 -400 900 800" className="w-full h-full stroke-amber-400/80 fill-none stroke-[24]">
              <path
                d={circuit.splinePoints.reduce((acc, pt, idx) => {
                  return idx === 0 ? `M ${pt[0]} ${pt[2]}` : `${acc} L ${pt[0]} ${pt[2]}`;
                }, '') + ' Z'}
              />
            </svg>
            <div className="absolute bottom-2 right-3 text-[10px] text-zinc-500 font-mono">
              GPS Layout Map
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed px-1">
            {circuit.description}
          </p>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-[10px] text-zinc-400 uppercase">Personal Best Lap</div>
                <div className="text-sm font-mono font-bold text-white">{formatLapTime(bestLap)}</div>
              </div>
            </div>

            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 flex items-center gap-3">
              <Flag className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-[10px] text-zinc-400 uppercase">Conditions</div>
                <div className="text-sm font-bold text-white capitalize">
                  {circuit.timeOfDay} • {circuit.weather}
                </div>
              </div>
            </div>
          </div>

          {/* Lap Count Selector */}
          <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-zinc-300">Race Distance (Laps)</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 5, 8].map((l) => (
                <button
                  key={l}
                  onClick={() => setLaps(l)}
                  className={`w-9 h-8 rounded-lg text-xs font-bold font-mono transition-all ${
                    laps === l
                      ? 'bg-amber-500 text-black shadow-md'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <div className="pt-4 border-t border-zinc-800 mt-2">
          <button
            onClick={() => {
              soundEngine.playClick();
              onSelectCircuit(circuit, laps);
            }}
            className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase text-sm tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-95 transition-transform"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Grand Prix on {circuit.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
