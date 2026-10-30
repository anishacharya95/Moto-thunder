import React, { useMemo } from 'react';
import { CircuitDefinition, TelemetryData } from '../types/game';
import { Camera, Pause } from 'lucide-react';

interface RacingHUDProps {
  telemetry: TelemetryData;
  circuit: CircuitDefinition;
  countdown: {
    lightsCount: number;
    isGreen: boolean;
    label: string;
  };
  speedUnit: 'kmh' | 'mph';
  onCameraToggle: () => void;
  onPause: () => void;
}

function formatLapTime(ms: number): string {
  if (ms <= 0) return '0:00.000';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export const RacingHUD: React.FC<RacingHUDProps> = ({
  telemetry,
  circuit,
  countdown,
  speedUnit,
  onCameraToggle,
  onPause,
}) => {
  const displaySpeed = speedUnit === 'mph'
    ? Math.round(telemetry.speedKmh * 0.621371)
    : telemetry.speedKmh;

  const rpmPercent = Math.min(100, Math.max(0, ((telemetry.rpm - 4000) / 14500) * 100));
  const isRedline = telemetry.rpm >= 17400;

  // Dynamically compute full circuit bounding box & smooth path so the ENTIRE track is visible
  const mapData = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    circuit.splinePoints.forEach(([x, , z]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    });

    const spanX = Math.max(maxX - minX, 100);
    const spanZ = Math.max(maxZ - minZ, 100);
    const maxSpan = Math.max(spanX, spanZ);
    const pad = maxSpan * 0.16;
    const size = maxSpan + pad * 2;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const vx = cx - size / 2;
    const vz = cz - size / 2;

    const pts = circuit.splinePoints;
    let pathD = '';
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];

      if (i === 0) pathD += `M ${p1[0]} ${p1[2]}`;

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1z = p1[2] + (p2[2] - p0[2]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2z = p2[2] - (p3[2] - p1[2]) / 6;

      pathD += ` C ${cp1x.toFixed(1)} ${cp1z.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2z.toFixed(1)}, ${p2[0]} ${p2[2]}`;
    }
    pathD += ' Z';

    const strokeWidth = Math.max(size * 0.035, 14);
    const playerRadius = Math.max(size * 0.046, 18);

    return {
      viewBox: `${vx.toFixed(1)} ${vz.toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`,
      pathD,
      strokeWidth,
      playerRadius,
      startPt: [pts[0][0], pts[0][2]],
    };
  }, [circuit]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 font-racing p-3 sm:p-5 flex flex-col justify-between overflow-hidden">
      {/* ======================================================== */}
      {/* 1. TOP HUD BAR: RESPONSIVE 3-COLUMN CSS GRID LAYOUT       */}
      {/* ======================================================== */}
      <div className="w-full grid grid-cols-3 items-start gap-2 sm:gap-4 max-w-7xl mx-auto">
        {/* --- TOP-LEFT: POSITION & LAP INFO (Column 1) --- */}
        <div className="justify-self-start flex flex-col gap-1">
          <div className="bg-zinc-950/85 border border-zinc-800/90 rounded-2xl px-3 sm:px-4 py-2 shadow-xl backdrop-blur-md flex flex-col min-w-[100px] sm:min-w-[130px]">
            {/* Position Display */}
            <div className="flex items-baseline justify-between gap-1.5">
              <span className="text-[10px] sm:text-xs text-cyan-400 font-extrabold tracking-wider">
                POS
              </span>
              <div className="flex items-baseline gap-0.5">
                <span className={`text-2xl sm:text-3xl font-teko font-extrabold leading-none ${
                  telemetry.position === 1 ? 'text-amber-400' : 'text-white'
                }`}>
                  P{telemetry.position}
                </span>
                <span className="text-[10px] sm:text-xs text-zinc-500 font-mono font-bold">
                  /{telemetry.totalRiders}
                </span>
              </div>
            </div>

            {/* Lap Counter */}
            <div className="flex items-center justify-between border-t border-zinc-800/80 pt-1 mt-0.5">
              <span className="text-[9px] text-zinc-400 font-bold tracking-wider">
                LAP
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {Math.min(telemetry.lap, telemetry.totalLaps)} / {telemetry.totalLaps}
              </span>
            </div>

            {/* Gap to rider ahead */}
            {telemetry.gapAheadSec > 0 && (
              <div className="text-[9px] font-mono text-rose-400 font-bold text-right pt-0.5">
                +{telemetry.gapAheadSec.toFixed(2)}s
              </div>
            )}
          </div>
        </div>

        {/* --- TOP-CENTER: RACE TIMING & STATUS (Column 2) --- */}
        <div className="justify-self-center flex flex-col items-center">
          <div className="bg-zinc-950/85 border border-zinc-800/90 rounded-2xl px-3 sm:px-5 py-1.5 shadow-xl backdrop-blur-md flex flex-col items-center min-w-[130px] sm:min-w-[160px]">
            {/* Current Lap Time */}
            <div className="flex items-baseline gap-2 w-full justify-between">
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                TIME
              </span>
              <span className="text-sm sm:text-base font-mono font-extrabold text-white tracking-wider">
                {formatLapTime(telemetry.currentLapTimeMs)}
              </span>
            </div>

            {/* Best Lap Time */}
            <div className="flex items-baseline gap-2 border-t border-zinc-800/80 w-full justify-between pt-0.5 mt-0.5">
              <span className="text-[8px] text-amber-400 font-bold uppercase tracking-widest">
                BEST
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {telemetry.bestLapTimeMs ? formatLapTime(telemetry.bestLapTimeMs) : '--:--.---'}
              </span>
            </div>
          </div>

          {/* Start Lights Overlay */}
          {(countdown.lightsCount > 0 || countdown.isGreen) && (
            <div className="mt-2 flex flex-col items-center">
              <div className="flex gap-1.5 sm:gap-2 bg-zinc-950/95 p-2 rounded-2xl border-2 border-zinc-700 shadow-2xl">
                {[0, 1, 2, 3, 4].map((i) => {
                  const active = countdown.isGreen
                    ? 'bg-emerald-500 shadow-[0_0_16px_#10b981]'
                    : i < countdown.lightsCount
                    ? 'bg-rose-600 shadow-[0_0_16px_#ef4444]'
                    : 'bg-zinc-800';
                  return (
                    <div
                      key={i}
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-zinc-600 transition-colors ${active}`}
                    />
                  );
                })}
              </div>
              {countdown.isGreen && (
                <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-1 tracking-widest animate-bounce">
                  GO!
                </div>
              )}
            </div>
          )}

          {/* Track Limits Warning Pill */}
          {telemetry.isOffTrack && (
            <div className="mt-1.5 px-3 py-0.5 rounded-xl bg-rose-600/90 border border-rose-300 text-white font-bold text-[9px] sm:text-[10px] tracking-wider uppercase shadow-xl animate-pulse whitespace-nowrap">
              ⚠️ Track Limits Exceeded
            </div>
          )}
        </div>

        {/* --- TOP-RIGHT: COMPACT MINI-MAP & ACTIONS (Column 3) --- */}
        <div className="justify-self-end flex items-start gap-1.5 sm:gap-2.5">
          {/* Quick Action Buttons (Camera & Pause) */}
          <div className="flex flex-col gap-1.5 pointer-events-auto">
            <button
              onClick={onCameraToggle}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-950/85 border border-zinc-800 active:bg-zinc-700 text-amber-400 flex items-center justify-center shadow-lg active:scale-95 transition-transform backdrop-blur-sm"
              title="Camera View (C)"
              aria-label="Switch Camera"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={onPause}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-950/85 border border-zinc-800 active:bg-zinc-700 text-zinc-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform backdrop-blur-sm"
              title="Pause Game (ESC)"
              aria-label="Pause Game"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {/* Full-Circuit Dynamic GPS Mini-Map */}
          <div className="w-20 h-20 sm:w-26 sm:h-26 rounded-2xl bg-zinc-950/90 border border-zinc-800/90 p-2 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center">
            <svg viewBox={mapData.viewBox} className="w-full h-full fill-none overflow-visible">
              {/* Circuit Track Foundation */}
              <path
                d={mapData.pathD}
                stroke="#1e293b"
                strokeWidth={mapData.strokeWidth * 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* High-visibility Circuit Racing Line */}
              <path
                d={mapData.pathD}
                stroke="#06b6d4"
                strokeWidth={mapData.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Start/Finish Line Indicator */}
              <circle
                cx={mapData.startPt[0]}
                cy={mapData.startPt[1]}
                r={mapData.playerRadius * 0.75}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth={mapData.strokeWidth * 0.35}
              />
              {/* Live Player Position Marker */}
              {telemetry.playerPos && (
                <circle
                  cx={telemetry.playerPos.x}
                  cy={telemetry.playerPos.z}
                  r={mapData.playerRadius}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={mapData.strokeWidth * 0.4}
                />
              )}
            </svg>
            <span className="text-[7px] text-zinc-400 font-mono font-bold uppercase mt-1 tracking-wider leading-none">GPS MAP</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. DEDICATED SPEED & GEAR PANEL (ABOVE BOTTOM CONTROLS)  */}
      {/* ======================================================== */}
      <div className="w-full flex justify-center pb-24 sm:pb-28 pointer-events-none">
        <div className="bg-zinc-950/90 border border-zinc-800/90 rounded-2xl px-4 py-2 shadow-2xl backdrop-blur-md flex flex-col items-center max-w-[210px] sm:max-w-[250px] w-full">
          {/* Dynamic RPM Sweep Bar */}
          <div className="w-full h-1.5 sm:h-2 bg-zinc-900 rounded-full border border-zinc-700/80 p-0.5 overflow-hidden flex shadow-inner mb-1.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                isRedline
                  ? 'bg-rose-500 animate-pulse'
                  : rpmPercent > 75
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
              }`}
              style={{ width: `${rpmPercent}%` }}
            />
          </div>

          {/* Speed, Gear, and Lean Readouts */}
          <div className="w-full flex items-center justify-between">
            {/* Gear Indicator */}
            <div className="flex flex-col items-center min-w-[32px]">
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest leading-none">
                GEAR
              </span>
              <span className="text-2xl sm:text-3xl font-teko font-extrabold text-amber-400 leading-none mt-0.5">
                {telemetry.gear}
              </span>
            </div>

            <div className="w-px h-7 bg-zinc-800" />

            {/* Large Speed Numerals */}
            <div className="flex flex-col items-center px-1">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-teko font-extrabold text-white tracking-tight leading-none">
                  {displaySpeed}
                </span>
                <span className="text-[9px] text-zinc-400 font-bold uppercase">
                  {speedUnit}
                </span>
              </div>
              <span className="text-[8px] text-zinc-500 font-mono tracking-wider">
                {telemetry.rpm.toLocaleString()} RPM
              </span>
            </div>

            <div className="w-px h-7 bg-zinc-800" />

            {/* Dynamic Lean Angle */}
            <div className="flex flex-col items-center min-w-[32px]">
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest leading-none">
                LEAN
              </span>
              <span className={`text-lg sm:text-xl font-teko font-bold leading-none mt-0.5 ${
                Math.abs(telemetry.leanDeg) > 48 ? 'text-cyan-400 font-extrabold' : 'text-zinc-300'
              }`}>
                {Math.abs(telemetry.leanDeg)}°{telemetry.leanDeg > 2 ? 'R' : telemetry.leanDeg < -2 ? 'L' : ''}
              </span>
            </div>
          </div>

          {/* Aerodynamic Tuck-In Indicator */}
          {telemetry.isCrouched && (
            <div className="mt-1 px-2 py-0.2 rounded-full bg-cyan-950/80 border border-cyan-400/50 text-[7px] sm:text-[8px] font-bold uppercase tracking-widest text-cyan-300">
              ⚡ AERO TUCK
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
