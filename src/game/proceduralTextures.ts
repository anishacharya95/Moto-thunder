import * as THREE from 'three';

/**
 * Procedural Canvas Textures for Moto Thunder GP
 * Zero external 404 dependencies - crisp, lightweight, and hardware-accelerated.
 */

export function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich dark GP asphalt
  ctx.fillStyle = '#1c1d22';
  ctx.fillRect(0, 0, 512, 512);

  // Surface bitumen aggregate grain
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 28;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Dark rubberized racing line in the center
  const rubberGrad = ctx.createLinearGradient(0, 0, 512, 0);
  rubberGrad.addColorStop(0.0, 'rgba(10, 10, 14, 0)');
  rubberGrad.addColorStop(0.3, 'rgba(10, 10, 14, 0.4)');
  rubberGrad.addColorStop(0.5, 'rgba(5, 5, 8, 0.7)');
  rubberGrad.addColorStop(0.7, 'rgba(10, 10, 14, 0.4)');
  rubberGrad.addColorStop(1.0, 'rgba(10, 10, 14, 0)');
  ctx.fillStyle = rubberGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Bright crisp white track edge boundary lines (50cm wide in world space)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(16, 0, 18, 512);
  ctx.fillRect(512 - 34, 0, 18, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCurbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Alternating red and white curbs with 3D raised ridges
  const stripeH = 64;
  for (let y = 0; y < 256; y += stripeH) {
    const isRed = (y / stripeH) % 2 === 0;
    ctx.fillStyle = isRed ? '#dc2626' : '#f8fafc';
    ctx.fillRect(0, y, 128, stripeH);

    // Bevel highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, y, 128, 6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, y + stripeH - 8, 128, 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCarbonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, 64, 64);

  // Twill weave
  ctx.fillStyle = '#222328';
  for (let x = 0; x < 64; x += 8) {
    for (let y = 0; y < 64; y += 8) {
      if ((x / 8 + y / 8) % 2 === 0) {
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTireTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141416';
  ctx.fillRect(0, 0, 256, 256);

  // Sidewall markings
  ctx.strokeStyle = '#f59e0b'; // Gold / Yellow racing compound ring
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MOTO THUNDER', 128, 38);
  ctx.fillText('PROTOTYPE SLICK', 128, 230);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBrakeDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4b5563';
  ctx.fillRect(0, 0, 256, 256);

  // Carbon rotor ventilation holes
  ctx.fillStyle = '#111827';
  const center = 128;
  const rings = [65, 85, 105];
  rings.forEach((r) => {
    const holes = 18;
    for (let i = 0; i < holes; i++) {
      const angle = (i / holes) * Math.PI * 2;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSponsorBoardTexture(text: string, bgColor: string, fgColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 128);

  // Racing accent stripes
  ctx.fillStyle = fgColor;
  ctx.fillRect(0, 114, 512, 14);
  ctx.fillRect(0, 0, 512, 8);

  ctx.font = 'bold 52px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createStartFinishTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Checkered grid
  const squareSize = 16;
  for (let x = 0; x < 256; x += squareSize) {
    for (let y = 0; y < 64; y += squareSize) {
      const isWhite = ((x / squareSize) + (y / squareSize)) % 2 === 0;
      ctx.fillStyle = isWhite ? '#ffffff' : '#050508';
      ctx.fillRect(x, y, squareSize, squareSize);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGrassTexture(baseHex: string = '#15803d'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base grass tone
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle turf and mown stripes pattern
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = (x / 32) % 2 === 0 ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(x, 0, 32, 512);
  }

  // Organic speckle noise
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise * 1.2));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(64, 64);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGravelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Natural neutral stone gravel tone
  ctx.fillStyle = '#a8a29e'; // Warm stone grey
  ctx.fillRect(0, 0, 256, 256);

  // Pebble noise
  const imgData = ctx.getImageData(0, 0, 256, 256);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const pebble = (Math.random() - 0.5) * 55;
    data[i] = Math.min(255, Math.max(0, data[i] + pebble));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + pebble * 0.95));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + pebble * 0.85));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

