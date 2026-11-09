import React from 'react';
import { PlayerSaveData, GameMode } from '../types/game';
import { MOTORCYCLES } from '../data/bikes';
import { CIRCUITS } from '../data/circuits';
import {
  Bike, ChartNoAxesColumnIncreasing, ChevronRight, Flag, Gauge, Gem,
  MapPinned, Medal, Settings, Shield, Trophy, Wrench, Zap, Play,
  Volume2, VolumeX, Monitor, Crown, Timer, Award,
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
  const currentBike = MOTORCYCLES.find((bike) => bike.id === saveData.selectedBikeId) || MOTORCYCLES[0];
  const nextCircuit = CIRCUITS[saveData.championshipCurrentRound % CIRCUITS.length] || CIRCUITS[0];
  const bestLapCount = Object.keys(saveData.bestLaps).length;
  const soundOn = saveData.settings.soundVolume > 0;

  const click = (action: () => void) => {
    soundEngine.playClick();
    action();
  };
  const start = (mode: GameMode) => click(() => onSelectMode(mode));

  return (
    <main className="mt-home absolute inset-0 z-20 flex flex-col overflow-y-auto overflow-x-hidden bg-[#050b18] text-white font-racing select-none">
      <div className="mt-sky pointer-events-none absolute inset-0" />
      <div className="mt-track-lines pointer-events-none absolute inset-0" />

      <header className="mt-topbar relative z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/10 px-4 py-2 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="mt-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-gradient-to-br from-red-500 via-slate-900 to-black shadow-lg">
            <Bike className="h-7 w-7 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-extrabold italic sm:text-base">
              RACER <Crown className="h-4 w-4 fill-amber-400 text-amber-300" />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">REP {saveData.reputation.toLocaleString()}</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/20">
                <span className="block h-full w-2/3 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-slate-950/70 px-3 py-2 shadow-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-600 text-slate-950"><Zap className="h-4 w-4 fill-current" /></span>
            <span className="font-teko text-xl font-bold tabular-nums sm:text-2xl">{saveData.credits.toLocaleString()}</span>
          </div>
          <button aria-label="Open settings" onClick={() => click(onOpenSettings)} className="mt-icon-btn"><Settings className="h-5 w-5" /></button>
        </div>
      </header>

      <section className="mt-hero relative z-10 grid flex-1 grid-cols-1 gap-4 px-4 pb-4 pt-5 sm:px-7 lg:grid-cols-[minmax(285px,0.82fr)_minmax(360px,1.35fr)] lg:items-center lg:gap-7 lg:px-10 lg:py-5">
        <div className="relative z-10 order-2 flex flex-col justify-center lg:order-1">
          <div className="mb-3">
            <div className="mt-logo-kicker">THE ULTIMATE MOTORCYCLE RACING EXPERIENCE</div>
            <h1 className="mt-logo text-[clamp(2.8rem,7vw,6.2rem)] font-black uppercase italic leading-[0.78] tracking-[-0.065em]">
              <span className="block text-slate-100">MOTO</span>
              <span className="block text-red-500">THUNDER</span>
              <span className="block text-slate-100">GP<span className="ml-2 align-top text-[0.27em] tracking-[0.18em] text-amber-300">RACE • UPGRADE • WIN</span></span>
            </h1>
          </div>

          <div className="mt-5 grid gap-2.5">
            <button onClick={() => start('career')} className="mt-mode-primary group">
              <span className="mt-mode-icon"><Flag className="h-7 w-7 fill-current" /></span>
              <span className="min-w-0 flex-1 text-left"><strong>CAREER</strong><small>Rise to the Champion</small></span>
              <ChevronRight className="h-7 w-7 transition-transform group-hover:translate-x-1" />
            </button>
            <button onClick={() => click(onOpenChampionship)} className="mt-mode">
              <span className="mt-mode-icon"><Trophy className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1 text-left"><strong>CHAMPIONSHIP</strong><small>Compete for Glory</small></span>
              <ChevronRight className="h-6 w-6" />
            </button>
            <button onClick={() => start('quick_race')} className="mt-mode">
              <span className="mt-mode-icon"><Flag className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1 text-left"><strong>QUICK RACE</strong><small>Jump into the action</small></span>
              <ChevronRight className="h-6 w-6" />
            </button>
            <button onClick={() => click(onOpenGarage)} className="mt-mode">
              <span className="mt-mode-icon"><Wrench className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1 text-left"><strong>GARAGE</strong><small>Customize your bike</small></span>
              <ChevronRight className="h-6 w-6" />
            </button>
            <button onClick={() => start('time_trial')} className="mt-mode">
              <span className="mt-mode-icon"><ChartNoAxesColumnIncreasing className="h-7 w-7" /></span>
              <span className="min-w-0 flex-1 text-left"><strong>STATISTICS & TIME TRIAL</strong><small>{saveData.careerRaces} races • {saveData.careerWins} wins • {bestLapCount} track records</small></span>
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="mt-showcase relative order-1 flex min-h-[235px] flex-col justify-end overflow-hidden rounded-2xl border border-white/15 lg:order-2 lg:min-h-[480px]">
          <div className="mt-showcase-glow pointer-events-none absolute inset-0" />
          <div className="mt-bike-art pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="mt-bike-number">{currentBike.defaultColors.raceNumber}</div>
            <div className="mt-bike-wordmark">THUNDER GP</div>
            <div className="mt-bike-silhouette">
              <Bike className="h-full w-full" strokeWidth={1.15} />
            </div>
            <div className="mt-speed-streak mt-speed-streak-one" />
            <div className="mt-speed-streak mt-speed-streak-two" />
          </div>
          <div className="relative z-10 flex items-end justify-between gap-3 p-4 sm:p-6">
            <div className="max-w-[65%]">
              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">YOUR RACE MACHINE</div>
              <h2 className="font-teko text-3xl font-bold uppercase italic leading-none sm:text-4xl">{currentBike.name}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-slate-300">{currentBike.description}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-200">
                <span><Gauge className="mr-1 inline h-3.5 w-3.5 text-amber-300" />{currentBike.baseStats.topSpeed} km/h</span>
                <span><Zap className="mr-1 inline h-3.5 w-3.5 text-red-400" />{currentBike.baseStats.power} bhp</span>
              </div>
            </div>
            <button onClick={() => click(onOpenGarage)} className="mt-bike-edit"><Wrench className="h-4 w-4" /> BIKE BUILDER</button>
          </div>
          <div className="absolute right-5 top-5 hidden -rotate-6 text-right sm:block">
            <div className="font-teko text-3xl font-bold italic text-white drop-shadow-lg">FEEL THE SPEED</div>
            <div className="ml-auto h-1 w-28 -skew-x-12 bg-red-500" />
          </div>
        </div>
      </section>

      <section className="relative z-10 grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4 sm:px-7 lg:grid-cols-5 lg:px-10">
        <button onClick={() => start('quick_race')} className="mt-feature">
          <div className="mt-feature-art mt-art-track"><MapPinned className="h-10 w-10" /></div>
          <span><MapPinned className="mr-1 inline h-4 w-4 text-amber-300" />TRACK SELECTION</span>
        </button>
        <button onClick={() => click(onOpenGarage)} className="mt-feature">
          <div className="mt-feature-art mt-art-bike"><Bike className="h-10 w-10" /></div>
          <span><Wrench className="mr-1 inline h-4 w-4 text-amber-300" />BIKE BUILDER</span>
        </button>
        <button onClick={() => click(onOpenChampionship)} className="mt-feature">
          <div className="mt-feature-art mt-art-trophy"><Trophy className="h-11 w-11" /></div>
          <span><Medal className="mr-1 inline h-4 w-4 text-amber-300" />TOURNAMENTS</span>
        </button>
        <button onClick={() => click(onOpenChampionship)} className="mt-feature">
          <div className="mt-feature-art mt-art-podium"><Award className="h-11 w-11" /></div>
          <span><Trophy className="mr-1 inline h-4 w-4 text-amber-300" />CHAMPIONSHIP</span>
        </button>
        <button onClick={() => start('practice')} className="mt-feature col-span-2 sm:col-span-1">
          <div className="mt-feature-art mt-art-practice"><Shield className="h-10 w-10" /></div>
          <span><Timer className="mr-1 inline h-4 w-4 text-amber-300" />PRACTICE MODE</span>
        </button>
      </section>

      <section className="relative z-10 flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
        <div className="mt-next-race flex min-w-0 items-center gap-3 rounded-xl border border-white/15 bg-slate-950/80 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-2xl">{nextCircuit.flag}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">NEXT CHALLENGE</div>
            <div className="truncate font-teko text-xl font-bold uppercase">{nextCircuit.name}</div>
            <div className="text-xs text-slate-400">{nextCircuit.country} • {nextCircuit.lengthKm.toFixed(1)} km • {nextCircuit.turns} turns</div>
          </div>
          <button onClick={() => start('quick_race')} className="mt-race-now">RACE NOW <ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-300 sm:justify-end">
          <span className="text-emerald-400"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />READY TO RACE</span>
          <span className="flex items-center gap-1.5">{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} SOUND {soundOn ? 'ON' : 'OFF'}</span>
          <span className="flex items-center gap-1.5"><Monitor className="h-4 w-4" /> {saveData.settings.graphicsQuality.toUpperCase()}</span>
          <button onClick={() => click(onOpenSettings)} className="text-amber-300 hover:text-white">SETTINGS</button>
        </div>
      </section>

      <footer className="relative z-10 mt-auto flex items-center justify-center gap-3 border-t border-white/10 bg-black/55 px-4 py-3 text-center">
        <span className="h-1 w-10 -skew-x-12 bg-red-600 sm:w-16" />
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 sm:text-xs sm:tracking-[0.32em]">THE ULTIMATE MOTORCYCLE RACING EXPERIENCE</span>
        <span className="h-1 w-10 -skew-x-12 bg-red-600 sm:w-16" />
      </footer>
    </main>
  );
};
