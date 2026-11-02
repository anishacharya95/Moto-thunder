import React, { useState, useEffect, useRef } from 'react';
import {
  GameMode,
  PlayerSaveData,
  CircuitDefinition,
  RiderRaceState,
  PlayerSettings,
  TelemetryData,
} from './types/game';
import { loadSaveData, saveGameData, applyChampionshipRoundResult } from './services/storage';
import { MOTORCYCLES } from './data/bikes';
import { CIRCUITS } from './data/circuits';
import { RacingEngine } from './game/racingEngine';
import { MainMenu } from './components/MainMenu';
import { GarageView } from './components/GarageView';
import { ChampionshipView } from './components/ChampionshipView';
import { CircuitSelectModal } from './components/CircuitSelectModal';
import { PostRaceModal } from './components/PostRaceModal';
import { PauseMenu } from './components/PauseMenu';
import { SettingsModal } from './components/SettingsModal';
import { RacingHUD } from './components/RacingHUD';
import { TouchControls } from './components/TouchControls';

type AppScreen = 'menu' | 'racing' | 'garage' | 'championship';

export default function App() {
  const [saveData, setSaveData] = useState<PlayerSaveData>(() => loadSaveData());
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('menu');

  // Modals
  const [showCircuitSelect, setShowCircuitSelect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [postRaceResults, setPostRaceResults] = useState<RiderRaceState[] | null>(null);
  const [earnedCredits, setEarnedCredits] = useState(0);

  // Active Race Configuration
  const [activeMode, setActiveMode] = useState<GameMode>('quick_race');
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitDefinition>(CIRCUITS[0]);
  const [selectedLaps, setSelectedLaps] = useState(3);

  // Race Telemetry & State
  const [countdown, setCountdown] = useState({
    lightsCount: 0,
    isGreen: false,
    label: '',
  });

  const [telemetry, setTelemetry] = useState<TelemetryData>({
    speedKmh: 0,
    gear: 1,
    rpm: 4200,
    leanDeg: 0,
    position: 1,
    totalRiders: 12,
    lap: 1,
    totalLaps: 3,
    currentLapTimeMs: 0,
    bestLapTimeMs: null,
    gapAheadSec: 0,
    isOffTrack: false,
    isCrouched: false,
  });

  // Racing Engine Ref & Canvas Mount
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  // Persist save data on change.
  // Updates accept either a concrete value or an updater reading the LATEST
  // save, so race callbacks (engine instances captured an older snapshot)
  // can never overwrite each other's writes, e.g. a best lap set on the final
  // lap being clobbered by the race-finish save.
  const handleUpdateSaveData = (
    newData: PlayerSaveData | ((prev: PlayerSaveData) => PlayerSaveData)
  ) => {
    setSaveData((prev) => {
      const next = typeof newData === 'function' ? newData(prev) : newData;
      saveGameData(next);
      return next;
    });
  };

  const handleUpdateSettings = (newSettings: PlayerSettings) => {
    handleUpdateSaveData((prev) => ({ ...prev, settings: newSettings }));
  };

  // Launch a race
  const startRace = (circuit: CircuitDefinition, laps: number, mode: GameMode) => {
    setSelectedCircuit(circuit);
    setSelectedLaps(laps);
    setActiveMode(mode);
    setShowCircuitSelect(false);
    setPostRaceResults(null);
    setCurrentScreen('racing');
  };

  // Mount 3D Racing Engine when entering 'racing' screen
  useEffect(() => {
    if (currentScreen !== 'racing' || !canvasMountRef.current) return;

    const bikeDef = MOTORCYCLES.find((b) => b.id === saveData.selectedBikeId) || MOTORCYCLES[0];
    const upgrades = saveData.bikeUpgrades[bikeDef.id] || {
      engine: 0,
      brakes: 0,
      chassis: 0,
      tires: 0,
      aero: 0,
    };
    const customColors = saveData.bikeCustomizations[bikeDef.id] || bikeDef.defaultColors;

    const engine = new RacingEngine(
      canvasMountRef.current,
      selectedCircuit,
      bikeDef,
      customColors,
      upgrades,
      activeMode,
      selectedLaps,
      saveData.settings,
      {
        onCountdownUpdate: (lightsCount, isGreen, label) => {
          setCountdown({ lightsCount, isGreen, label });
        },
        onRaceStart: () => {
          // race start hook
        },
        onLapCompleted: (lap, lapTimeMs, bestLapMs) => {
          if (bestLapMs) {
            handleUpdateSaveData((prev) => {
              const currentBest = prev.bestLaps[selectedCircuit.id];
              if (!currentBest || bestLapMs < currentBest) {
                return {
                  ...prev,
                  bestLaps: { ...prev.bestLaps, [selectedCircuit.id]: bestLapMs },
                };
              }
              return prev;
            });
          }
        },
        onRaceFinish: (results) => {
          const playerResult = results.find((r) => r.rider.isPlayer) || results[0];
          const pos = playerResult.currentPosition;

          // Prize money calculation
          let prize = 3000; // Finish base
          if (pos === 1) prize += 20000;
          else if (pos === 2) prize += 12000;
          else if (pos === 3) prize += 8000;
          else if (pos <= 5) prize += 5000;
          else if (pos <= 8) prize += 3000;

          // Clean race bonus (player stayed on track for the whole race)
          if (!playerResult.isOffTrack) prize += 2000;

          setEarnedCredits(prize);
          setPostRaceResults(results);

          // Championship round index for this race (captured with the race
          // configuration, not read from save state that has since advanced).
          const roundIdx = CIRCUITS.findIndex((c) => c.id === selectedCircuit.id);

          // Update career stats, credits & championship standings in ONE
          // update composed against the latest save state.
          handleUpdateSaveData((prev) => {
            const updatedWins = pos === 1 ? prev.careerWins + 1 : prev.careerWins;
            let next: PlayerSaveData = {
              ...prev,
              credits: prev.credits + prize,
              careerRaces: prev.careerRaces + 1,
              careerWins: updatedWins,
            };

            if (activeMode === 'championship' && roundIdx >= 0) {
              // Idempotent per-round scoring: re-scoring a restarted round
              // reverts the previous result first, so a round can never be
              // counted twice.
              next = applyChampionshipRoundResult(next, roundIdx, results);
            }

            return next;
          });
        },
        onTelemetryUpdate: (data) => {
          setTelemetry(data);
        },
      }
    );

    engineRef.current = engine;

    const handleResize = () => {
      if (canvasMountRef.current && engineRef.current) {
        engineRef.current.resize(
          canvasMountRef.current.clientWidth,
          canvasMountRef.current.clientHeight
        );
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, [currentScreen, selectedCircuit.id, selectedLaps, activeMode]);

  const handlePause = () => {
    if (engineRef.current) {
      engineRef.current.pause();
    }
    setShowPause(true);
  };

  const handleResume = () => {
    setShowPause(false);
    if (engineRef.current) {
      engineRef.current.resume();
    }
  };

  const handleRestart = () => {
    setShowPause(false);
    setPostRaceResults(null);
    if (engineRef.current) {
      engineRef.current.restart();
    }
  };

  const handleExitToMenu = () => {
    setShowPause(false);
    setPostRaceResults(null);
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setCurrentScreen('menu');
  };

  return (
    <div className="relative w-full h-full bg-black select-none overflow-hidden touch-none font-racing">
      {/* 1. MAIN MENU SCREEN */}
      {currentScreen === 'menu' && (
        <MainMenu
          saveData={saveData}
          onSelectMode={(mode) => {
            setActiveMode(mode);
            setShowCircuitSelect(true);
          }}
          onOpenGarage={() => setCurrentScreen('garage')}
          onOpenChampionship={() => setCurrentScreen('championship')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* 2. GARAGE SCREEN */}
      {currentScreen === 'garage' && (
        <GarageView
          saveData={saveData}
          onUpdateSaveData={handleUpdateSaveData}
          onBack={() => setCurrentScreen('menu')}
        />
      )}

      {/* 3. CHAMPIONSHIP STANDINGS SCREEN */}
      {currentScreen === 'championship' && (
        <ChampionshipView
          saveData={saveData}
          onStartRound={(circuitId) => {
            const circuit = CIRCUITS.find((c) => c.id === circuitId) || CIRCUITS[0];
            startRace(circuit, 3, 'championship');
          }}
          onBack={() => setCurrentScreen('menu')}
        />
      )}

      {/* 4. ACTIVE 3D RACING VIEWPORT & HUD */}
      {currentScreen === 'racing' && (
        <div className="relative w-full h-full">
          {/* Isolated WebGL Canvas Container */}
          <div ref={canvasMountRef} className="w-full h-full" />

          {/* Motorsport Racing HUD */}
          <RacingHUD
            telemetry={telemetry}
            circuit={selectedCircuit}
            countdown={countdown}
            speedUnit={saveData.settings.speedUnit}
            onCameraToggle={() => {
              if (engineRef.current) {
                engineRef.current.toggleCamera();
              }
            }}
            onPause={handlePause}
          />

          {/* Landscape Multitouch Controls */}
          <TouchControls
            controlType={saveData.settings.controls}
            steerSensitivity={saveData.settings.steerSensitivity}
            invertSteering={saveData.settings.invertSteering}
            onToggleInvertSteering={() => {
              handleUpdateSettings({
                ...saveData.settings,
                invertSteering: !saveData.settings.invertSteering,
              });
            }}
            onInputChange={(input) => {
              if (engineRef.current) {
                engineRef.current.setPlayerInput(input);
              }
            }}
            onCameraToggle={() => {
              if (engineRef.current) {
                engineRef.current.toggleCamera();
              }
            }}
            onPause={handlePause}
          />

          {/* Pause Dialog */}
          {showPause && (
            <PauseMenu
              onResume={handleResume}
              onRestart={handleRestart}
              onOpenSettings={() => setShowSettings(true)}
              onQuit={handleExitToMenu}
            />
          )}

          {/* Post-Race Classification Modal */}
          {postRaceResults && (
            <PostRaceModal
              results={postRaceResults}
              circuitName={selectedCircuit.name}
              earnedCredits={earnedCredits}
              onRestart={handleRestart}
              onMenu={handleExitToMenu}
              onNextRace={
                activeMode === 'championship' && saveData.championshipCurrentRound < CIRCUITS.length
                  ? () => {
                      const nextCircuit = CIRCUITS[saveData.championshipCurrentRound];
                      startRace(nextCircuit, 3, 'championship');
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      {/* MODAL: Circuit Selection */}
      {showCircuitSelect && (
        <CircuitSelectModal
          bestLaps={saveData.bestLaps}
          onSelectCircuit={(circuit, laps) => startRace(circuit, laps, activeMode)}
          onClose={() => setShowCircuitSelect(false)}
        />
      )}

      {/* MODAL: Settings Dialog */}
      {showSettings && (
        <SettingsModal
          settings={saveData.settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
