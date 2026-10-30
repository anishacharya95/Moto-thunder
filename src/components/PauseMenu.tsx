import React, { useState } from 'react';
import { Play, RotateCcw, Home, Settings, HelpCircle, AlertTriangle } from 'lucide-react';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onQuit,
}) => {
  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-40 font-racing select-none">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
        {!confirmQuit ? (
          <>
            <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">
              MOTO THUNDER GP
            </div>
            <h2 className="text-3xl font-teko font-extrabold uppercase tracking-wider text-white mb-5">
              Race Paused
            </h2>

            {/* Buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={onResume}
                className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/20 active:scale-95 transition-transform"
              >
                <Play className="w-5 h-5 fill-current" />
                <span className="text-sm tracking-wider uppercase font-racing">Resume Race</span>
              </button>

              <button
                onClick={onRestart}
                className="w-full py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span className="text-xs tracking-wider uppercase font-racing">Restart Race</span>
              </button>

              <button
                onClick={onOpenSettings}
                className="w-full py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Settings className="w-4 h-4 text-zinc-400" />
                <span className="text-xs tracking-wider uppercase font-racing">Settings</span>
              </button>

              <button
                onClick={() => setConfirmQuit(true)}
                className="w-full py-2.5 rounded-2xl bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/50 text-rose-300 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Home className="w-4 h-4" />
                <span className="text-xs tracking-wider uppercase font-racing">Exit to Main Menu</span>
              </button>
            </div>

            {/* Controls Reminder */}
            <div className="mt-5 pt-3 border-t border-zinc-900 w-full flex items-center justify-between text-[10px] text-zinc-500">
              <div className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                <span>Controls:</span>
              </div>
              <span>[LEFT] [RIGHT] [BRAKE] [GAS]</span>
            </div>
          </>
        ) : (
          /* Confirmation dialog before exiting race */
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-600/60 flex items-center justify-center text-rose-400 mb-3 shadow-lg">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-teko font-extrabold uppercase text-white mb-1">
              Abandon Current Race?
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-5">
              Your lap times and race positions for this event will be discarded.
            </p>

            <div className="w-full flex gap-3">
              <button
                onClick={() => setConfirmQuit(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold uppercase active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={onQuit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase active:scale-95 shadow-lg shadow-rose-600/30"
              >
                Exit Race
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
