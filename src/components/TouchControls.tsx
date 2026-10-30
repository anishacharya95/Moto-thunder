import React, { useState, useEffect, useRef } from 'react';
import { ControlType } from '../types/game';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Flame } from 'lucide-react';

interface TouchControlsProps {
  controlType?: ControlType;
  steerSensitivity: number;
  invertSteering?: boolean;
  onToggleInvertSteering?: () => void;
  onInputChange: (input: {
    steer?: number;
    throttle?: number;
    frontBrake?: number;
    rearBrake?: number;
    tuckIn?: boolean;
    shiftUp?: boolean;
    shiftDown?: boolean;
  }) => void;
  onCameraToggle: () => void;
  onPause: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  steerSensitivity,
  invertSteering = false,
  onToggleInvertSteering,
  onInputChange,
}) => {
  // Active button pressed states for immediate visual feedback
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [gasPressed, setGasPressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);
  const [tuckPressed, setTuckPressed] = useState(false);

  // Dedicated pointer IDs for multitouch isolation
  const leftPointerId = useRef<number | null>(null);
  const rightPointerId = useRef<number | null>(null);
  const gasPointerId = useRef<number | null>(null);
  const brakePointerId = useRef<number | null>(null);
  const tuckPointerId = useRef<number | null>(null);

  // Steer state tracker to support holding Left and Right cleanly
  const isSteeringLeft = useRef(false);
  const isSteeringRight = useRef(false);

  const updateSteering = () => {
    let rawSteer = 0;
    // Intuitive directional mapping: Left button = -1.0 (turn left), Right button = +1.0 (turn right)
    if (isSteeringLeft.current && !isSteeringRight.current) rawSteer = -1.0;
    else if (isSteeringRight.current && !isSteeringLeft.current) rawSteer = 1.0;

    const steerVal = invertSteering ? -rawSteer : rawSteer;
    onInputChange({ steer: steerVal * steerSensitivity });
  };

  // --- LEFT BUTTON HANDLERS ---
  const handleLeftDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    leftPointerId.current = e.pointerId;
    isSteeringLeft.current = true;
    setLeftPressed(true);
    updateSteering();
  };

  const handleLeftUp = (e: React.PointerEvent) => {
    if (leftPointerId.current === e.pointerId) {
      leftPointerId.current = null;
      isSteeringLeft.current = false;
      setLeftPressed(false);
      updateSteering();
    }
  };

  // --- RIGHT BUTTON HANDLERS ---
  const handleRightDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rightPointerId.current = e.pointerId;
    isSteeringRight.current = true;
    setRightPressed(true);
    updateSteering();
  };

  const handleRightUp = (e: React.PointerEvent) => {
    if (rightPointerId.current === e.pointerId) {
      rightPointerId.current = null;
      isSteeringRight.current = false;
      setRightPressed(false);
      updateSteering();
    }
  };

  // --- GAS / THROTTLE HANDLERS ---
  const handleGasDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    gasPointerId.current = e.pointerId;
    setGasPressed(true);
    onInputChange({ throttle: 1.0 });
  };

  const handleGasUp = (e: React.PointerEvent) => {
    if (gasPointerId.current === e.pointerId) {
      gasPointerId.current = null;
      setGasPressed(false);
      onInputChange({ throttle: 0 });
    }
  };

  // --- BRAKE HANDLERS ---
  const handleBrakeDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    brakePointerId.current = e.pointerId;
    setBrakePressed(true);
    onInputChange({ frontBrake: 1.0, rearBrake: 0.8 });
  };

  const handleBrakeUp = (e: React.PointerEvent) => {
    if (brakePointerId.current === e.pointerId) {
      brakePointerId.current = null;
      setBrakePressed(false);
      onInputChange({ frontBrake: 0, rearBrake: 0 });
    }
  };

  // --- AERO TUCK HANDLERS ---
  const handleTuckDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    tuckPointerId.current = e.pointerId;
    setTuckPressed(true);
    onInputChange({ tuckIn: true });
  };

  const handleTuckUp = (e: React.PointerEvent) => {
    if (tuckPointerId.current === e.pointerId) {
      tuckPointerId.current = null;
      setTuckPressed(false);
      onInputChange({ tuckIn: false });
    }
  };

  // --- KEYBOARD CONTROLS (WASD, Arrows, Space, Shift) ---
  useEffect(() => {
    const keysDown = new Set<string>();

    const updateFromKeys = () => {
      let rawSteer = 0;
      if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) rawSteer -= 1;
      if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) rawSteer += 1;

      // When invertSteering is active: Right key steers Left, Left key steers Right
      const steer = invertSteering ? -rawSteer : rawSteer;

      const throttle = keysDown.has('KeyW') || keysDown.has('ArrowUp') ? 1.0 : 0;
      const brake = keysDown.has('KeyS') || keysDown.has('ArrowDown') || keysDown.has('Space') ? 1.0 : 0;
      const tuck = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');

      setLeftPressed(rawSteer < 0);
      setRightPressed(rawSteer > 0);
      setGasPressed(throttle > 0);
      setBrakePressed(brake > 0);
      setTuckPressed(tuck);

      onInputChange({
        steer: steer * steerSensitivity,
        throttle,
        frontBrake: brake,
        rearBrake: brake * 0.8,
        tuckIn: tuck,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keysDown.add(e.code);
      updateFromKeys();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
      updateFromKeys();
    };

    const handleBlur = () => {
      keysDown.clear();
      isSteeringLeft.current = false;
      isSteeringRight.current = false;
      setLeftPressed(false);
      setRightPressed(false);
      setGasPressed(false);
      setBrakePressed(false);
      setTuckPressed(false);
      onInputChange({ steer: 0, throttle: 0, frontBrake: 0, rearBrake: 0, tuckIn: false });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [steerSensitivity, invertSteering, onInputChange]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 font-racing overflow-hidden">
      {/* ======================================================== */}
      {/* 1. BOTTOM-LEFT: ACTUAL LEFT AND RIGHT STEERING BUTTONS   */}
      {/* ======================================================== */}
      <div className="absolute bottom-4 left-4 pointer-events-auto flex flex-col items-start gap-2">
        {/* Steering Invert Mode Toggle Button */}
        {onToggleInvertSteering && (
          <button
            type="button"
            onClick={onToggleInvertSteering}
            className="px-2.5 py-1 rounded-xl bg-zinc-950/90 border border-cyan-500/60 text-[9px] font-bold text-cyan-300 hover:text-white hover:border-cyan-400 active:scale-95 transition-all shadow-lg flex items-center gap-1.5 backdrop-blur-md"
            title="Toggle between Inverted (Right steers Left) and Normal (Left steers Left)"
          >
            <span className="text-amber-400 font-extrabold text-[11px]">⇄</span>
            <span>{invertSteering ? 'STEER: INVERTED (R ➔ L)' : 'STEER: NORMAL (L / R)'}</span>
          </button>
        )}

        <div className="flex items-center gap-3">
          {/* LEFT STEERING BUTTON */}
          <button
            type="button"
            onPointerDown={handleLeftDown}
            onPointerUp={handleLeftUp}
            onPointerCancel={handleLeftUp}
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center transition-all duration-75 active:scale-95 touch-none shadow-2xl border-2 ${
              leftPressed
                ? 'bg-cyan-500/80 border-cyan-300 text-black shadow-[0_0_20px_rgba(6,182,212,0.8)] scale-95'
                : 'bg-zinc-950/75 border-zinc-700/80 text-white hover:border-cyan-400/60'
            }`}
            aria-label="Steer Left"
          >
            <ChevronLeft className={`w-8 h-8 sm:w-9 sm:h-9 ${leftPressed ? 'text-black' : 'text-cyan-400'}`} />
            <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider leading-none ${leftPressed ? 'text-black' : 'text-zinc-300'}`}>
              LEFT
            </span>
            {invertSteering && (
              <span className={`text-[7px] font-mono font-bold tracking-tight mt-0.5 ${leftPressed ? 'text-black' : 'text-cyan-400/90'}`}>
                TURNS RIGHT
              </span>
            )}
          </button>

          {/* RIGHT STEERING BUTTON */}
          <button
            type="button"
            onPointerDown={handleRightDown}
            onPointerUp={handleRightUp}
            onPointerCancel={handleRightUp}
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center transition-all duration-75 active:scale-95 touch-none shadow-2xl border-2 ${
              rightPressed
                ? 'bg-cyan-500/80 border-cyan-300 text-black shadow-[0_0_20px_rgba(6,182,212,0.8)] scale-95'
                : 'bg-zinc-950/75 border-zinc-700/80 text-white hover:border-cyan-400/60'
            }`}
            aria-label="Steer Right"
          >
            <ChevronRight className={`w-8 h-8 sm:w-9 sm:h-9 ${rightPressed ? 'text-black' : 'text-cyan-400'}`} />
            <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider leading-none ${rightPressed ? 'text-black' : 'text-zinc-300'}`}>
              RIGHT
            </span>
            {invertSteering && (
              <span className={`text-[7px] font-mono font-bold tracking-tight mt-0.5 ${rightPressed ? 'text-black' : 'text-cyan-400/90'}`}>
                TURNS LEFT
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. BOTTOM-RIGHT: BRAKE AND GAS ACTION BUTTONS            */}
      {/* ======================================================== */}
      <div className="absolute bottom-4 right-4 pointer-events-auto flex items-end gap-3">
        {/* Left Sub-column: Aero Tuck & Brake */}
        <div className="flex flex-col gap-2.5">
          {/* Aero Tuck-In Button */}
          <button
            type="button"
            onPointerDown={handleTuckDown}
            onPointerUp={handleTuckUp}
            onPointerCancel={handleTuckUp}
            className={`w-16 h-10 sm:w-18 sm:h-11 rounded-xl flex items-center justify-center gap-1 transition-all duration-75 active:scale-95 touch-none shadow-lg border ${
              tuckPressed
                ? 'bg-sky-500 text-black border-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.8)]'
                : 'bg-zinc-950/75 border-sky-600/60 text-sky-300 hover:border-sky-400'
            }`}
            aria-label="Aero Tuck"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">TUCK</span>
          </button>

          {/* BRAKE BUTTON (Racing Red Accent) */}
          <button
            type="button"
            onPointerDown={handleBrakeDown}
            onPointerUp={handleBrakeUp}
            onPointerCancel={handleBrakeUp}
            className={`w-16 h-18 sm:w-18 sm:h-20 rounded-2xl flex flex-col items-center justify-center transition-all duration-75 active:scale-95 touch-none shadow-2xl border-2 ${
              brakePressed
                ? 'bg-rose-600 border-rose-300 text-white shadow-[0_0_24px_rgba(225,29,72,0.9)] scale-95'
                : 'bg-zinc-950/75 border-rose-600/70 text-rose-300 hover:border-rose-400'
            }`}
            aria-label="Brake"
          >
            <span className="text-[9px] uppercase tracking-widest text-rose-400 font-bold leading-none mb-0.5">
              STOP
            </span>
            <span className="text-base sm:text-lg font-teko font-extrabold tracking-wide leading-none">
              BRAKE
            </span>
          </button>
        </div>

        {/* GAS / THROTTLE BUTTON (Racing Green Accent) */}
        <button
          type="button"
          onPointerDown={handleGasDown}
          onPointerUp={handleGasUp}
          onPointerCancel={handleGasUp}
          className={`w-18 h-28 sm:w-22 sm:h-32 rounded-3xl flex flex-col items-center justify-center transition-all duration-75 active:scale-95 touch-none shadow-2xl border-2 ${
            gasPressed
              ? 'bg-emerald-500 border-emerald-300 text-black shadow-[0_0_28px_rgba(16,185,129,0.9)] scale-95'
              : 'bg-zinc-950/75 border-emerald-500/70 text-emerald-300 hover:border-emerald-400'
          }`}
          aria-label="Throttle"
        >
          <ChevronUp className={`w-8 h-8 ${gasPressed ? 'text-black' : 'text-emerald-400'} mb-1`} />
          <span className="text-xl sm:text-2xl font-teko font-extrabold tracking-wider leading-none">
            GAS
          </span>
          <span className={`text-[8px] sm:text-[9px] uppercase tracking-widest font-bold ${gasPressed ? 'text-black' : 'text-emerald-400/80'}`}>
            FULL DRIVE
          </span>
        </button>
      </div>
    </div>
  );
};
