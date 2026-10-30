import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MOTORCYCLES } from '../data/bikes';
import { BikeDefinition, BikeUpgrades, BikeCustomization, PlayerSaveData } from '../types/game';
import { buildMotorcycle, BuiltBike } from '../game/bikeBuilder';
import {
  Wrench,
  Palette,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  Gauge,
  Disc,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { soundEngine } from '../services/audio';

interface GarageViewProps {
  saveData: PlayerSaveData;
  onUpdateSaveData: (data: PlayerSaveData) => void;
  onBack: () => void;
}

const UPGRADE_COSTS = [3500, 6500, 11000, 18000, 28000];

export const GarageView: React.FC<GarageViewProps> = ({
  saveData,
  onUpdateSaveData,
  onBack,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const idx = MOTORCYCLES.findIndex((b) => b.id === saveData.selectedBikeId);
    return idx >= 0 ? idx : 0;
  });

  const [activeTab, setActiveTab] = useState<'specs' | 'upgrades' | 'paint'>('specs');

  const bikeDef = MOTORCYCLES[selectedIdx];
  const isOwned = saveData.unlockedBikeIds.includes(bikeDef.id);
  const isSelected = saveData.selectedBikeId === bikeDef.id;

  const currentUpgrades: BikeUpgrades = saveData.bikeUpgrades[bikeDef.id] || {
    engine: 0,
    brakes: 0,
    chassis: 0,
    tires: 0,
    aero: 0,
  };

  const currentColors: BikeCustomization = saveData.bikeCustomizations[bikeDef.id] || {
    ...bikeDef.defaultColors,
  };

  // 3D Scene Refs
  const bikeInstanceRef = useRef<BuiltBike | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // Initialize 3D Showcase
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(2.8, 1.4, 2.8);
    camera.lookAt(0, 0.5, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Key light
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.5);
    keyLight.position.set(4, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    // Circular garage platform
    const platformGeom = new THREE.CylinderGeometry(2.4, 2.6, 0.12, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.2,
      metalness: 0.8,
    });
    const platform = new THREE.Mesh(platformGeom, platformMat);
    platform.position.y = -0.06;
    platform.receiveShadow = true;
    scene.add(platform);

    // Build initial bike
    const builtBike = buildMotorcycle(bikeDef, currentColors);
    bikeInstanceRef.current = builtBike;
    scene.add(builtBike.root);

    // Animation loop: subtle turntable rotation & rider idle breathing
    let frameId = 0;
    let angle = 0;
    const animate = () => {
      angle += 0.005;
      if (bikeInstanceRef.current?.root) {
        bikeInstanceRef.current.root.rotation.y = angle;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update 3D model when selected bike or colors change
  useEffect(() => {
    if (!sceneRef.current || !bikeDef) return;
    if (bikeInstanceRef.current) {
      sceneRef.current.remove(bikeInstanceRef.current.root);
    }
    const newBike = buildMotorcycle(bikeDef, currentColors);
    bikeInstanceRef.current = newBike;
    sceneRef.current.add(newBike.root);
  }, [selectedIdx, currentColors.primaryColor, currentColors.accentColor, currentColors.wheelColor]);

  const handleSelectBike = () => {
    if (!isOwned) return;
    soundEngine.playClick();
    onUpdateSaveData({
      ...saveData,
      selectedBikeId: bikeDef.id,
    });
  };

  const handleBuyBike = () => {
    if (isOwned || saveData.credits < bikeDef.price) return;
    soundEngine.playClick();
    onUpdateSaveData({
      ...saveData,
      credits: saveData.credits - bikeDef.price,
      unlockedBikeIds: [...saveData.unlockedBikeIds, bikeDef.id],
      selectedBikeId: bikeDef.id,
    });
  };

  const handleUpgrade = (type: keyof BikeUpgrades) => {
    const currentLvl = currentUpgrades[type];
    if (currentLvl >= 5) return;
    const cost = UPGRADE_COSTS[currentLvl];
    if (saveData.credits < cost) return;

    soundEngine.playClick();
    const newUpgrades = {
      ...currentUpgrades,
      [type]: currentLvl + 1,
    };

    onUpdateSaveData({
      ...saveData,
      credits: saveData.credits - cost,
      bikeUpgrades: {
        ...saveData.bikeUpgrades,
        [bikeDef.id]: newUpgrades,
      },
    });
  };

  const handleColorChange = (key: keyof BikeCustomization, val: string | number) => {
    const newColors = {
      ...currentColors,
      [key]: val,
    };
    onUpdateSaveData({
      ...saveData,
      bikeCustomizations: {
        ...saveData.bikeCustomizations,
        [bikeDef.id]: newColors,
      },
    });
  };

  return (
    <div className="absolute inset-0 bg-zinc-950 flex flex-col z-30 font-racing overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/80 z-20">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex items-center gap-2 text-xs font-bold uppercase active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="text-center">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">
            OFFICIAL PADDOCK WORKSHOP
          </div>
          <h1 className="text-xl font-teko font-bold uppercase tracking-wider text-white">
            Garage & Tuning
          </h1>
        </div>

        {/* Player Credits */}
        <div className="px-4 py-1.5 rounded-2xl bg-emerald-950/50 border border-emerald-600/50 flex items-center gap-2 text-emerald-300">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-lg font-teko font-bold tracking-wide">
            ${saveData.credits.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* 3D Showcase Viewport */}
        <div className="flex-1 relative h-64 md:h-full">
          <div ref={mountRef} className="w-full h-full" />

          {/* Motorcycle Carousel Selector Arrows */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-950/80 px-4 py-2 rounded-2xl border border-zinc-800/80 backdrop-blur-sm z-20">
            <button
              onClick={() => {
                setSelectedIdx((prev) => (prev > 0 ? prev - 1 : MOTORCYCLES.length - 1));
                soundEngine.playClick();
              }}
              className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center hover:bg-zinc-800 text-zinc-300 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-[200px]">
              <div className="text-[10px] text-zinc-400 uppercase tracking-widest">
                {bikeDef.manufacturer} ({selectedIdx + 1}/{MOTORCYCLES.length})
              </div>
              <div className="text-base font-bold text-white uppercase truncate">
                {bikeDef.name}
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedIdx((prev) => (prev < MOTORCYCLES.length - 1 ? prev + 1 : 0));
                soundEngine.playClick();
              }}
              className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center hover:bg-zinc-800 text-zinc-300 active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Info / Upgrades / Paint Panel */}
        <div className="w-full md:w-96 bg-zinc-900/60 border-t md:border-t-0 md:border-l border-zinc-800/80 flex flex-col z-20 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 bg-zinc-950/50">
            {[
              { id: 'specs', label: 'Specs', icon: Gauge },
              { id: 'upgrades', label: 'Upgrades', icon: Wrench },
              { id: 'paint', label: 'Livery', icon: Palette },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase transition-all ${
                    activeTab === tab.id
                      ? 'border-b-2 border-amber-500 text-amber-400 bg-zinc-900/80'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'specs' && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {bikeDef.description}
                </p>

                {/* Stat bars */}
                <div className="space-y-2.5">
                  {[
                    { label: 'Top Speed', val: `${bikeDef.baseStats.topSpeed} km/h`, pct: (bikeDef.baseStats.topSpeed / 355) * 100 },
                    { label: 'Acceleration', val: `${bikeDef.baseStats.acceleration}/100`, pct: bikeDef.baseStats.acceleration },
                    { label: 'Cornering Agility', val: `${bikeDef.baseStats.handling}/100`, pct: bikeDef.baseStats.handling },
                    { label: 'Braking Power', val: `${bikeDef.baseStats.braking}/100`, pct: bikeDef.baseStats.braking },
                    { label: 'Horsepower', val: `${bikeDef.baseStats.power} bhp`, pct: (bikeDef.baseStats.power / 290) * 100 },
                    { label: 'Dry Weight', val: `${bikeDef.baseStats.weight} kg`, pct: 100 - (bikeDef.baseStats.weight / 170) * 100 },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs text-zinc-300 mb-1">
                        <span>{s.label}</span>
                        <span className="font-mono text-amber-400">{s.val}</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'upgrades' && (
              <div className="space-y-3">
                {[
                  { id: 'engine', label: 'Engine Tuning', desc: 'Increases top speed & power curve', icon: Zap },
                  { id: 'brakes', label: 'Racing Brakes', desc: 'Shorter stopping distances', icon: Disc },
                  { id: 'chassis', label: 'Chassis & Forks', desc: 'Faster lean rates & agility', icon: Wrench },
                  { id: 'tires', label: 'Sticky Slick Tires', desc: 'Higher cornering grip limit', icon: Gauge },
                  { id: 'aero', label: 'Aero Winglets', desc: 'Stability & downforce at speed', icon: ShieldCheck },
                ].map((up) => {
                  const key = up.id as keyof BikeUpgrades;
                  const lvl = currentUpgrades[key];
                  const isMax = lvl >= 5;
                  const cost = !isMax ? UPGRADE_COSTS[lvl] : 0;
                  const canAfford = saveData.credits >= cost;

                  return (
                    <div
                      key={up.id}
                      className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center justify-between"
                    >
                      <div className="flex-1 mr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white uppercase">{up.label}</span>
                          <span className="text-[10px] text-amber-400 font-mono">Stage {lvl}/5</span>
                        </div>
                        <div className="text-[10px] text-zinc-400">{up.desc}</div>
                      </div>

                      <button
                        disabled={isMax || !canAfford || !isOwned}
                        onClick={() => handleUpgrade(key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${
                          isMax
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : canAfford && isOwned
                            ? 'bg-amber-500 hover:bg-amber-400 text-black active:scale-95'
                            : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {isMax ? 'MAX' : `$${cost.toLocaleString()}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'paint' && (
              <div className="space-y-4">
                {/* Primary Fairing Color Swatches */}
                <div>
                  <div className="text-xs font-bold text-zinc-300 uppercase mb-2">
                    Primary Fairing Color
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {['#e11d48', '#059669', '#0284c7', '#ea580c', '#eab308', '#7c3aed', '#06b6d4', '#f8fafc', '#18181b', '#047857', '#dc2626', '#d97706'].map(
                      (hex) => (
                        <button
                          key={hex}
                          onClick={() => handleColorChange('primaryColor', hex)}
                          className="w-10 h-10 rounded-xl border-2 border-zinc-700 active:scale-90 transition-transform"
                          style={{ backgroundColor: hex }}
                        />
                      )
                    )}
                  </div>
                </div>

                {/* Accent Color */}
                <div>
                  <div className="text-xs font-bold text-zinc-300 uppercase mb-2">
                    Rims & Wheel Color
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {['#18181b', '#f8fafc', '#f59e0b', '#dc2626', '#2563eb', '#10b981'].map((hex) => (
                      <button
                        key={hex}
                        onClick={() => handleColorChange('wheelColor', hex)}
                        className="w-10 h-10 rounded-xl border-2 border-zinc-700 active:scale-90 transition-transform"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>

                {/* Race Number */}
                <div>
                  <div className="text-xs font-bold text-zinc-300 uppercase mb-2">
                    Rider Race Number
                  </div>
                  <div className="flex gap-2">
                    {[1, 7, 20, 33, 44, 46, 63, 89, 93].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleColorChange('raceNumber', num)}
                        className={`w-9 h-9 rounded-xl border text-xs font-bold font-mono ${
                          currentColors.raceNumber === num
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        #{num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar (Select vs Buy) */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/80">
            {isOwned ? (
              <button
                onClick={handleSelectBike}
                disabled={isSelected}
                className={`w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  isSelected
                    ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400 cursor-default'
                    : 'bg-amber-500 hover:bg-amber-400 text-black active:scale-95 shadow-lg shadow-amber-500/20'
                }`}
              >
                {isSelected ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Active Selected Bike</span>
                  </>
                ) : (
                  <span>Select for Racing</span>
                )}
              </button>
            ) : (
              <button
                onClick={handleBuyBike}
                disabled={saveData.credits < bikeDef.price}
                className={`w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  saveData.credits >= bikeDef.price
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 shadow-lg shadow-emerald-500/20'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <span>Purchase Machine (${bikeDef.price.toLocaleString()})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
