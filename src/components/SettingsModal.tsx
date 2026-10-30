import React from 'react';
import { PlayerSettings, ControlType, GraphicsQuality } from '../types/game';
import { X, Volume2, Gamepad2, Monitor, Gauge } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface SettingsModalProps {
  settings: PlayerSettings;
  onUpdateSettings: (newSettings: PlayerSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const update = (partial: Partial<PlayerSettings>) => {
    const updated = { ...settings, ...partial };
    onUpdateSettings(updated);
    if (partial.soundVolume !== undefined || partial.engineVolume !== undefined || partial.fxVolume !== undefined) {
      soundEngine.setVolumes(updated.soundVolume, updated.engineVolume, updated.fxVolume);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 font-racing">
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-teko font-bold uppercase tracking-wide text-white">
              Game Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* Controls section */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">
              <Gamepad2 className="w-4 h-4" />
              <span>Mobile Controls Layout</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(
                [
                  { id: 'touch_buttons', label: 'L / R Buttons' },
                  { id: 'touch_slider', label: 'Analog Slider' },
                  { id: 'touch_tilt', label: 'Gyro / Tilt' },
                ] as { id: ControlType; label: string }[]
              ).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => update({ controls: mode.id })}
                  className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                    settings.controls === mode.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md'
                      : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Sensitivity */}
            <div className="flex items-center justify-between text-xs text-zinc-300 mb-1">
              <span>Steering Sensitivity</span>
              <span className="font-mono text-amber-400">{settings.steerSensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.steerSensitivity}
              onChange={(e) => update({ steerSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />

            {/* Invert Steering Toggle */}
            <div className="flex items-center justify-between text-xs text-zinc-300 mt-3 pt-3 border-t border-zinc-800/80">
              <div className="flex flex-col">
                <span className="font-bold">Invert Steering (R ➔ L, L ➔ R)</span>
                <span className="text-[10px] text-zinc-400">Right button steers left, Left button steers right</span>
              </div>
              <button
                type="button"
                onClick={() => update({ invertSteering: !settings.invertSteering })}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  settings.invertSteering
                    ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {settings.invertSteering ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Graphics Quality */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">
              <Monitor className="w-4 h-4" />
              <span>Graphics Preset & Performance</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => update({ graphicsQuality: q })}
                  className={`py-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                    settings.graphicsQuality === q
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Sliders */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">
              <Volume2 className="w-4 h-4" />
              <span>Audio Synthesis Levels</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-zinc-300 mb-1">
                  <span>Engine Exhaust Pitch & Volume</span>
                  <span className="font-mono">{Math.round(settings.engineVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.engineVolume}
                  onChange={(e) => update({ engineVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-300 mb-1">
                  <span>Sound Effects (Wind, Brakes, Curbs)</span>
                  <span className="font-mono">{Math.round(settings.fxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.fxVolume}
                  onChange={(e) => update({ fxVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Units & Haptics */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">
              <Gauge className="w-4 h-4" />
              <span>Speedometer & Feedback</span>
            </div>

            <div className="flex items-center justify-between bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800 mb-2">
              <span className="text-xs text-zinc-300">Speedometer Unit</span>
              <div className="flex gap-1">
                {(['kmh', 'mph'] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => update({ speedUnit: unit })}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                      settings.speedUnit === unit
                        ? 'bg-amber-500 text-black'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
              <span className="text-xs text-zinc-300">Android Haptic Vibration (Curbs & Slides)</span>
              <button
                onClick={() => update({ hapticFeedback: !settings.hapticFeedback })}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                  settings.hapticFeedback
                    ? 'bg-emerald-500 text-black'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {settings.hapticFeedback ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
