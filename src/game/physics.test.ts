import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MotorcyclePhysics, type RiderInput } from './physics';
import type { BikeStats, BikeUpgrades, PlayerSettings } from '../types/game';

const stats: BikeStats = {
  topSpeed: 330,
  acceleration: 92,
  handling: 90,
  braking: 88,
  weight: 157,
  power: 260,
};

const upgrades: BikeUpgrades = {
  engine: 0,
  brakes: 0,
  chassis: 0,
  tires: 0,
  aero: 0,
};

const settings: PlayerSettings = {
  controls: 'touch_slider',
  steerSensitivity: 1,
  invertSteering: false,
  autoBrakeAssist: false,
  racingLineAssist: true,
  tcsLevel: 1,
  antiWheelie: true,
  manualGearbox: false,
  soundVolume: 0.8,
  engineVolume: 0.8,
  fxVolume: 0.8,
  musicVolume: 0.5,
  speedUnit: 'kmh',
  graphicsQuality: 'medium',
  showFps: false,
  hapticFeedback: false,
  aiDifficulty: 'normal',
};

const neutralInput: RiderInput = {
  throttle: 0,
  frontBrake: 0,
  rearBrake: 0,
  steer: 0,
  tuckIn: false,
};

function makePhysics(overrides: Partial<PlayerSettings> = {}): MotorcyclePhysics {
  return new MotorcyclePhysics(
    stats,
    upgrades,
    new THREE.Vector3(),
    0,
    { ...settings, ...overrides },
  );
}

test('throttle accelerates the motorcycle and burns fuel', () => {
  const physics = makePhysics();
  const startingFuel = physics.consumables.fuelKg;

  for (let i = 0; i < 180; i++) {
    physics.update({ ...neutralInput, throttle: 1, tuckIn: true }, 1 / 60);
  }

  assert.ok(physics.state.speedMs > 5, 'bike should accelerate from rest');
  assert.ok(physics.state.speedKmh > 0);
  assert.ok(physics.consumables.fuelKg < startingFuel);
  assert.ok(Number.isFinite(physics.state.position.z));
});

test('braking reduces speed after acceleration', () => {
  const physics = makePhysics();

  for (let i = 0; i < 240; i++) {
    physics.update({ ...neutralInput, throttle: 1, tuckIn: true }, 1 / 60);
  }

  const speedBeforeBraking = physics.state.speedMs;
  for (let i = 0; i < 90; i++) {
    physics.update({ ...neutralInput, frontBrake: 1, rearBrake: 0.5 }, 1 / 60);
  }

  assert.ok(speedBeforeBraking > 5);
  assert.ok(physics.state.speedMs < speedBeforeBraking);
  assert.ok(physics.state.speedMs >= 0);
});

test('manual gearbox shifts once per press edge', () => {
  const physics = makePhysics({ manualGearbox: true });
  const shiftInput = { ...neutralInput, shiftUp: true };

  physics.update(shiftInput, 1 / 60);
  assert.equal(physics.state.gear, 2);

  for (let i = 0; i < 20; i++) physics.update(shiftInput, 1 / 60);
  assert.equal(physics.state.gear, 2, 'holding the button must not repeat shifts');

  physics.update({ ...neutralInput, shiftUp: false }, 1 / 60);
  physics.update(shiftInput, 1 / 60);
  assert.equal(physics.state.gear, 3);
});

test('steering produces a finite lean and changes heading at speed', () => {
  const physics = makePhysics();
  for (let i = 0; i < 180; i++) {
    physics.update({ ...neutralInput, throttle: 1, tuckIn: true }, 1 / 60);
  }

  const initialHeading = physics.state.heading;
  for (let i = 0; i < 90; i++) {
    physics.update({ ...neutralInput, throttle: 0.7, steer: 0.8 }, 1 / 60);
  }

  assert.notEqual(physics.state.heading, initialHeading);
  assert.ok(Number.isFinite(physics.state.roll));
  assert.ok(Math.abs(physics.state.roll) <= 1.11);
});

test('race reset restores speed, gearbox, fuel, tires and brakes', () => {
  const physics = makePhysics();
  for (let i = 0; i < 180; i++) {
    physics.update({ ...neutralInput, throttle: 1 }, 1 / 60);
  }
  physics.consumables.wearFront = 0.4;
  physics.consumables.wearRear = 0.5;
  physics.consumables.brakeTemp = 0.8;

  physics.setPosition(new THREE.Vector3(3, 0, 4), Math.PI / 2);

  assert.equal(physics.state.speedMs, 0);
  assert.equal(physics.state.gear, 1);
  assert.equal(physics.consumables.fuelKg, 16);
  assert.equal(physics.consumables.wearFront, 0);
  assert.equal(physics.consumables.wearRear, 0);
  assert.equal(physics.consumables.brakeTemp, 0);
  assert.equal(physics.state.position.x, 3);
  assert.equal(physics.state.position.z, 4);
});

test('large frame deltas are capped to avoid unstable physics jumps', () => {
  const physics = makePhysics();
  physics.update({ ...neutralInput, throttle: 1 }, 5);

  assert.ok(physics.state.speedMs > 0);
  assert.ok(physics.state.speedMs < 2, 'a five-second frame should be capped to 50 ms');
  assert.ok(Number.isFinite(physics.state.speedKmh));
});

test('invalid frame deltas and sensor values cannot poison physics state', () => {
  const physics = makePhysics();
  physics.update({
    ...neutralInput,
    throttle: Number.NaN,
    frontBrake: Number.POSITIVE_INFINITY,
    rearBrake: Number.NEGATIVE_INFINITY,
    steer: Number.NaN,
  }, Number.NaN);

  assert.equal(physics.state.speedMs, 0);
  assert.equal(physics.state.speedKmh, 0);
  assert.ok(Number.isFinite(physics.state.position.x));
  assert.ok(Number.isFinite(physics.state.position.z));
  assert.ok(Number.isFinite(physics.state.heading));
  assert.ok(Number.isFinite(physics.state.roll));
  assert.ok(Number.isFinite(physics.state.rpm));
});

test('out-of-range controls are clamped before physics integration', () => {
  const physics = makePhysics();
  physics.update({
    ...neutralInput,
    throttle: 4,
    frontBrake: -3,
    rearBrake: 2,
    steer: 8,
  }, 1 / 60);

  assert.ok(physics.state.speedMs >= 0);
  assert.ok(physics.state.speedMs < 1, 'clamped throttle should not exceed normal launch response');
  assert.ok(Math.abs(physics.state.roll) <= 1.11);
  assert.ok(Number.isFinite(physics.state.heading));
});

test('braking while cornering reduces delivered lean instead of preserving requested lean', () => {
  const unbraked = makePhysics();
  const trailBraked = makePhysics();

  for (let i = 0; i < 300; i++) {
    const launch = { ...neutralInput, throttle: 1, tuckIn: true };
    unbraked.update(launch, 1 / 60);
    trailBraked.update(launch, 1 / 60);
  }

  for (let i = 0; i < 36; i++) {
    unbraked.update({ ...neutralInput, throttle: 0.6, steer: 0.85 }, 1 / 60);
    trailBraked.update({
      ...neutralInput,
      throttle: 0.6,
      frontBrake: 0.85,
      steer: 0.85,
    }, 1 / 60);
  }

  assert.ok(Math.abs(unbraked.state.roll) > 0.1, 'unbraked bike should establish a cornering lean');
  assert.ok(
    Math.abs(trailBraked.state.roll) < Math.abs(unbraked.state.roll),
    'braking consumes tire grip, so delivered cornering lean should reduce',
  );
  assert.ok(Number.isFinite(trailBraked.state.roll));
});

test('hard straight-line braking does not falsely report a trail-braking slide', () => {
  const physics = makePhysics();
  for (let i = 0; i < 300; i++) {
    physics.update({ ...neutralInput, throttle: 1, tuckIn: true }, 1 / 60);
  }

  physics.update({ ...neutralInput, frontBrake: 1 }, 1 / 60);
  assert.equal(physics.state.trailBrakingSlide, false);
});
