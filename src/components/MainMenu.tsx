import React from 'react';
import { PlayerSaveData, GameMode } from '../types/game';
import { MOTORCYCLES } from '../data/bikes';
import {
  Play,
  Trophy,
  Flame,
  Timer,
  Compass,
  Wrench,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../services/audio';

interface MainMenuProps {
  saveData: PlayerSaveData;
  onSelectMode: (mode: GameMode) => void;
  onOpenGarage: () => void;
  onOpenChampionship: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  saveData,
  onSelectMode,
  onOpenGarage,
  onOpenChampionship,
  onOpenSettings,
}) => {
  const currentBike = MOTORCYCLES.find((b) => b.id === saveData.selectedBikeId) || MOTORCYCLES[0];

  const handleModeClick = (mode: GameMode) => {
    soundEngine.playClick();
    onSelectMode(mode);
  };

  return (
    <div className="absolute inset-0 bg-zinc-950 flex flex-col z-20 font-racing overflow-hidden select-none">
      {/* Background motorsport imagery with subtle speed gradient and carbon grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-zinc-950 to-black pointer-events-none" />

      {/* Top Bar */}
      <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between z-10 bg-zinc-950/60 backdrop-blur-sm">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Zap className="w-5 h-5 text-black fill-current" />
          </div>
          <div>
            <div className="text-[10px] text-amber-400 font-bold tracking-widest uppercase">
              GRAND PRIX MOTORCYCLE RACING
            </div>
            <div className="text-xl font-teko font-extrabold uppercase tracking-wider text-white leading-none">
              MOTO THUNDER GP
            </div>
          </div>
        </div>

        {/* User Stats & Wallet */}
        <div className="flex items-center gap-3">
          {/* Active Motorcycle Badge */}
          <div
            onClick={onOpenGarage}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer text-xs"
          >
            <span className="text-zinc-400">Bike:</span>
            <span className="font-bold text-white uppercase">{currentBike.name}</span>
          </div>

          {/* Credits */}
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-600/60 flex items-center gap-2 text-emerald-300">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-base font-teko font-bold tracking-wide">
              ${saveData.credits.toLocaleString()}
            </span>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenSettings();
            }}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-between p-6 md:p-12 z-10 overflow-y-auto">
        {/* Left Side: Game Mode Launch Cards */}
        <div className="w-full max-w-lg space-y-3">
          <div className="text-xs uppercase font-bold text-zinc-400 tracking-widest mb-1">
            Race Modes
          </div>

          {/* QUICK RACE (Primary High-Impact Button) */}
          <button
            onClick={() => handleModeClick('quick_race')}
            className="w-full p-4 rounded-3xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black flex items-center justify-between shadow-2xl shadow-amber-500/25 active:scale-98 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-black/15 flex items-center justify-center">
                <Play className="w-6 h-6 fill-current text-black" />
              </div>
              <div className="text-left">
                <div className="text-xl font-teko font-bold uppercase tracking-wider leading-none">
                  Quick Race
                </div>
                <div className="text-xs text-black/80 font-medium">
                  Jump straight into a 12-rider GP sprint on any circuit
                </div>
              </div>
            </div>
            <span className="text-lg font-bold mr-2 group-hover:translate-x-1 transition-transform">
              ▶
            </span>
          </button>

          {/* CHAMPIONSHIP */}
          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenChampionship();
            }}
            className="w-full p-3.5 rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900 text-white flex items-center justify-between active:scale-98 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-lg font-teko font-bold uppercase tracking-wider leading-none text-white">
                  Moto Thunder Cup
                </div>
                <div className="text-xs text-zinc-400">
                  5-Round official season championship with points standings
                </div>
              </div>
            </div>
            <span className="text-sm text-zinc-500 mr-2 group-hover:text-amber-400 transition-colors">
              Enter ➔
            </span>
          </button>

          {/* CAREER MODE */}
          <button
            onClick={() => handleModeClick('career')}
            className="w-full p-3.5 rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-rose-500/50 hover:bg-zinc-900 text-white flex items-center justify-between active:scale-98 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Flame className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-lg font-teko font-bold uppercase tracking-wider leading-none text-white">
                  Career Mode
                </div>
                <div className="text-xs text-zinc-400">
                  Earn contracts, prize money & unlock elite prototype bikes
                </div>
              </div>
            </div>
            <span className="text-sm text-zinc-500 mr-2 group-hover:text-rose-400 transition-colors">
              Enter ➔
            </span>
          </button>

          {/* Bottom row: Time Trial, Practice & Garage */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={() => handleModeClick('time_trial')}
              className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 text-left active:scale-95 transition-transform"
            >
              <Timer className="w-4 h-4 text-sky-400 mb-1" />
              <div className="text-sm font-teko font-bold uppercase leading-none text-white">
                Time Trial
              </div>
              <div className="text-[10px] text-zinc-500">Solo Lap Records</div>
            </button>

            <button
              onClick={() => handleModeClick('practice')}
              className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 text-left active:scale-95 transition-transform"
            >
              <Compass className="w-4 h-4 text-emerald-400 mb-1" />
              <div className="text-sm font-teko font-bold uppercase leading-none text-white">
                Practice
              </div>
              <div className="text-[10px] text-zinc-500">Free Riding</div>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                onOpenGarage();
              }}
              className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 text-left active:scale-95 transition-transform"
            >
              <Wrench className="w-4 h-4 text-amber-400 mb-1" />
              <div className="text-sm font-teko font-bold uppercase leading-none text-white">
                Garage
              </div>
              <div className="text-[10px] text-zinc-500">10 Bikes & Tuning</div>
            </button>
          </div>
        </div>

        {/* Right Side: Active Bike Showcase Card */}
        <div className="hidden lg:flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800/80 rounded-3xl max-w-sm text-center">
          <div className="text-xs uppercase font-bold text-amber-400 tracking-widest mb-1">
            Active Machine
          </div>
          <h3 className="text-2xl font-teko font-bold uppercase text-white tracking-wide">
            {currentBike.name}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">
            {currentBike.description}
          </p>

          <div className="w-full space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-500">Top Speed</span>
              <span className="font-mono text-white font-bold">{currentBike.baseStats.topSpeed} km/h</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-500">Power Output</span>
              <span className="font-mono text-white font-bold">{currentBike.baseStats.power} bhp</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-500">Dry Weight</span>
              <span className="font-mono text-white font-bold">{currentBike.baseStats.weight} kg</span>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenGarage();
            }}
            className="w-full mt-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-wider active:scale-95"
          >
            Customize in Garage
          </button>
        </div>
      </div>
    </div>
  );
};
