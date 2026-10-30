import * as THREE from 'three';
import { BikeCustomization, BikeDefinition } from '../types/game';
import { createCarbonTexture, createTireTexture, createBrakeDiscTexture } from './proceduralTextures';

export interface BuiltBike {
  root: THREE.Group;
  leanGroup: THREE.Group;
  steerGroup: THREE.Group;
  frontWheelMesh: THREE.Mesh;
  rearWheelMesh: THREE.Mesh;
  riderGroup: THREE.Group;
  riderTorso: THREE.Group;
  riderHead: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  exhaustPipe: THREE.Mesh;
  updateAnimation: (
    speedMs: number,
    steerAngle: number,
    leanAngle: number,
    pitchAngle: number,
    isCrouched: boolean,
    delta: number
  ) => void;
  updateMaterials: (colors: BikeCustomization) => void;
}


/**
 * Builds a realistic, highly detailed 3D MotoGP prototype motorcycle and rider.
 * Coordinate system:
 * - Forward direction is along -Z (standard camera look direction)
 * - Rear of bike is along +Z
 * - Vertical axis is Y (Y = 0 is ground plane, axles at Y = 0.31)
 * - Lateral axis is X (left = -X, right = +X)
 */
export function buildMotorcycle(
  bikeDef: BikeDefinition,
  customColors?: BikeCustomization
): BuiltBike {
  const colors = customColors || bikeDef.defaultColors;

  const root = new THREE.Group();
  root.name = `bike_${bikeDef.id}`;

  // Dedicated leanGroup allows pure local roll/pitch without conflicting with root world yaw
  const leanGroup = new THREE.Group();
  leanGroup.name = `lean_${bikeDef.id}`;
  root.add(leanGroup);

  // Procedural textures
  const carbonTexture = createCarbonTexture();
  const tireTexture = createTireTexture();
  const brakeDiscTexture = createBrakeDiscTexture();

  // Premium motorsport PBR materials
  const fairingMaterial = new THREE.MeshStandardMaterial({
    color: colors.primaryColor,
    metalness: 0.65,
    roughness: 0.18,
    envMapIntensity: 1.3,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: colors.accentColor,
    metalness: 0.5,
    roughness: 0.25,
  });

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: colors.frameColor || 0x222328,
    metalness: 0.85,
    roughness: 0.35,
  });

  const engineMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f2024,
    metalness: 0.8,
    roughness: 0.45,
  });

  const carbonMaterial = new THREE.MeshStandardMaterial({
    map: carbonTexture,
    metalness: 0.3,
    roughness: 0.35,
  });

  const tireTreadMaterial = new THREE.MeshStandardMaterial({
    color: 0x141518,
    roughness: 0.9,
    metalness: 0.05,
  });

  const wheelRimMaterial = new THREE.MeshStandardMaterial({
    color: colors.wheelColor || 0x18181b,
    metalness: 0.9,
    roughness: 0.15,
  });

  const goldForkMaterial = new THREE.MeshStandardMaterial({
    color: 0xca8a04, // Kashima / Ohlins gold anodized
    metalness: 0.92,
    roughness: 0.15,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    metalness: 0.95,
    roughness: 0.08,
  });

  const brakeDiscMaterial = new THREE.MeshStandardMaterial({
    map: brakeDiscTexture,
    metalness: 0.85,
    roughness: 0.3,
  });

  const brakeCaliperMaterial = new THREE.MeshStandardMaterial({
    color: 0xb91c1c, // Red Brembo style
    metalness: 0.7,
    roughness: 0.25,
  });

  const windscreenMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.6,
    roughness: 0.05,
    metalness: 0.1,
    transmission: 0.75,
    ior: 1.52,
  });

  const seatMaterial = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    roughness: 0.95,
    metalness: 0.05,
  });

  const riderSuitMaterial = new THREE.MeshStandardMaterial({
    color: colors.riderSuitColor || 0x18181b,
    roughness: 0.65,
    metalness: 0.2,
  });

  const helmetMaterial = new THREE.MeshStandardMaterial({
    color: colors.riderHelmetColor || colors.primaryColor,
    roughness: 0.15,
    metalness: 0.6,
  });

  const visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    metalness: 0.98,
    roughness: 0.02,
  });

  const kneePuckMaterial = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.85,
    metalness: 0.1,
  });

  // Dimensions
  const WHEEL_RADIUS = 0.31;
  const FRONT_AXLE_Z = -0.72;
  const REAR_AXLE_Z = 0.70;

  // --- 1. REAR WHEEL & SWINGARM ---
  // Wide 200/55 GP Slick (Cylinder rotated so axis is along X)
  const rearTireGeom = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.20, 24);
  rearTireGeom.rotateZ(Math.PI / 2);
  const rearWheelMesh = new THREE.Mesh(rearTireGeom, tireTreadMaterial);
  rearWheelMesh.position.set(0, WHEEL_RADIUS, REAR_AXLE_Z);
  rearWheelMesh.castShadow = true;
  leanGroup.add(rearWheelMesh);

  // Rear rim hub & spokes
  const rearRimGeom = new THREE.CylinderGeometry(WHEEL_RADIUS - 0.065, WHEEL_RADIUS - 0.065, 0.16, 16);
  rearRimGeom.rotateZ(Math.PI / 2);
  const rearRimMesh = new THREE.Mesh(rearRimGeom, wheelRimMaterial);
  rearWheelMesh.add(rearRimMesh);

  // Rear brake disc & drive sprocket
  const rearDiscGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.015, 16);
  rearDiscGeom.rotateZ(Math.PI / 2);
  const rearDiscMesh = new THREE.Mesh(rearDiscGeom, brakeDiscMaterial);
  rearDiscMesh.position.x = -0.09;
  rearWheelMesh.add(rearDiscMesh);

  // Inverted Carbon Banana Swingarm
  const swingarmGeom = new THREE.BoxGeometry(0.18, 0.09, 0.62);
  const swingarmMesh = new THREE.Mesh(swingarmGeom, carbonMaterial);
  swingarmMesh.position.set(0, WHEEL_RADIUS + 0.04, 0.38);
  swingarmMesh.castShadow = true;
  leanGroup.add(swingarmMesh);

  // --- 2. ENGINE & TWIN-SPAR CHASSIS FRAME ---
  const frameGroup = new THREE.Group();
  leanGroup.add(frameGroup);

  // Twin-spar aluminum perimeter beam (left & right frame rails)
  const sparGeom = new THREE.BoxGeometry(0.06, 0.14, 0.85);
  const sparL = new THREE.Mesh(sparGeom, frameMaterial);
  sparL.position.set(-0.16, 0.58, -0.05);
  sparL.rotation.y = 0.08;
  sparL.castShadow = true;

  const sparR = new THREE.Mesh(sparGeom, frameMaterial);
  sparR.position.set(0.16, 0.58, -0.05);
  sparR.rotation.y = -0.08;
  sparR.castShadow = true;
  frameGroup.add(sparL, sparR);

  // Engine block (1000cc V4)
  const engineGeom = new THREE.BoxGeometry(0.28, 0.32, 0.44);
  const engineMesh = new THREE.Mesh(engineGeom, engineMaterial);
  engineMesh.position.set(0, 0.38, 0.0);
  engineMesh.castShadow = true;
  frameGroup.add(engineMesh);

  // Radiator core with curved cooling cowl
  const radiatorGeom = new THREE.BoxGeometry(0.32, 0.28, 0.08);
  const radiatorMesh = new THREE.Mesh(radiatorGeom, engineMaterial);
  radiatorMesh.position.set(0, 0.44, -0.32);
  radiatorMesh.rotation.x = -0.25;
  frameGroup.add(radiatorMesh);

  // --- 3. AERODYNAMIC BODYWORK & FAIRINGS ---
  // Sculpted fuel tank
  const tankGeom = new THREE.BoxGeometry(0.32, 0.26, 0.48);
  const tankMesh = new THREE.Mesh(tankGeom, fairingMaterial);
  tankMesh.position.set(0, 0.72, -0.08);
  tankMesh.rotation.x = -0.15;
  tankMesh.castShadow = true;
  frameGroup.add(tankMesh);

  // Main aerodynamic nose fairing (points forward along -Z)
  const noseGeom = new THREE.ConeGeometry(0.26, 0.75, 8);
  noseGeom.rotateX(-Math.PI / 2); // Cone tip points towards -Z
  const noseMesh = new THREE.Mesh(noseGeom, fairingMaterial);
  noseMesh.position.set(0, 0.62, -0.56);
  noseMesh.scale.set(0.95, 0.85, 1.0);
  noseMesh.castShadow = true;
  frameGroup.add(noseMesh);

  // Clear aerodynamic windscreen
  const windscreenGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.38, 8, 1, true, 0, Math.PI);
  windscreenGeom.rotateX(-Math.PI / 3);
  const windscreenMesh = new THREE.Mesh(windscreenGeom, windscreenMaterial);
  windscreenMesh.position.set(0, 0.84, -0.62);
  frameGroup.add(windscreenMesh);

  // MotoGP Downforce Front Winglets (Left & Right aero foils)
  const wingGeom = new THREE.BoxGeometry(0.64, 0.025, 0.18);
  const wingMesh = new THREE.Mesh(wingGeom, carbonMaterial);
  wingMesh.position.set(0, 0.58, -0.78);
  wingMesh.rotation.x = 0.06;
  frameGroup.add(wingMesh);

  // Lower belly pan / oil catch fairing
  const bellyGeom = new THREE.BoxGeometry(0.26, 0.18, 0.65);
  const bellyMesh = new THREE.Mesh(bellyGeom, fairingMaterial);
  bellyMesh.position.set(0, 0.24, -0.05);
  bellyMesh.castShadow = true;
  frameGroup.add(bellyMesh);

  // Aerodynamic tail cowl & seat
  const tailGeom = new THREE.ConeGeometry(0.18, 0.68, 6);
  tailGeom.rotateX(Math.PI / 2); // Tail tapers towards +Z
  const tailMesh = new THREE.Mesh(tailGeom, fairingMaterial);
  tailMesh.position.set(0, 0.72, 0.44);
  tailMesh.scale.set(1.0, 0.6, 1.0);
  tailMesh.castShadow = true;
  frameGroup.add(tailMesh);

  // Black foam race seat pad
  const seatGeom = new THREE.BoxGeometry(0.22, 0.04, 0.32);
  const seatMesh = new THREE.Mesh(seatGeom, seatMaterial);
  seatMesh.position.set(0, 0.68, 0.12);
  frameGroup.add(seatMesh);

  // Dual high-exit titanium race exhausts (pointing out back right)
  const exhaustGeom = new THREE.CylinderGeometry(0.04, 0.045, 0.55, 12);
  exhaustGeom.rotateX(Math.PI / 2);
  const exhaustPipe = new THREE.Mesh(exhaustGeom, chromeMaterial);
  exhaustPipe.position.set(0.15, 0.45, 0.48);
  exhaustPipe.rotation.y = 0.12;
  exhaustPipe.castShadow = true;
  frameGroup.add(exhaustPipe);

  // --- 4. FRONT FORK, STEERING & FRONT WHEEL ---
  // Steering column pivots around rake angle (~24 degrees)
  const steerGroup = new THREE.Group();
  steerGroup.position.set(0, 0.62, -0.48);
  steerGroup.rotation.x = -0.42; // Rake angle tilting forward towards -Z
  leanGroup.add(steerGroup);

  // Twin Inverted Gold Fork Legs (Left & Right)
  const forkGeom = new THREE.CylinderGeometry(0.026, 0.026, 0.75, 12);
  const forkL = new THREE.Mesh(forkGeom, goldForkMaterial);
  forkL.position.set(-0.11, -0.15, 0);
  forkL.castShadow = true;

  const forkR = new THREE.Mesh(forkGeom, goldForkMaterial);
  forkR.position.set(0.11, -0.15, 0);
  forkR.castShadow = true;
  steerGroup.add(forkL, forkR);

  // Billet Triple Clamps (Upper & Lower)
  const clampGeom = new THREE.BoxGeometry(0.28, 0.035, 0.08);
  const clampTop = new THREE.Mesh(clampGeom, frameMaterial);
  clampTop.position.set(0, 0.22, 0);
  const clampBottom = new THREE.Mesh(clampGeom, frameMaterial);
  clampBottom.position.set(0, 0.02, 0);
  steerGroup.add(clampTop, clampBottom);

  // Clip-on handlebars & digital dash
  const barGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.54, 8);
  barGeom.rotateZ(Math.PI / 2);
  const barMesh = new THREE.Mesh(barGeom, frameMaterial);
  barMesh.position.set(0, 0.24, -0.04);
  steerGroup.add(barMesh);

  // Digital dash display
  const dashGeom = new THREE.BoxGeometry(0.14, 0.07, 0.025);
  const dashMesh = new THREE.Mesh(dashGeom, visorMaterial);
  dashMesh.position.set(0, 0.26, 0.02);
  dashMesh.rotation.x = 0.5;
  steerGroup.add(dashMesh);

  // Front wheel assembly (mounted on fork bottom)
  const frontWheelAssembly = new THREE.Group();
  frontWheelAssembly.position.set(0, -0.48, 0);
  steerGroup.add(frontWheelAssembly);

  // Front 120/70 GP Slick
  const frontTireGeom = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.12, 24);
  frontTireGeom.rotateZ(Math.PI / 2);
  const frontWheelMesh = new THREE.Mesh(frontTireGeom, tireTreadMaterial);
  frontWheelMesh.castShadow = true;
  frontWheelAssembly.add(frontWheelMesh);

  // Front rim
  const frontRimGeom = new THREE.CylinderGeometry(WHEEL_RADIUS - 0.065, WHEEL_RADIUS - 0.065, 0.10, 16);
  frontRimGeom.rotateZ(Math.PI / 2);
  const frontRimMesh = new THREE.Mesh(frontRimGeom, wheelRimMaterial);
  frontWheelMesh.add(frontRimMesh);

  // Twin 340mm Carbon Brake Rotors
  const fDiscGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 16);
  fDiscGeom.rotateZ(Math.PI / 2);
  const fDiscL = new THREE.Mesh(fDiscGeom, brakeDiscMaterial);
  fDiscL.position.x = -0.075;
  const fDiscR = new THREE.Mesh(fDiscGeom, brakeDiscMaterial);
  fDiscR.position.x = 0.075;
  frontWheelMesh.add(fDiscL, fDiscR);

  // Radial Red Brembo Brake Calipers
  const caliperGeom = new THREE.BoxGeometry(0.04, 0.08, 0.06);
  const caliperL = new THREE.Mesh(caliperGeom, brakeCaliperMaterial);
  caliperL.position.set(-0.075, 0.06, 0.08);
  const caliperR = new THREE.Mesh(caliperGeom, brakeCaliperMaterial);
  caliperR.position.set(0.075, 0.06, 0.08);
  frontWheelAssembly.add(caliperL, caliperR);

  // Front Mudguard / Carbon Fender
  const fenderGeom = new THREE.CylinderGeometry(WHEEL_RADIUS + 0.03, WHEEL_RADIUS + 0.03, 0.14, 12, 1, true, 0, Math.PI * 0.55);
  fenderGeom.rotateZ(Math.PI / 2);
  const fenderMesh = new THREE.Mesh(fenderGeom, carbonMaterial);
  fenderMesh.position.set(0, 0.02, 0.02);
  frontWheelAssembly.add(fenderMesh);

  // --- 5. ARTICULATED 3D RIDER ---
  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 0.68, 0.10); // Seated on motorcycle seat
  leanGroup.add(riderGroup);

  // Rider Pelvis & Torso
  const riderTorso = new THREE.Group();
  riderGroup.add(riderTorso);

  const torsoGeom = new THREE.BoxGeometry(0.32, 0.38, 0.22);
  const torsoMesh = new THREE.Mesh(torsoGeom, riderSuitMaterial);
  torsoMesh.position.set(0, 0.24, -0.12);
  torsoMesh.rotation.x = -0.65; // Aggressive forward racing lean towards -Z
  torsoMesh.castShadow = true;
  riderTorso.add(torsoMesh);

  // Aerodynamic speed hump on rider's back
  const humpGeom = new THREE.ConeGeometry(0.10, 0.32, 6);
  humpGeom.rotateX(Math.PI / 2);
  const humpMesh = new THREE.Mesh(humpGeom, riderSuitMaterial);
  humpMesh.position.set(0, 0.36, -0.06);
  humpMesh.rotation.x = -0.65;
  riderTorso.add(humpMesh);

  // Full-face aerodynamic GP helmet & dark visor
  const riderHead = new THREE.Group();
  riderHead.position.set(0, 0.48, -0.32);
  riderTorso.add(riderHead);

  const helmetGeom = new THREE.SphereGeometry(0.14, 16, 16);
  helmetGeom.scale(0.95, 1.05, 1.15);
  const helmetMesh = new THREE.Mesh(helmetGeom, helmetMaterial);
  helmetMesh.castShadow = true;
  riderHead.add(helmetMesh);

  // Dark smoke aerodynamic visor
  const visorGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 10, 1, false, -Math.PI * 0.4, Math.PI * 0.8);
  visorGeom.rotateX(Math.PI / 2);
  const visorMesh = new THREE.Mesh(visorGeom, visorMaterial);
  visorMesh.position.set(0, 0.01, -0.08);
  riderHead.add(visorMesh);

  // Rider Arms (reaching forward to clip-ons)
  const armGeom = new THREE.CylinderGeometry(0.045, 0.04, 0.36, 8);
  const armL = new THREE.Mesh(armGeom, riderSuitMaterial);
  armL.position.set(-0.20, 0.26, -0.28);
  armL.rotation.set(-0.75, -0.25, 0.4);
  const armR = new THREE.Mesh(armGeom, riderSuitMaterial);
  armR.position.set(0.20, 0.26, -0.28);
  armR.rotation.set(-0.75, 0.25, -0.4);
  riderTorso.add(armL, armR);

  // Rider Legs (tucked in with knees against tank and feet on pegs)
  const legGeom = new THREE.CylinderGeometry(0.06, 0.05, 0.42, 8);
  const puckGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8);
  puckGeom.rotateZ(Math.PI / 2);

  // Left Leg
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.16, 0.02, -0.06);
  const leftThigh = new THREE.Mesh(legGeom, riderSuitMaterial);
  leftThigh.position.set(-0.06, -0.14, -0.05);
  leftThigh.rotation.set(-0.6, -0.2, 0.3);
  const leftKneePuck = new THREE.Mesh(puckGeom, kneePuckMaterial);
  leftKneePuck.position.set(-0.14, -0.18, -0.15);
  leftLeg.add(leftThigh, leftKneePuck);
  riderGroup.add(leftLeg);

  // Right Leg
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.16, 0.02, -0.06);
  const rightThigh = new THREE.Mesh(legGeom, riderSuitMaterial);
  rightThigh.position.set(0.06, -0.14, -0.05);
  rightThigh.rotation.set(-0.6, 0.2, -0.3);
  const rightKneePuck = new THREE.Mesh(puckGeom, kneePuckMaterial);
  rightKneePuck.position.set(0.14, -0.18, -0.15);
  rightLeg.add(rightThigh, rightKneePuck);
  riderGroup.add(rightLeg);

  // --- ANIMATION UPDATE LOOP ---
  const updateAnimation = (
    speedMs: number,
    steerAngle: number,
    leanAngle: number,
    pitchAngle: number,
    isCrouched: boolean,
    delta: number
  ) => {
    // Wheels spin around X axis as bike moves forward along -Z
    // (forward rotation around X is negative)
    const wheelRotStep = (speedMs / WHEEL_RADIUS) * delta;
    rearWheelMesh.rotation.x -= wheelRotStep;
    frontWheelMesh.rotation.x -= wheelRotStep;

    // Handlebars and front fork steer smoothly (negative rotation around Y turns towards +X/right)
    steerGroup.rotation.y = THREE.MathUtils.damp(steerGroup.rotation.y, -steerAngle, 16, delta);

    // Motorcycle lean (roll around motorcycle's own local longitudinal Z-axis)
    // Pure local lean ensures natural roll into turns with zero world yaw conflict
    leanGroup.rotation.z = THREE.MathUtils.damp(leanGroup.rotation.z, -leanAngle, 14, delta);

    // Suspension pitch (brake dive / acceleration squat) along local transverse axis
    leanGroup.rotation.x = THREE.MathUtils.damp(leanGroup.rotation.x, pitchAngle, 10, delta);

    // Rider hang-off into corner (positive leanAngle shifts rider right +X)
    const riderHangOff = leanAngle * 0.16;
    riderGroup.position.x = THREE.MathUtils.damp(riderGroup.position.x, riderHangOff, 10, delta);

    // Articulate knee slider into corner
    const isLeaningLeft = leanAngle < -0.2;
    const isLeaningRight = leanAngle > 0.2;
    leftLeg.rotation.y = THREE.MathUtils.damp(leftLeg.rotation.y, isLeaningLeft ? -0.55 : 0, 8, delta);
    rightLeg.rotation.y = THREE.MathUtils.damp(rightLeg.rotation.y, isLeaningRight ? 0.55 : 0, 8, delta);

    // Aerodynamic tuck-in crouch on straights
    const targetTorsoPitch = isCrouched ? -0.92 : -0.65;
    const targetHeadY = isCrouched ? 0.40 : 0.48;
    const targetHeadZ = isCrouched ? -0.38 : -0.32;

    torsoMesh.rotation.x = THREE.MathUtils.damp(torsoMesh.rotation.x, targetTorsoPitch, 8, delta);
    humpMesh.rotation.x = torsoMesh.rotation.x;
    riderHead.position.y = THREE.MathUtils.damp(riderHead.position.y, targetHeadY, 8, delta);
    riderHead.position.z = THREE.MathUtils.damp(riderHead.position.z, targetHeadZ, 8, delta);
  };

  const updateMaterials = (newColors: BikeCustomization) => {
    fairingMaterial.color.set(newColors.primaryColor);
    accentMaterial.color.set(newColors.accentColor);
    frameMaterial.color.set(newColors.frameColor);
    wheelRimMaterial.color.set(newColors.wheelColor);
    riderSuitMaterial.color.set(newColors.riderSuitColor);
    helmetMaterial.color.set(newColors.riderHelmetColor);
  };

  return {
    root,
    leanGroup,
    steerGroup,
    frontWheelMesh,
    rearWheelMesh,
    riderGroup,
    riderTorso,
    riderHead,
    leftLeg,
    rightLeg,
    exhaustPipe,
    updateAnimation,
    updateMaterials,
  };
}

