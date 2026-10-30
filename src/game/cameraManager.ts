import * as THREE from 'three';
import { CameraView } from '../types/game';

export class CameraManager {
  public camera: THREE.PerspectiveCamera;
  public mode: CameraView = 'chase_far';

  private currentTarget: THREE.Vector3 = new THREE.Vector3();
  private currentCamPos: THREE.Vector3 = new THREE.Vector3();
  private initialized: boolean = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    this.camera.up.set(0, 1, 0);
  }

  public setMode(newMode: CameraView) {
    this.mode = newMode;
    // Snap camera position when changing modes for responsive feel
    this.initialized = false;
  }

  public nextMode() {
    const modes: CameraView[] = ['chase_far', 'chase_close', 'cockpit', 'nose'];
    const idx = modes.indexOf(this.mode);
    this.setMode(modes[(idx + 1) % modes.length]);
  }

  public reset() {
    this.initialized = false;
  }

  public update(
    bikePos: THREE.Vector3,
    heading: number,
    pitch: number,
    roll: number,
    speedKmh: number,
    delta: number
  ): void {
    const dt = Math.min(delta, 0.05);

    // Dynamic FOV scaling with speed
    const baseFov = this.mode === 'cockpit' ? 68 : 60;
    const speedFovAdd = (Math.min(speedKmh, 350) / 350) * 10;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, baseFov + speedFovAdd, 6, dt);
    this.camera.updateProjectionMatrix();

    // Direction vectors: heading 0 points along -Z
    const forwardX = Math.sin(heading);
    const forwardZ = -Math.cos(heading);

    const desiredCamPos = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();

    if (this.mode === 'chase_far') {
      // Third-person chase camera positioned directly behind and elevated above the motorcycle
      const distBack = 4.8 + (speedKmh / 350) * 0.8;
      const heightUp = 2.2;

      desiredCamPos.set(
        bikePos.x - forwardX * distBack,
        bikePos.y + heightUp,
        bikePos.z - forwardZ * distBack
      );

      // Look forward along the motorcycle's direction of travel and the track surface ahead
      targetLookAt.set(
        bikePos.x + forwardX * 22,
        bikePos.y + 1.0,
        bikePos.z + forwardZ * 22
      );
    } else if (this.mode === 'chase_close') {
      // Close chase camera tighter over the tail cowl
      const distBack = 2.6;
      const heightUp = 1.35;

      desiredCamPos.set(
        bikePos.x - forwardX * distBack,
        bikePos.y + heightUp,
        bikePos.z - forwardZ * distBack
      );

      targetLookAt.set(
        bikePos.x + forwardX * 16,
        bikePos.y + 0.9,
        bikePos.z + forwardZ * 16
      );
    } else if (this.mode === 'cockpit') {
      // Onboard cockpit view right over handlebars looking through windscreen
      const distForward = 0.05;
      const heightUp = 0.88;

      desiredCamPos.set(
        bikePos.x + forwardX * distForward,
        bikePos.y + heightUp,
        bikePos.z + forwardZ * distForward
      );

      targetLookAt.set(
        bikePos.x + forwardX * 24,
        bikePos.y + 0.85,
        bikePos.z + forwardZ * 24
      );
    } else if (this.mode === 'nose') {
      // Front fairing nose camera skimming the tarmac
      const distForward = 0.85;
      const heightUp = 0.45;

      desiredCamPos.set(
        bikePos.x + forwardX * distForward,
        bikePos.y + heightUp,
        bikePos.z + forwardZ * distForward
      );

      targetLookAt.set(
        bikePos.x + forwardX * 30,
        bikePos.y + 0.45,
        bikePos.z + forwardZ * 30
      );
    }

    // Keep camera above road surface
    desiredCamPos.y = Math.max(0.35, desiredCamPos.y);

    if (!this.initialized) {
      // Instant snap on spawn or mode switch - zero camera lag from (0,0,0)
      this.currentCamPos.copy(desiredCamPos);
      this.currentTarget.copy(targetLookAt);
      this.camera.position.copy(this.currentCamPos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.currentTarget);
      this.initialized = true;
      return;
    }

    // Smooth exponential damping
    const smoothRate = this.mode === 'cockpit' || this.mode === 'nose' ? 24 : 14;
    this.currentCamPos.lerp(desiredCamPos, 1.0 - Math.exp(-smoothRate * dt));
    this.currentTarget.lerp(targetLookAt, 1.0 - Math.exp(-smoothRate * dt));

    this.camera.position.copy(this.currentCamPos);
    // Ensure camera up vector is always strictly (0, 1, 0) to maintain a rock-solid, level horizon
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.currentTarget);
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

