import * as THREE from 'three';
import { CircuitDefinition } from '../types/game';
import {
  createAsphaltTexture,
  createCurbTexture,
  createStartFinishTexture,
  createSponsorBoardTexture,
  createGrassTexture,
  createGravelTexture,
} from './proceduralTextures';

function createSkyTexture(skyHex: string, horizonHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Smooth atmospheric gradient from zenith to horizon
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, skyHex);
  grad.addColorStop(0.7, skyHex);
  grad.addColorStop(1.0, horizonHex);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface TrackCenterlineSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
}

export interface BuiltTrack {
  group: THREE.Group;
  spline: THREE.CatmullRomCurve3;
  trackLength: number;
  centerlineSamples: TrackCenterlineSample[];
  checkpoints: { position: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; progress: number }[];
  gridSlots: { position: THREE.Vector3; rotationY: number; progress: number }[];
  startLights: THREE.Mesh[];
  setStartLightsCount: (redCount: number, isGreen: boolean) => void;
  getTrackWidth: () => number;
  getClosestTrackInfo: (pos: THREE.Vector3) => {
    distance: number;
    progress: number;
    roadY: number;
    tangent: THREE.Vector3;
    normal: THREE.Vector3;
  };
  dispose: () => void;
}


export function buildTrack(circuit: CircuitDefinition): BuiltTrack {
  const group = new THREE.Group();
  group.name = `track_${circuit.id}`;

  // 1. Construct 3D Closed CatmullRom Curve
  const points = circuit.splinePoints.map((pt) => new THREE.Vector3(pt[0], pt[1], pt[2]));
  const spline = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  const trackLength = spline.getLength();

  const TRACK_WIDTH = 13.5; // 13.5 meters wide professional Grand Prix track
  const HALF_WIDTH = TRACK_WIDTH * 0.5;
  const CURB_WIDTH = 1.8;
  const RUNOFF_WIDTH = 8.0;

  const SAMPLES = Math.min(Math.max(Math.floor(trackLength / 3.5), 350), 650);

  // 360-degree outdoor atmospheric sky dome (guarantees level horizon, zero diagonal splits)
  const skyGeom = new THREE.SphereGeometry(1400, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const skyTex = createSkyTexture(circuit.skyColors.sky, circuit.skyColors.horizon);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(skyGeom, skyMat);
  skyMesh.position.y = -10; // Horizon meets ground level
  group.add(skyMesh);

  // Textures
  const asphaltTexture = createAsphaltTexture();
  asphaltTexture.repeat.set(1, 1);

  const curbTexture = createCurbTexture();
  curbTexture.repeat.set(1, 1);

  const gravelTexture = createGravelTexture();

  const startFinishTexture = createStartFinishTexture();

  // PBR Materials with DoubleSide to ensure zero backface culling issues
  const roadMaterial = new THREE.MeshStandardMaterial({
    map: asphaltTexture,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const curbMaterial = new THREE.MeshStandardMaterial({
    map: curbTexture,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const gravelMaterial = new THREE.MeshStandardMaterial({
    map: gravelTexture,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const barrierMaterial = new THREE.MeshStandardMaterial({
    color: 0x2563eb, // High-visibility GP blue
    roughness: 0.35,
    metalness: 0.5,
    side: THREE.DoubleSide,
  });

  const barrierWhiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.4,
  });

  const gantryMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.85,
    roughness: 0.25,
  });

  // --- 2. GENERATE CONTINUOUS ROAD, CURBS, RUNOFF & BARRIERS ---
  const roadPositions: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const leftCurbPositions: number[] = [];
  const leftCurbUvs: number[] = [];
  const leftCurbIndices: number[] = [];

  const rightCurbPositions: number[] = [];
  const rightCurbUvs: number[] = [];
  const rightCurbIndices: number[] = [];

  const leftRunoffPositions: number[] = [];
  const leftRunoffIndices: number[] = [];

  const rightRunoffPositions: number[] = [];
  const rightRunoffIndices: number[] = [];

  const leftBarrierPositions: number[] = [];
  const leftBarrierIndices: number[] = [];

  const rightBarrierPositions: number[] = [];
  const rightBarrierIndices: number[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i % SAMPLES) / SAMPLES;
    const pt = spline.getPointAt(t);
    const tangent = spline.getTangentAt(t).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // Road vertices (Elevated at Y = pt.y + 0.12 so it clearly sits proud of the ground)
    const pLeftRoad = pt.clone().addScaledVector(normal, -HALF_WIDTH);
    pLeftRoad.y += 0.12;

    const pRightRoad = pt.clone().addScaledVector(normal, HALF_WIDTH);
    pRightRoad.y += 0.12;

    roadPositions.push(pLeftRoad.x, pLeftRoad.y, pLeftRoad.z);
    roadPositions.push(pRightRoad.x, pRightRoad.y, pRightRoad.z);
    roadNormals.push(0, 1, 0, 0, 1, 0);

    const uvV = (i / SAMPLES) * (trackLength / 12.0);
    roadUvs.push(0, uvV);
    roadUvs.push(1, uvV);

    // Left Curb vertices (Raised at Y = pt.y + 0.16)
    const pLeftCurbOuter = pt.clone().addScaledVector(normal, -HALF_WIDTH - CURB_WIDTH);
    pLeftCurbOuter.y += 0.16;
    leftCurbPositions.push(pLeftCurbOuter.x, pLeftCurbOuter.y, pLeftCurbOuter.z);
    leftCurbPositions.push(pLeftRoad.x, pLeftRoad.y + 0.02, pLeftRoad.z);
    leftCurbUvs.push(0, uvV * 2);
    leftCurbUvs.push(1, uvV * 2);

    // Right Curb vertices
    const pRightCurbOuter = pt.clone().addScaledVector(normal, HALF_WIDTH + CURB_WIDTH);
    pRightCurbOuter.y += 0.16;
    rightCurbPositions.push(pRightRoad.x, pRightRoad.y + 0.02, pRightRoad.z);
    rightCurbPositions.push(pRightCurbOuter.x, pRightCurbOuter.y, pRightCurbOuter.z);
    rightCurbUvs.push(0, uvV * 2);
    rightCurbUvs.push(1, uvV * 2);

    // Runoff Gravel Outer Boundaries (Y = pt.y + 0.05)
    const pLeftRunoffOuter = pt.clone().addScaledVector(normal, -HALF_WIDTH - CURB_WIDTH - RUNOFF_WIDTH);
    pLeftRunoffOuter.y += 0.05;
    leftRunoffPositions.push(pLeftRunoffOuter.x, pLeftRunoffOuter.y, pLeftRunoffOuter.z);
    leftRunoffPositions.push(pLeftCurbOuter.x, pLeftCurbOuter.y - 0.02, pLeftCurbOuter.z);

    const pRightRunoffOuter = pt.clone().addScaledVector(normal, HALF_WIDTH + CURB_WIDTH + RUNOFF_WIDTH);
    pRightRunoffOuter.y += 0.05;
    rightRunoffPositions.push(pRightCurbOuter.x, pRightCurbOuter.y - 0.02, pRightCurbOuter.z);
    rightRunoffPositions.push(pRightRunoffOuter.x, pRightRunoffOuter.y, pRightRunoffOuter.z);

    // 3D Physical Barriers (1.4m tall wall along outer runoff edge)
    const pLeftBarrierTop = pLeftRunoffOuter.clone().add(new THREE.Vector3(0, 1.4, 0));
    leftBarrierPositions.push(pLeftRunoffOuter.x, pLeftRunoffOuter.y, pLeftRunoffOuter.z);
    leftBarrierPositions.push(pLeftBarrierTop.x, pLeftBarrierTop.y, pLeftBarrierTop.z);

    const pRightBarrierTop = pRightRunoffOuter.clone().add(new THREE.Vector3(0, 1.4, 0));
    rightBarrierPositions.push(pRightRunoffOuter.x, pRightRunoffOuter.y, pRightRunoffOuter.z);
    rightBarrierPositions.push(pRightBarrierTop.x, pRightBarrierTop.y, pRightBarrierTop.z);

    if (i < SAMPLES) {
      const idx = i * 2;
      // Winding: (idx, idx+1, idx+2) and (idx+1, idx+3, idx+2)
      roadIndices.push(idx, idx + 1, idx + 2);
      roadIndices.push(idx + 1, idx + 3, idx + 2);

      leftCurbIndices.push(idx, idx + 1, idx + 2);
      leftCurbIndices.push(idx + 1, idx + 3, idx + 2);

      rightCurbIndices.push(idx, idx + 1, idx + 2);
      rightCurbIndices.push(idx + 1, idx + 3, idx + 2);

      leftRunoffIndices.push(idx, idx + 1, idx + 2);
      leftRunoffIndices.push(idx + 1, idx + 3, idx + 2);

      rightRunoffIndices.push(idx, idx + 1, idx + 2);
      rightRunoffIndices.push(idx + 1, idx + 3, idx + 2);

      leftBarrierIndices.push(idx, idx + 1, idx + 2);
      leftBarrierIndices.push(idx + 1, idx + 3, idx + 2);

      rightBarrierIndices.push(idx, idx + 1, idx + 2);
      rightBarrierIndices.push(idx + 1, idx + 3, idx + 2);
    }
  }

  // Create Road Mesh
  const roadGeom = new THREE.BufferGeometry();
  roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeom.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeom.setIndex(roadIndices);
  roadGeom.computeVertexNormals();
  const roadMesh = new THREE.Mesh(roadGeom, roadMaterial);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Create Left & Right Curbs
  const leftCurbGeom = new THREE.BufferGeometry();
  leftCurbGeom.setAttribute('position', new THREE.Float32BufferAttribute(leftCurbPositions, 3));
  leftCurbGeom.setAttribute('uv', new THREE.Float32BufferAttribute(leftCurbUvs, 2));
  leftCurbGeom.setIndex(leftCurbIndices);
  leftCurbGeom.computeVertexNormals();
  const leftCurbMesh = new THREE.Mesh(leftCurbGeom, curbMaterial);
  leftCurbMesh.receiveShadow = true;
  group.add(leftCurbMesh);

  const rightCurbGeom = new THREE.BufferGeometry();
  rightCurbGeom.setAttribute('position', new THREE.Float32BufferAttribute(rightCurbPositions, 3));
  rightCurbGeom.setAttribute('uv', new THREE.Float32BufferAttribute(rightCurbUvs, 2));
  rightCurbGeom.setIndex(rightCurbIndices);
  rightCurbGeom.computeVertexNormals();
  const rightCurbMesh = new THREE.Mesh(rightCurbGeom, curbMaterial);
  rightCurbMesh.receiveShadow = true;
  group.add(rightCurbMesh);

  // Create Gravel Runoffs
  const leftRunoffGeom = new THREE.BufferGeometry();
  leftRunoffGeom.setAttribute('position', new THREE.Float32BufferAttribute(leftRunoffPositions, 3));
  leftRunoffGeom.setIndex(leftRunoffIndices);
  leftRunoffGeom.computeVertexNormals();
  const leftRunoffMesh = new THREE.Mesh(leftRunoffGeom, gravelMaterial);
  leftRunoffMesh.receiveShadow = true;
  group.add(leftRunoffMesh);

  const rightRunoffGeom = new THREE.BufferGeometry();
  rightRunoffGeom.setAttribute('position', new THREE.Float32BufferAttribute(rightRunoffPositions, 3));
  rightRunoffGeom.setIndex(rightRunoffIndices);
  rightRunoffGeom.computeVertexNormals();
  const rightRunoffMesh = new THREE.Mesh(rightRunoffGeom, gravelMaterial);
  rightRunoffMesh.receiveShadow = true;
  group.add(rightRunoffMesh);

  // Create Safety Barriers
  const leftBarrierGeom = new THREE.BufferGeometry();
  leftBarrierGeom.setAttribute('position', new THREE.Float32BufferAttribute(leftBarrierPositions, 3));
  leftBarrierGeom.setIndex(leftBarrierIndices);
  leftBarrierGeom.computeVertexNormals();
  const leftBarrierMesh = new THREE.Mesh(leftBarrierGeom, barrierMaterial);
  leftBarrierMesh.castShadow = true;
  leftBarrierMesh.receiveShadow = true;
  group.add(leftBarrierMesh);

  const rightBarrierGeom = new THREE.BufferGeometry();
  rightBarrierGeom.setAttribute('position', new THREE.Float32BufferAttribute(rightBarrierPositions, 3));
  rightBarrierGeom.setIndex(rightBarrierIndices);
  rightBarrierGeom.computeVertexNormals();
  const rightBarrierMesh = new THREE.Mesh(rightBarrierGeom, barrierMaterial);
  rightBarrierMesh.castShadow = true;
  rightBarrierMesh.receiveShadow = true;
  group.add(rightBarrierMesh);

  // --- 3. START / FINISH LINE & GANTRY WITH WORKING LIGHTS ---
  const startPt = spline.getPointAt(0);
  const startTangent = spline.getTangentAt(0).normalize();
  const startNormal = new THREE.Vector3().crossVectors(startTangent, new THREE.Vector3(0, 1, 0)).normalize();

  // Checkered start/finish strip across the road
  const sfGeom = new THREE.PlaneGeometry(TRACK_WIDTH, 5.0);
  const sfMaterial = new THREE.MeshStandardMaterial({
    map: startFinishTexture,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const sfMesh = new THREE.Mesh(sfGeom, sfMaterial);
  sfMesh.position.copy(startPt).add(new THREE.Vector3(0, 0.14, 0));
  sfMesh.rotation.x = -Math.PI / 2;
  sfMesh.rotation.z = Math.atan2(startTangent.x, startTangent.z);
  group.add(sfMesh);

  // Overhead Starting Gantry
  const gantryPillarGeom = new THREE.CylinderGeometry(0.4, 0.4, 9.0, 12);
  const pillarL = new THREE.Mesh(gantryPillarGeom, gantryMaterial);
  pillarL.position.copy(startPt).addScaledVector(startNormal, -HALF_WIDTH - 2.5);
  pillarL.position.y += 4.5;
  pillarL.castShadow = true;

  const pillarR = new THREE.Mesh(gantryPillarGeom, gantryMaterial);
  pillarR.position.copy(startPt).addScaledVector(startNormal, HALF_WIDTH + 2.5);
  pillarR.position.y += 4.5;
  pillarR.castShadow = true;

  const beamGeom = new THREE.BoxGeometry(TRACK_WIDTH + 6.0, 1.4, 1.6);
  const beam = new THREE.Mesh(beamGeom, gantryMaterial);
  beam.position.copy(startPt);
  beam.position.y += 8.2;
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), startNormal);
  beam.castShadow = true;

  group.add(pillarL, pillarR, beam);

  // Start Lights Housing
  const startLights: THREE.Mesh[] = [];
  const lightHousingGeom = new THREE.BoxGeometry(5.2, 1.0, 0.5);
  const lightHousing = new THREE.Mesh(lightHousingGeom, gantryMaterial);
  lightHousing.position.copy(startPt).add(new THREE.Vector3(0, 7.0, 0)).addScaledVector(startTangent, 0.8);
  lightHousing.quaternion.copy(beam.quaternion);
  group.add(lightHousing);

  const bulbGeom = new THREE.SphereGeometry(0.28, 16, 16);
  for (let i = 0; i < 5; i++) {
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      emissive: 0x000000,
      roughness: 0.2,
    });
    const bulb = new THREE.Mesh(bulbGeom, bulbMat);
    const offset = (i - 2) * 0.95;
    bulb.position.copy(lightHousing.position).addScaledVector(startNormal, offset);
    bulb.position.y -= 0.05;
    group.add(bulb);
    startLights.push(bulb);
  }

  const setStartLightsCount = (redCount: number, isGreen: boolean) => {
    startLights.forEach((bulb, idx) => {
      const mat = bulb.material as THREE.MeshStandardMaterial;
      if (isGreen) {
        mat.color.set(0x22c55e);
        mat.emissive.set(0x22c55e);
        mat.emissiveIntensity = 3.0;
      } else if (idx < redCount) {
        mat.color.set(0xef4444);
        mat.emissive.set(0xef4444);
        mat.emissiveIntensity = 3.0;
      } else {
        mat.color.set(0x1f2937);
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  };

  // --- 4. STARTING GRID SLOTS (12 slots in 3-wide MotoGP formation) ---
  // Evaluated directly along the closed CatmullRom spline to guarantee 100% road contact
  const gridSlots: { position: THREE.Vector3; rotationY: number; progress: number }[] = [];

  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 3);
    const colInRow = i % 3; // 0 = left, 1 = center, 2 = right
    const distBack = 16 + row * 9.0; // 9.0 meters between rows
    const lateralOffset = (colInRow - 1) * 3.2; // -3.2m (left), 0m (center), +3.2m (right) - safely on asphalt

    // Evaluate exact progress backwards along the closed curve
    const progressBack = distBack / trackLength;
    const slotProgress = ((1.0 - progressBack) % 1.0 + 1.0) % 1.0;

    const slotCenter = spline.getPointAt(slotProgress);
    const slotTang = spline.getTangentAt(slotProgress).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const slotNorm = new THREE.Vector3().crossVectors(slotTang, up).normalize();

    const slotPt = slotCenter.clone().addScaledVector(slotNorm, lateralOffset);
    slotPt.y = slotCenter.y + 0.12; // Flush with asphalt road surface

    const forwardHeading = Math.atan2(slotTang.x, -slotTang.z);

    gridSlots.push({
      position: slotPt,
      rotationY: forwardHeading,
      progress: slotProgress,
    });

    // Painted grid box on the asphalt
    const gridBoxGeom = new THREE.PlaneGeometry(2.4, 4.2);
    const gridBoxMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const gridBox = new THREE.Mesh(gridBoxGeom, gridBoxMat);
    gridBox.position.copy(slotPt);
    gridBox.position.y += 0.02;
    gridBox.rotation.x = -Math.PI / 2;
    gridBox.rotation.z = Math.atan2(slotTang.x, slotTang.z);
    group.add(gridBox);
  }

  // --- 5. DENSE CENTERLINE SAMPLES (for high-precision spline distance & elevation) ---
  const SAMPLE_COUNT = 500;
  const centerlineSamples: TrackCenterlineSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const p = i / SAMPLE_COUNT;
    const pos = spline.getPointAt(p);
    const tang = spline.getTangentAt(p).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const norm = new THREE.Vector3().crossVectors(tang, up).normalize();
    centerlineSamples.push({ position: pos, tangent: tang, normal: norm, progress: p });
  }

  const getClosestTrackInfo = (pos: THREE.Vector3) => {
    let bestDistSq = Infinity;
    let bestIdx = 0;

    // 1. Fast sample search across 500 precomputed track points
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const sample = centerlineSamples[i];
      const dx = pos.x - sample.position.x;
      const dz = pos.z - sample.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIdx = i;
      }
    }

    // 2. High-precision projection on adjacent segments for millimeter accuracy
    const prevIdx = (bestIdx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT;
    const nextIdx = (bestIdx + 1) % SAMPLE_COUNT;

    const sPrev = centerlineSamples[prevIdx];
    const sCurr = centerlineSamples[bestIdx];
    const sNext = centerlineSamples[nextIdx];

    // Project onto [prev, curr]
    const v0 = sCurr.position.clone().sub(sPrev.position);
    const lenSq0 = v0.lengthSq();
    let t0 = 0;
    if (lenSq0 > 0.0001) {
      t0 = Math.max(0, Math.min(1, pos.clone().sub(sPrev.position).dot(v0) / lenSq0));
    }
    const pt0 = sPrev.position.clone().addScaledVector(v0, t0);
    const dSq0 = (pos.x - pt0.x) * (pos.x - pt0.x) + (pos.z - pt0.z) * (pos.z - pt0.z);

    // Project onto [curr, next]
    const v1 = sNext.position.clone().sub(sCurr.position);
    const lenSq1 = v1.lengthSq();
    let t1 = 0;
    if (lenSq1 > 0.0001) {
      t1 = Math.max(0, Math.min(1, pos.clone().sub(sCurr.position).dot(v1) / lenSq1));
    }
    const pt1 = sCurr.position.clone().addScaledVector(v1, t1);
    const dSq1 = (pos.x - pt1.x) * (pos.x - pt1.x) + (pos.z - pt1.z) * (pos.z - pt1.z);

    let projPt: THREE.Vector3;
    let tang: THREE.Vector3;
    let norm: THREE.Vector3;
    let prog: number;

    if (dSq0 <= dSq1) {
      projPt = pt0;
      tang = sPrev.tangent.clone().lerp(sCurr.tangent, t0).normalize();
      norm = sPrev.normal.clone().lerp(sCurr.normal, t0).normalize();
      let pA = sPrev.progress;
      let pB = sCurr.progress;
      if (pB < pA) pB += 1.0;
      prog = ((pA + t0 * (pB - pA)) % 1.0 + 1.0) % 1.0;
    } else {
      projPt = pt1;
      tang = sCurr.tangent.clone().lerp(sNext.tangent, t1).normalize();
      norm = sCurr.normal.clone().lerp(sNext.normal, t1).normalize();
      let pA = sCurr.progress;
      let pB = sNext.progress;
      if (pB < pA) pB += 1.0;
      prog = ((pA + t1 * (pB - pA)) % 1.0 + 1.0) % 1.0;
    }

    const toBike = pos.clone().sub(projPt);
    const lateralDist = toBike.dot(norm);
    const roadY = projPt.y + 0.12;

    return {
      distance: lateralDist,
      progress: prog,
      roadY,
      tangent: tang,
      normal: norm,
    };
  };

  // --- 6. ORDERED CHECKPOINTS AROUND TRACK ---
  const CHECKPOINT_COUNT = 32;
  const checkpoints: { position: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; progress: number }[] = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i++) {
    const progress = i / CHECKPOINT_COUNT;
    const pos = spline.getPointAt(progress);
    const tang = spline.getTangentAt(progress).normalize();
    const norm = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();
    checkpoints.push({ position: pos, tangent: tang, normal: norm, progress });
  }

  // --- 6. BRAKE DISTANCE BOARDS & SPONSOR WALLS ---
  const sponsorTexts = ['MOTO THUNDER', 'OCTANE 100', 'VORTEX RACING', 'APEX GP', 'KYOTO HYPER', 'AERO TECH'];
  const sponsorGeom = new THREE.BoxGeometry(8.0, 2.0, 0.25);

  for (let i = 2; i < points.length; i += 2) {
    const t = i / points.length;
    const pt = spline.getPointAt(t);
    const tang = spline.getTangentAt(t).normalize();
    const norm = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

    const sponsorTxt = sponsorTexts[i % sponsorTexts.length];
    const isDark = i % 4 === 0;
    const sponsorTex = createSponsorBoardTexture(
      sponsorTxt,
      isDark ? '#0f172a' : '#b91c1c',
      isDark ? '#38bdf8' : '#ffffff'
    );
    const boardMat = new THREE.MeshStandardMaterial({ map: sponsorTex, roughness: 0.4 });
    const board = new THREE.Mesh(sponsorGeom, boardMat);

    board.position.copy(pt).addScaledVector(norm, HALF_WIDTH + CURB_WIDTH + 1.2);
    board.position.y += 1.4;
    board.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tang);
    board.castShadow = true;
    group.add(board);
  }

  // Brake Distance Markers (200m, 150m, 100m, 50m before main turns)
  const markerGeom = new THREE.BoxGeometry(1.0, 1.5, 0.1);
  [200, 150, 100, 50].forEach((dist) => {
    const t = (trackLength - dist) / trackLength;
    if (t > 0 && t < 1) {
      const pt = spline.getPointAt(t);
      const tang = spline.getTangentAt(t).normalize();
      const norm = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      const markerTex = createSponsorBoardTexture(`${dist}`, '#ffffff', '#000000');
      const markerMat = new THREE.MeshStandardMaterial({ map: markerTex, roughness: 0.3 });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      marker.position.copy(pt).addScaledVector(norm, -HALF_WIDTH - CURB_WIDTH - 1.2);
      marker.position.y += 0.9;
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tang);
      group.add(marker);
    }
  });

  // --- 7. GRANDSTANDS ALONG PIT STRAIGHT ---
  const grandstandGeom = new THREE.BoxGeometry(90.0, 9.0, 14.0);
  const grandstandMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
  const grandstand = new THREE.Mesh(grandstandGeom, grandstandMat);
  grandstand.position.copy(startPt).addScaledVector(startNormal, HALF_WIDTH + CURB_WIDTH + 18.0);
  grandstand.position.y += 4.5;
  grandstand.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), startTangent);
  grandstand.castShadow = true;
  grandstand.receiveShadow = true;
  group.add(grandstand);

  // Grandstand roof canopy
  const canopyGeom = new THREE.BoxGeometry(94.0, 0.6, 18.0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.copy(grandstand.position);
  canopy.position.y += 6.0;
  canopy.quaternion.copy(grandstand.quaternion);
  group.add(canopy);

  // Night circuit floodlights
  if (circuit.timeOfDay === 'night') {
    for (let i = 0; i < points.length; i += 2) {
      const t = i / points.length;
      const pt = spline.getPointAt(t);
      const tang = spline.getTangentAt(t).normalize();
      const norm = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      const floodlight = new THREE.PointLight(0xa5f3fc, 3.5, 80, 1.2);
      floodlight.position.copy(pt).addScaledVector(norm, HALF_WIDTH + 8.0);
      floodlight.position.y += 16.0;
      group.add(floodlight);

      const poleGeom = new THREE.CylinderGeometry(0.25, 0.35, 16, 8);
      const pole = new THREE.Mesh(poleGeom, gantryMaterial);
      pole.position.copy(floodlight.position);
      pole.position.y -= 8.0;
      group.add(pole);
    }
  }

  // Surrounding Ground Terrain (Sitting securely at Y = -0.15 below all track elements)
  const grassTexture = createGrassTexture(circuit.skyColors.ground);
  const groundGeom = new THREE.PlaneGeometry(3500, 3500, 8, 8);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.92,
    metalness: 0.05,
  });
  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.15;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const dispose = () => {
    skyGeom.dispose();
    skyMat.dispose();
    skyTex.dispose();
    roadGeom.dispose();
    roadMaterial.dispose();
    asphaltTexture.dispose();
    leftCurbGeom.dispose();
    rightCurbGeom.dispose();
    curbMaterial.dispose();
    curbTexture.dispose();
    leftRunoffGeom.dispose();
    rightRunoffGeom.dispose();
    gravelMaterial.dispose();
    gravelTexture.dispose();
    leftBarrierGeom.dispose();
    rightBarrierGeom.dispose();
    barrierMaterial.dispose();
    groundGeom.dispose();
    groundMat.dispose();
    grassTexture.dispose();
  };

  return {
    group,
    spline,
    trackLength,
    centerlineSamples,
    checkpoints,
    gridSlots,
    startLights,
    setStartLightsCount,
    getTrackWidth: () => TRACK_WIDTH,
    getClosestTrackInfo,
    dispose,
  };
}
