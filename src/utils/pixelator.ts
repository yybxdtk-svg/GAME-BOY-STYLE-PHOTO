import { ColorPalette, ConverterParams } from '../types';

// Bayer dithering matrices
const BAYER_2X2 = [
  [0, 2],
  [3, 1]
];

const BAYER_4X4 = [
  [0,  8,  2,  10],
  [12, 4,  14, 6],
  [3,  11, 1,  9],
  [15, 7,  13, 5]
];

const BAYER_8X8 = [
  [0,  48, 12, 60, 3,  51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8,  56, 4,  52, 11, 59, 7,  55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2,  50, 14, 62, 1,  49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6,  54, 9,  57, 5,  53],
  [42, 26, 38, 22, 41, 25, 37, 21]
];

// Helper to convert hex strings to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b
  };
}

// Find closest color in the palette
function findClosestColor(
  r: number,
  g: number,
  b: number,
  palette: { r: number; g: number; b: number }[]
): { r: number; g: number; b: number; index: number } {
  let minDistance = Infinity;
  let closest = palette[0];
  let closestIdx = 0;

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    // CIEDE2000 is overkill, simple Euclidean distance with redmean approximation works exceptionally well
    const rMean = (r + p.r) / 2;
    const dr = r - p.r;
    const dg = g - p.g;
    const db = b - p.b;
    const distance = (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;

    if (distance < minDistance) {
      minDistance = distance;
      closest = p;
      closestIdx = i;
    }
  }

  return { ...closest, index: closestIdx };
}

// Procedural pixel quantization helper for high-depth / hardware color spaces
function getQuantizedPixel(
  r: number,
  g: number,
  b: number,
  paletteId: string,
  paletteRgb: { r: number; g: number; b: number }[]
): { r: number; g: number; b: number; index: number } {
  if (paletteId === 'bit16_color') {
    // 16-Bit color (R5G6B5)
    const qr = Math.round(r * 31 / 255) * 255 / 31;
    const qg = Math.round(g * 63 / 255) * 255 / 63;
    const qb = Math.round(b * 31 / 255) * 255 / 31;
    return { r: qr, g: qg, b: qb, index: 0 };
  } else if (paletteId === 'bit24_color') {
    // 24-Bit color (full 8-bit per channel)
    const qr = Math.max(0, Math.min(255, r));
    const qg = Math.max(0, Math.min(255, g));
    const qb = Math.max(0, Math.min(255, b));
    return { r: qr, g: qg, b: qb, index: 0 };
  } else if (paletteId === 'bit16_grayscale') {
    // 16 shades of gray (4-bit grayscale)
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const qLuma = Math.round(luma * 15 / 255) * 255 / 15;
    return { r: qLuma, g: qLuma, b: qLuma, index: 0 };
  } else if (paletteId === 'bit24_grayscale') {
    // 256 shades of gray (8-bit grayscale)
    const luma = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b));
    return { r: luma, g: luma, b: luma, index: 0 };
  } else {
    return findClosestColor(r, g, b, paletteRgb);
  }
}

// Main image processor
export function processImage(
  sourceImage: HTMLImageElement | HTMLVideoElement,
  params: ConverterParams,
  palette: ColorPalette
): HTMLCanvasElement {
  // 1. Create offscreen canvas for downsizing (pixelation)
  const offscreenCanvas = document.createElement('canvas');
  const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return offscreenCanvas;

  const isVideo = sourceImage instanceof HTMLVideoElement;
  const srcWidth = isVideo ? (sourceImage as HTMLVideoElement).videoWidth : (sourceImage as HTMLImageElement).naturalWidth;
  const srcHeight = isVideo ? (sourceImage as HTMLVideoElement).videoHeight : (sourceImage as HTMLImageElement).naturalHeight;

  let dw = params.resolutionWidth;
  let dh = params.resolutionHeight;

  // If a fit mode is specified (cover, contain, fill), the user wants to fit the content within the 
  // designated console screen area (resolutionWidth x resolutionHeight). In these cases, we must NOT 
  // resize the canvas's own dimensions. Otherwise, there is no spatial reference box for fitMode to 
  // align, scale, or translate within, rendering the cover/contain/fill modes identical.
  const hasFitMode = params.photoFitMode === 'cover' || params.photoFitMode === 'contain' || params.photoFitMode === 'fill';

  if (params.maintainAspectRatio && !hasFitMode) {
    const aspect = srcWidth / (srcHeight || 1);
    if (aspect > dw / dh) {
      dh = Math.round(dw / aspect);
    } else {
      dw = Math.round(dh * aspect);
    }
  }

  offscreenCanvas.width = dw;
  offscreenCanvas.height = dh;
  
  // Custom sizing scale to retain crisp pixels
  ctx.imageSmoothingEnabled = false;

  // Render fitting / scaling / translating
  const imgW = srcWidth;
  const imgH = srcHeight;
  const imgAspect = imgW / imgH;
  const screenAspect = dw / dh;

  let drawW = dw;
  let drawH = dh;
  let drawX = 0;
  let drawY = 0;

  const fitMode = params.photoFitMode || 'cover';

  if (fitMode === 'cover') {
    if (imgAspect > screenAspect) {
      drawH = dh;
      drawW = dh * imgAspect;
      drawX = (dw - drawW) / 2;
    } else {
      drawW = dw;
      drawH = dw / imgAspect;
      drawY = (dh - drawH) / 2;
    }
  } else if (fitMode === 'contain') {
    // Fill the background of contain with the darkest/first palette color
    const isProcedural = ['bit16_color', 'bit24_color', 'bit16_grayscale', 'bit24_grayscale', 'original_color'].includes(palette.id);
    const pColors = palette.id === 'custom' ? params.customColors : (isProcedural ? ['#000000'] : palette.colors);
    ctx.fillStyle = pColors && pColors.length > 0 ? pColors[0] : '#000000';
    ctx.fillRect(0, 0, dw, dh);

    if (imgAspect > screenAspect) {
      drawW = dw;
      drawH = dw / imgAspect;
      drawY = (dh - drawH) / 2;
    } else {
      drawH = dh;
      drawW = dh * imgAspect;
      drawX = (dw - drawW) / 2;
    }
  } else {
    // 'fill'
    drawW = dw;
    drawH = dh;
    drawX = 0;
    drawY = 0;
  }

  // Apply user-defined zoom / scale and offsets
  const userScale = (params.photoScale !== undefined ? params.photoScale : 100) / 100;
  const centerX = drawX + drawW / 2;
  const centerY = drawY + drawH / 2;
  const scaledW = drawW * userScale;
  const scaledH = drawH * userScale;

  // Translation offset: map -100 to 100 as percentage of low-res display width/height
  const userOffsetX = ((params.photoOffsetX !== undefined ? params.photoOffsetX : 0) / 100) * dw;
  const userOffsetY = ((params.photoOffsetY !== undefined ? params.photoOffsetY : 0) / 100) * dh;

  const finalDrawX = centerX - scaledW / 2 + userOffsetX;
  const finalDrawY = centerY - scaledH / 2 + userOffsetY;

  // Under-fill background before drawing
  let fillBgColor = '#0f380f';
  const isProcedural = ['bit16_color', 'bit24_color', 'bit16_grayscale', 'bit24_grayscale', 'original_color'].includes(palette.id);
  if (palette.id === 'custom') {
    fillBgColor = params.customColors[0] || '#0f380f';
  } else if (isProcedural) {
    fillBgColor = '#000000';
  } else {
    fillBgColor = palette.colors[0] || '#0f380f';
  }
  ctx.fillStyle = fillBgColor;
  ctx.fillRect(0, 0, dw, dh);

  ctx.drawImage(sourceImage, finalDrawX, finalDrawY, scaledW, scaledH);

  // Get image data
  const imgData = ctx.getImageData(0, 0, dw, dh);
  const data = imgData.data;

  // Cache RGB palette colors for fast matching
  let paletteRgb: { r: number; g: number; b: number }[] = [];
  if (palette.id === 'custom') {
    paletteRgb = params.customColors.map(hexToRgb);
  } else if (isProcedural) {
    paletteRgb = [{ r: 0, g: 0, b: 0 }];
  } else {
    paletteRgb = palette.colors.map(hexToRgb);
  }

  // Helper functions for parameter adjustments
  const adjustContrast = (val: number, factor: number) => {
    return Math.max(0, Math.min(255, factor * (val - 128) + 128));
  };

  const adjustSaturation = (r: number, g: number, b: number, factor: number) => {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return {
      r: Math.max(0, Math.min(255, luma + factor * (r - luma))),
      g: Math.max(0, Math.min(255, luma + factor * (g - luma))),
      b: Math.max(0, Math.min(255, luma + factor * (b - luma)))
    };
  };

  const bFactor = 1 + params.brightness / 100;
  const cFactor = Math.max(0, (params.contrast + 100) / 100);
  const sFactor = Math.max(0, (params.saturation + 100) / 100);

  // Buffer for raw adjusted colors if we are doing error-diffusion dither
  const processedRgb = new Float32Array(dw * dh * 3);

  // First pass: adjust brightness, contrast, saturation
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const idx = (y * dw + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // Brightness
      r *= bFactor;
      g *= bFactor;
      b *= bFactor;

      // Contrast
      r = adjustContrast(r, cFactor);
      g = adjustContrast(g, cFactor);
      b = adjustContrast(b, cFactor);

      // Saturation
      const sat = adjustSaturation(r, g, b, sFactor);
      r = sat.r;
      g = sat.g;
      b = sat.b;

      const bufferIdx = (y * dw + x) * 3;
      processedRgb[bufferIdx] = r;
      processedRgb[bufferIdx + 1] = g;
      processedRgb[bufferIdx + 2] = b;
    }
  }

  // 1.5. Apply Edge Enhancement / Retro Contour Outlining if enabled
  if (params.edgeEnhancement) {
    const luma = new Float32Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      const idx = i * 3;
      luma[i] = 0.299 * processedRgb[idx] + 0.587 * processedRgb[idx + 1] + 0.114 * processedRgb[idx + 2];
    }

    const edgeFactor = new Float32Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) edgeFactor[i] = 1.0;

    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        const valL = (ny: number, nx: number) => luma[ny * dw + nx];

        const gx = -valL(y - 1, x - 1) + valL(y - 1, x + 1)
                   - 2 * valL(y, x - 1) + 2 * valL(y, x + 1)
                   - valL(y + 1, x - 1) + valL(y + 1, x + 1);

        const gy = -valL(y - 1, x - 1) - 2 * valL(y - 1, x) - valL(y - 1, x + 1)
                   + valL(y + 1, x - 1) + 2 * valL(y + 1, x) + valL(y + 1, x + 1);

        const mag = Math.sqrt(gx * gx + gy * gy);
        
        // A threshold of 45 is ideal to detect strong retro outline boundaries
        if (mag > 45) {
          // Darken the contours, making edges pop to black/dark shades in the palette
          const factor = Math.max(0.05, Math.min(0.5, 0.9 - (mag / 120)));
          edgeFactor[y * dw + x] = factor;
        }
      }
    }

    for (let i = 0; i < dw * dh; i++) {
      if (edgeFactor[i] < 1.0) {
        processedRgb[i * 3] *= edgeFactor[i];
        processedRgb[i * 3 + 1] *= edgeFactor[i];
        processedRgb[i * 3 + 2] *= edgeFactor[i];
      }
    }
  }

  const ditherStrength = params.ditherAmount / 100;

  // Apply Dithering and Quantization
  if (palette.id === 'original_color') {
    // Original Color Style: Bypass palette matching and quantization entirely
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const bufIdx = (y * dw + x) * 3;
        const outIdx = (y * dw + x) * 4;
        data[outIdx] = Math.max(0, Math.min(255, processedRgb[bufIdx]));
        data[outIdx + 1] = Math.max(0, Math.min(255, processedRgb[bufIdx + 1]));
        data[outIdx + 2] = Math.max(0, Math.min(255, processedRgb[bufIdx + 2]));
      }
    }
  } else if (params.ditherType.startsWith('bayer')) {
    // Ordered dithering
    let size = 4;
    let bayerMatrix = BAYER_4X4;
    if (params.ditherType === 'bayer2') {
      size = 2;
      bayerMatrix = BAYER_2X2;
    } else if (params.ditherType === 'bayer8') {
      size = 8;
      bayerMatrix = BAYER_8X8;
    }

    const divisor = size * size;

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const bufIdx = (y * dw + x) * 3;
        
        // Bayer normalization value: maps 0..matrixSize to slightly shifted luminance
        const threshold = (bayerMatrix[y % size][x % size] / divisor) - 0.5;
        // Shift values range based on dither strength
        const shift = threshold * 255 * ditherStrength;

        const r = Math.max(0, Math.min(255, processedRgb[bufIdx] + shift));
        const g = Math.max(0, Math.min(255, processedRgb[bufIdx + 1] + shift));
        const b = Math.max(0, Math.min(255, processedRgb[bufIdx + 2] + shift));

        const closest = getQuantizedPixel(r, g, b, palette.id, paletteRgb);

        const outIdx = (y * dw + x) * 4;
        data[outIdx] = closest.r;
        data[outIdx + 1] = closest.g;
        data[outIdx + 2] = closest.b;
      }
    }
  } else if (params.ditherType === 'floyd') {
    // Floyd-Steinberg error diffusion dither
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const bufIdx = (y * dw + x) * 3;
        const rVal = processedRgb[bufIdx];
        const gVal = processedRgb[bufIdx + 1];
        const bVal = processedRgb[bufIdx + 2];

        const closest = getQuantizedPixel(rVal, gVal, bVal, palette.id, paletteRgb);

        const outIdx = (y * dw + x) * 4;
        data[outIdx] = closest.r;
        data[outIdx + 1] = closest.g;
        data[outIdx + 2] = closest.b;

        // Propagate errors to neighboring pixels
        const errR = (rVal - closest.r) * ditherStrength;
        const errG = (gVal - closest.g) * ditherStrength;
        const errB = (bVal - closest.b) * ditherStrength;

        // Distribute error helper
        const addError = (nx: number, ny: number, weight: number) => {
          if (nx < 0 || nx >= dw || ny < 0 || ny >= dh) return;
          const targetBufIdx = (ny * dw + nx) * 3;
          processedRgb[targetBufIdx] += errR * weight;
          processedRgb[targetBufIdx + 1] += errG * weight;
          processedRgb[targetBufIdx + 2] += errB * weight;
        };

        // Floyd-Steinberg weights
        addError(x + 1, y,     7 / 16);
        addError(x - 1, y + 1, 3 / 16);
        addError(x,     y + 1, 5 / 16);
        addError(x + 1, y + 1, 1 / 16);
      }
    }
  } else if (params.ditherType === 'halftone') {
    // Simulates a grid dot halftone
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const bufIdx = (y * dw + x) * 3;
        
        // Circular halftone pattern based on distance from pixel center point
        const cx = (x % 3) - 1;
        const cy = (y % 3) - 1;
        const dist = Math.sqrt(cx * cx + cy * cy);
        
        // Dot modulation threshold
        const threshold = (1.5 - dist) * 128 - 64;
        const shift = threshold * ditherStrength;

        const r = Math.max(0, Math.min(255, processedRgb[bufIdx] + shift));
        const g = Math.max(0, Math.min(255, processedRgb[bufIdx + 1] + shift));
        const b = Math.max(0, Math.min(255, processedRgb[bufIdx + 2] + shift));

        const closest = getQuantizedPixel(r, g, b, palette.id, paletteRgb);

        const outIdx = (y * dw + x) * 4;
        data[outIdx] = closest.r;
        data[outIdx + 1] = closest.g;
        data[outIdx + 2] = closest.b;
      }
    }
  } else {
    // None - simple nearest-neighbor quantization
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const bufIdx = (y * dw + x) * 3;
        const closest = getQuantizedPixel(processedRgb[bufIdx], processedRgb[bufIdx + 1], processedRgb[bufIdx + 2], palette.id, paletteRgb);

        const outIdx = (y * dw + x) * 4;
        data[outIdx] = closest.r;
        data[outIdx + 1] = closest.g;
        data[outIdx + 2] = closest.b;
      }
    }
  }

  // Put dithered pixels back
  ctx.putImageData(imgData, 0, 0);

  // Return the processed canvas
  return offscreenCanvas;
}

// Renders the processed image canvas to the final output canvas with LCD grids, Scanlines, Console shell bezel, overlay text box, etc.
export function renderFinalOutput(
  processedCanvas: HTMLCanvasElement,
  params: ConverterParams,
  palette: ColorPalette,
  forceIncludeBezel?: boolean,
  videoCurrentTime?: number,
  videoDuration?: number
): HTMLCanvasElement {
  const finalCanvas = document.createElement('canvas');
  const ctx = finalCanvas.getContext('2d');
  if (!ctx) return finalCanvas;

  // Pre-render the retro dialogue box onto the raw low-resolution canvas!
  // This achieves an authentic, zero-subpixel-aliasing pixelated text and frame look.
  // When processedCanvas is scaled with nearest-neighbor, the text scales into beautiful blocky pixels.
  if (params.textOverlay && params.textOverlay !== 'undefined' && params.textOverlay !== 'null' && params.textPosition !== 'none') {
    const rxCtx = processedCanvas.getContext('2d');
    if (rxCtx) {
      drawRetroDialogueBox(
        rxCtx, 
        0, 
        0, 
        processedCanvas.width, 
        processedCanvas.height, 
        params, 
        palette, 
        videoCurrentTime, 
        videoDuration
      );
    }
  }

  // Let's decide output size. We scale up the processed canvas crisp-ly so the pixel grids are perfectly visible.
  // Game Boy GBC output screen resolution is typically 160x144, but we want a large high-fidelity pixel presentation.
  // Let's scale each pixel to a size of e.g. 4x or larger.
  // If we show a console frame, we place the screen inside a nostalgic Game Boy console frame.
  
  const screenScale = 4; // Scale factor for rendering the retro screen
  const screenW = processedCanvas.width * screenScale;
  const screenH = processedCanvas.height * screenScale;

  // Set sizing parameters based on with/without GBC console bezel frame
  // Note: We only draw the bezel on output if forceIncludeBezel is explicitly true.
  // The live preview area provides an elegant HTML/CSS-level interactive console, so we keep the canvas as pure screen inside the lens!
  const drawBezel = !!forceIncludeBezel;
  if (drawBezel) {
    // Standard GBC high-fidelity output image size
    finalCanvas.width = 840;
    finalCanvas.height = 1436;

    const screenXOff = 100;
    const screenYOff = 140;
    const screenW = 640;
    const screenH = 576;
    
    const colors = getBezelGradientColors(params.bezelColor);

    // 1. Draw beautiful GBC bottom and right physical bezel shadow layer (represents the border shadow in CSS)
    ctx.fillStyle = colors.border;
    fillRoundedRect(ctx, 4, 4, 840 - 8, 1436 - 8, 52);
    ctx.fill();

    // 2. Draw front physical shell body with elegant linear gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 840, 1436);
    bgGrad.addColorStop(0, colors.from);
    bgGrad.addColorStop(0.55, colors.via);
    bgGrad.addColorStop(1, colors.to);

    ctx.save();
    ctx.fillStyle = bgGrad;
    // Shift slightly smaller on bottom/right to reveal shadow layer
    fillRoundedRect(ctx, 0, 0, 840 - 14, 1436 - 14, 52);
    ctx.fill();
    ctx.restore();

    // 3. Draw plastic dynamic grain textured speckle noise onto the custom shell face
    drawPlasticNoise(ctx, 840 - 14, 1436 - 14, params.consoleTextureAlpha ?? 30);

    // 4. Subtle highlights: a top-left soft glare line on corners to mimic plastic molding reflection
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    fillRoundedRect(ctx, 2, 2, 840 - 18, 1436 - 18, 51);
    ctx.stroke();

    // 5. Draw deep screen surround glass container (corresponds to .bg-[#1c1c1e] with .border-[12px] .border-[#131314])
    const lensPadding = 42;
    const lensX = screenXOff - lensPadding;
    const lensY = screenYOff - lensPadding;
    const lensW = screenW + lensPadding * 2;
    const lensH = screenH + lensPadding * 2;

    // Outer border ring container (border-[#131415])
    ctx.fillStyle = '#131314';
    fillRoundedRect(ctx, lensX, lensY, lensW, lensH, 20);
    ctx.fill();

    // Glass body center fill (#1c1c1e)
    ctx.fillStyle = '#1c1c1e';
    fillRoundedRect(ctx, lensX + 12, lensY + 12, lensW - 24, lensH - 24, 16);
    ctx.fill();

    // 6. Draw dynamic elegant double gray ribbon line (teal-500, pink-500, yellow-400)
    const lineGrad = ctx.createLinearGradient(lensX + 24, 0, lensX + lensW - 24, 0);
    lineGrad.addColorStop(0, '#14b8a6'); // teal-500
    lineGrad.addColorStop(0.5, '#ec4899'); // pink-500
    lineGrad.addColorStop(1, '#eab308'); // yellow-400
    ctx.fillStyle = lineGrad;
    ctx.fillRect(lensX + 24, lensY + 28, lensW - 48, 4);

    // 7. Battery Power Indicator LED and light label
    const ledX = lensX + 28;
    const ledY = lensY + (lensH / 2) - 10;
    
    // Resolve Power LED Colors based on parameters
    const ledColorChoice = params.powerLedColor || 'red';
    let ledColor = '#fc1501';
    let ledGlow = 'rgba(252, 21, 1, 0.4)';
    if (ledColorChoice === 'green') {
      ledColor = '#22c55e';
      ledGlow = 'rgba(34, 197, 94, 0.4)';
    } else if (ledColorChoice === 'blue') {
      ledColor = '#3b82f6';
      ledGlow = 'rgba(59, 130, 246, 0.4)';
    } else if (ledColorChoice === 'orange') {
      ledColor = '#f97316';
      ledGlow = 'rgba(249, 115, 22, 0.4)';
    } else if (ledColorChoice === 'cyan') {
      ledColor = '#06b6d4';
      ledGlow = 'rgba(6, 182, 212, 0.4)';
    } else if (ledColorChoice === 'off') {
      ledColor = '#374151';
      ledGlow = 'rgba(0, 0, 0, 0)';
    }

    // Power text label above LED
    ctx.fillStyle = '#888888';
    ctx.font = '700 8.5px "JetBrains Mono", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POWER', ledX, ledY - 14);

    // Main red led core light circle
    ctx.beginPath();
    ctx.arc(ledX, ledY, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = ledColor;
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // LED Glow aura
    if (ledColorChoice !== 'off') {
      ctx.beginPath();
      ctx.arc(ledX, ledY, 15, 0, Math.PI * 2);
      ctx.fillStyle = ledGlow;
      ctx.fill();
    }

    // 8. Split user-defined printed text signature for classic "GAME BOY c-o-l-o-r" style lettering
    const fullLogoText = (params.consoleLogoText || 'GAME BOY COLOR').trim();
    const logoWords = fullLogoText.split(/\s+/);
    const lastWord = logoWords.length > 1 ? logoWords.pop() || '' : '';
    const mainText = logoWords.join(' ');

    const textBaseX = lensX + (lensW / 2) - 62;
    const lensTextY = lensY + lensH - 16;

    // Elegant monochrome logo prefix ("GAME BOY")
    ctx.fillStyle = '#949599';
    ctx.font = 'italic 500 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mainText, textBaseX, lensTextY);

    const mainTextW = ctx.measureText(mainText).width;
    let labelOffset = textBaseX + mainTextW + 8;

    // Colorful character lettering for the last word (e.g. "COLOR")
    const GBC_RAINBOW_COLORS = ['#e60012', '#009fe3', '#f58220', '#009944', '#9e3f97'];
    const characters = lastWord ? lastWord.split('') : (fullLogoText ? [] : ['C', 'O', 'L', 'O', 'R']);
    
    // Fallback if logo is a single word
    const activeChars = characters.length > 0 ? characters : fullLogoText.split('');
    const activeOffset = characters.length > 0 ? labelOffset : textBaseX;

    ctx.font = 'bold italic 500 17px "Inter", sans-serif';
    let curX = activeOffset;
    for (let i = 0; i < activeChars.length; i++) {
      ctx.fillStyle = GBC_RAINBOW_COLORS[i % GBC_RAINBOW_COLORS.length];
      ctx.fillText(activeChars[i], curX, lensTextY);
      curX += ctx.measureText(activeChars[i]).width + 1.2;
    }

    // Reset layout alignments
    ctx.textAlign = 'left';

    // Calculate aspect ratios to fit processedCanvas snugly inside the 640x576 lens area:
    const processedAspect = processedCanvas.width / processedCanvas.height;
    const viewportAspect = screenW / screenH;
    
    let renderW = screenW;
    let renderH = screenH;
    let renderX = screenXOff;
    let renderY = screenYOff;
    
    if (processedAspect > viewportAspect) {
      renderW = screenW;
      renderH = Math.round(screenW / processedAspect);
      renderY = screenYOff + Math.round((screenH - renderH) / 2);
    } else {
      renderH = screenH;
      renderW = Math.round(screenH * processedAspect);
      renderX = screenXOff + Math.round((screenW - renderW) / 2);
    }

    // Fill screen glass background black backing
    ctx.fillStyle = '#050505';
    ctx.fillRect(screenXOff, screenYOff, screenW, screenH);

    // Draw retro Screen Content itself inside lens
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(processedCanvas, renderX, renderY, renderW, renderH);

    // Apply LCD Grids and Scanlines exclusively on screen dimensions
    // One physical pixel of the low-res image occupies `fitScale` pixels on the high-res 640-wide display
    const fitScale = renderW / processedCanvas.width;
    applyGridScanlineEffects(ctx, renderX, renderY, renderW, renderH, params, fitScale);

    // Draw Hardware Console Buttons in bottom area (D-Pad, A/B buttons, speaker grill slits)
    drawConsoleButtonsAndSpeaker(ctx, params);

  } else {
    // Pure digital image presentation
    const screenScale = 4; // Scale factor for rendering the retro screen
    const screenW = processedCanvas.width * screenScale;
    const screenH = processedCanvas.height * screenScale;

    finalCanvas.width = screenW;
    finalCanvas.height = screenH;

    // Direct draw scaled image
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(processedCanvas, 0, 0, screenW, screenH);

    // Apply retro matrices
    applyGridScanlineEffects(ctx, 0, 0, screenW, screenH, params, screenScale);
  }

  return finalCanvas;
}

// Helpers for drawing console style details
function getBezelGradientColors(choice: string): { from: string, via: string, to: string, border: string } {
  switch (choice) {
    case 'dmg': 
      return { from: '#d1cfc4', via: '#b7b4a7', to: '#979488', border: '#5b5952' };
    case 'yellow': 
      return { from: '#fad02c', via: '#e6b012', to: '#b88c0a', border: '#664d03' };
    case 'berry': 
      return { from: '#d43d6a', via: '#bc2551', to: '#8d1b3e', border: '#5e0a22' };
    case 'turquoise': 
      return { from: '#00c9d2', via: '#009fa5', to: '#007377', border: '#003d3f' };
    case 'purple': 
      return { from: '#6b52a5', via: '#493775', to: '#2e214d', border: '#1b1230' };
    case 'clear': 
      return { from: '#ffffff', via: '#dedede', to: '#b5b5c0', border: '#7a7a85' };
    case 'orange': 
      return { from: '#ff7e36', via: '#e05a10', to: '#aa3d00', border: '#6b2500' };
    case 'gold': 
      return { from: '#ffd700', via: '#cfa024', to: '#8c6b12', border: '#59440b' };
    case 'black': 
      return { from: '#374151', via: '#111827', to: '#030712', border: '#000000' };
    case 'blue': 
      return { from: '#2563eb', via: '#1d4ed8', to: '#1e3a8a', border: '#132247' };
    case 'green': 
      return { from: '#10b981', via: '#059669', to: '#064e3b', border: '#022c22' };
    case 'mint': 
      return { from: '#a7f3d0', via: '#5eead4', to: '#0f766e', border: '#0d524d' };
    case 'rose': 
      return { from: '#fbcfe8', via: '#f472b6', to: '#be185d', border: '#83103c' };
    default: 
      return { from: '#d1cfc4', via: '#b7b4a7', to: '#979488', border: '#5b5952' };
  }
}

function getButtonBoxColor(choice: string): string {
  switch (choice) {
    case 'dmg': return '#959389';
    case 'mint': return '#283e3b';
    case 'rose': return '#3b2b30';
    default: return '#2a2b2e';
  }
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getButtonBoxBorder(choice: string): string {
  switch (choice) {
    case 'dmg': return '#5b5952';
    case 'mint': return '#115e59';
    case 'rose': return '#83103c';
    default: return '#111113';
  }
}

function getBezelColorHex(choice: string): string {
  switch (choice) {
    case 'dmg': return '#b7b4a7'; // Original DMG pale warm gray
    case 'yellow': return '#e6b012'; // Bright yellow GBC shell
    case 'berry': return '#c41d4a'; // Juicy GBC Pink Berry
    case 'turquoise': return '#009fa5'; // Teal Turquoise GBC Classic
    case 'purple': return '#493775'; // GBC Translucent purple background (Grape)
    case 'clear': return '#dedede'; // Frosty white retro shell
    case 'orange': return '#e05a10'; // Spice Orange
    case 'gold': return '#cf9f23'; // Royal Gold Edition
    case 'black': return '#111827'; // Onyx Black
    case 'blue': return '#1d4ed8'; // Midnight Deep Indigo Blue
    case 'green': return '#059669'; // Jungle Green
    case 'mint': return '#5eead4'; // Mint Green
    case 'rose': return '#f472b6'; // Sakura Pink
    default: return '#b7b4a7';
  }
}

function drawPlasticNoise(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  if (strength <= 0) return;
  // Plastic matte textured speckle effect for tactile screen feel
  const darkAlpha = (strength / 100) * 0.12;
  const lightAlpha = (strength / 100) * 0.10;
  const numDots = Math.floor(w * h * 0.015);
  
  ctx.fillStyle = `rgba(0, 0, 0, ${darkAlpha.toFixed(3)})`;
  for (let i = 0; i < numDots; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    const rSize = Math.random() * 1.5 + 0.5;
    ctx.fillRect(rx, ry, rSize, rSize);
  }
  ctx.fillStyle = `rgba(255, 255, 255, ${lightAlpha.toFixed(3)})`;
  for (let i = 0; i < numDots / 2; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    const rSize = Math.random() * 1.5;
    ctx.fillRect(rx, ry, rSize, rSize);
  }
}

function applyGridScanlineEffects(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  sw: number,
  sh: number,
  params: ConverterParams,
  scale: number
) {
  // LCD Grid effect: simulates the screen pixel gaps on real nostalgic LCD gameboys
  if (params.lcdGridStrength > 0) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${params.lcdGridStrength / 130})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // vertical grid lines at each scaled pixel column
    for (let x = ox; x <= ox + sw; x += scale) {
      ctx.moveTo(x + 0.5, oy);
      ctx.lineTo(x + 0.5, oy + sh);
    }
    // horizontal grid lines at each scaled pixel row
    for (let y = oy; y <= oy + sh; y += scale) {
      ctx.moveTo(ox, y + 0.5);
      ctx.lineTo(ox + sw, y + 0.5);
    }
    ctx.stroke();
  }

  // Horizontal Scanline retro visual overlay
  if (params.scanlineStrength > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    const alphaFactor = params.scanlineStrength / 100 * 0.35;
    ctx.fillStyle = `rgba(0, 0, 0, ${alphaFactor})`;
    
    // Thin horizontal rows
    for (let y = oy; y < oy + sh; y += 3) {
      ctx.fillRect(ox, y, sw, 1);
    }
  }

  // Classic GBC Screen Reflection Glare (gives the glossy retro display glass texture)
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + sw * 0.7, oy);
  ctx.lineTo(ox + sw * 0.2, oy + sh);
  ctx.lineTo(ox, oy + sh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)'; // extremely soft white diagonal glare gloss
  ctx.fill();
}

function drawRetroDialogueBox(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  sw: number,
  sh: number,
  params: ConverterParams,
  palette: ColorPalette,
  videoCurrentTime?: number,
  videoDuration?: number
) {
  const isProcedural = ['bit16_color', 'bit24_color', 'bit16_grayscale', 'bit24_grayscale', 'original_color'].includes(palette.id);
  const paletteHexs = palette.id === 'custom' ? params.customColors : (isProcedural ? [] : palette.colors);
  const bgColor = paletteHexs && paletteHexs.length > 0 ? paletteHexs[0] : '#000000';
  // Use the brightest color for text to maximize contrast inside the dark dialogue container
  const textColor = paletteHexs && paletteHexs.length > 0 ? paletteHexs[paletteHexs.length - 1] : '#ffffff';

  // Sizing parameters, scaled proportionally to the low-resolution canvas size!
  // dialogueBoxPadding: horizontal/vertical border padding (default 12)
  // dialogueBoxHeight: percentage of screen height (e.g. 15 to 60, default 32)
  // dialogueBoxYOffset: vertical offset distance from screen top/bottom margin pixels (default 12)
  const padding = Math.max(1, Math.round((params.dialogueBoxPadding || 12) * (sw / 530)));
  const yOffset = Math.max(1, Math.round((params.dialogueBoxYOffset !== undefined ? params.dialogueBoxYOffset : 12) * (sh / 480)));
  const boxH = Math.max(16, Math.round(sh * ((params.dialogueBoxHeight || 32) / 100)));
  const boxW = sw - padding * 2;
  
  let bx = ox + padding;
  let by = oy + sh - boxH - yOffset;
  if (params.textPosition === 'top') {
    by = oy + yOffset;
  } else if (params.textPosition === 'none') {
    return;
  }

  // Render RPG Border Panel inside lens
  ctx.fillStyle = bgColor; // Darkest palette color
  ctx.fillRect(bx, by, boxW, boxH);

  // Soft inner border
  const innerOffset = Math.max(1, Math.round(3 * (sw / 530)));
  ctx.strokeStyle = textColor; // Brightest palette color
  ctx.lineWidth = Math.max(1, Math.round(1.5 * (sw / 530)));
  ctx.strokeRect(bx + innerOffset, by + innerOffset, boxW - innerOffset * 2, boxH - innerOffset * 2);

  // Set RPG text settings
  // The font size scales dynamically with sw to ensure perfect alignment in low-resolution (e.g., sw = 160 vs sw = 320)
  const fontSize = Math.max(5, Math.ceil((params.textFontSize || 14) * (sw / 360)));
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px "JetBrains Mono", Courier, monospace`;
  ctx.textBaseline = 'top';

  // Settle typewriter text
  let finalRawText = (params.textOverlay && params.textOverlay !== 'undefined' && params.textOverlay !== 'null') ? params.textOverlay : '';
  if (params.textTypewriter && videoCurrentTime !== undefined && videoDuration !== undefined && videoDuration > 0) {
    // Elegant typewriter timing logic: Starts typing at the very beginning (0s), types linearly, and finishes 
    // exactly 1 second before the end, keeping the full text fully visible and static during the final 1 second of the video.
    const animDur = Math.max(0.1, videoDuration - 1);
    const progress = Math.min(1, Math.max(0, videoCurrentTime / animDur));
    const charsCount = Math.floor(finalRawText.length * progress);
    finalRawText = finalRawText.substring(0, charsCount);
  }

  // Support wrapping lines
  const textWords = finalRawText.split(' ');
  const linesToRender: string[] = [];
  let currentLine = '';
  const textMargin = Math.max(3, Math.round(11 * (sw / 530)));
  const maxLineW = boxW - textMargin * 2;

  for (let i = 0; i < textWords.length; i++) {
    const word = textWords[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    
    if (testWidth > maxLineW) {
      if (currentLine) {
        linesToRender.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    linesToRender.push(currentLine);
  }

  // Draw wrapped lines
  const tx = bx + textMargin;
  const textTopMargin = Math.max(3, Math.round(8 * (sw / 530)));
  let ty = by + textTopMargin;
  
  // Calculate vertical advance based on the font size. A good advance is ~1.4 times the font size
  const fontAdvance = Math.floor(fontSize * 1.4);
  
  // How many lines can fit inside the box height?
  const maxLinesThatCanFit = Math.floor((boxH - textTopMargin * 2) / fontAdvance);
  const linesToDraw = Math.max(1, Math.min(maxLinesThatCanFit > 0 ? maxLinesThatCanFit : 1, linesToRender.length));

  for (let idx = 0; idx < linesToDraw; idx++) {
    ctx.fillText(linesToRender[idx], tx, ty);
    ty += fontAdvance;
  }

  // RPG active typing arrow blinking cursor indicator bottom corner
  if (params.textBlinkingCursor) {
    const cursorSize = Math.max(2, Math.round(5 * (sw / 530)));
    const cursorX = bx + boxW - Math.max(5, Math.round(16 * (sw / 530)));
    const cursorY = by + boxH - Math.max(5, Math.round(12 * (sw / 530)));
    
    ctx.beginPath();
    ctx.moveTo(cursorX, cursorY);
    ctx.lineTo(cursorX + cursorSize, cursorY);
    ctx.lineTo(cursorX + cursorSize / 2, cursorY + cursorSize * 0.75);
    ctx.closePath();
    ctx.fillStyle = textColor;
    ctx.fill();
  }
}

function drawConsoleButtonsAndSpeaker(
  ctx: CanvasRenderingContext2D,
  params: ConverterParams
) {
  const totalW = 840;
  const totalH = 1436;

  // 1. Classic Left Directional Pad (D-Pad) - Scaled to 1.3x
  const dpadCX = 210; // Perfectly centered on the left half column of the screen layout
  const dpadCY = 1000; // Symmetrical and vertical balance below the taller screen lens
  const armL = Math.round(46 * 1.3);   // Proportional length of arms from center: 60
  const armW = Math.round(28 * 1.3);   // Proportional width of arms: 36
  const recessRadius = Math.round(56 * 1.3); // 73

  // D-Pad recess plate (distinct tactile circular indentation on GBC)
  const recessGrad = ctx.createRadialGradient(dpadCX, dpadCY, Math.round(40 * 1.3), dpadCX, dpadCY, recessRadius);
  recessGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
  recessGrad.addColorStop(1, 'rgba(0,0,0,0.02)');
  ctx.fillStyle = recessGrad;
  ctx.beginPath();
  ctx.arc(dpadCX, dpadCY, recessRadius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle circular inset rim
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(dpadCX, dpadCY, recessRadius, 0, Math.PI * 2);
  ctx.stroke();

  // D-Pad main cross
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#222224'; // Realistic matte dark charcoal look

  // Draw cross path as a single polygon (so shadow renders seamlessly)
  ctx.beginPath();
  ctx.moveTo(dpadCX - armW / 2, dpadCY - armL);
  ctx.lineTo(dpadCX + armW / 2, dpadCY - armL);
  ctx.lineTo(dpadCX + armW / 2, dpadCY - armW / 2);
  ctx.lineTo(dpadCX + armL, dpadCY - armW / 2);
  ctx.lineTo(dpadCX + armL, dpadCY + armW / 2);
  ctx.lineTo(dpadCX + armW / 2, dpadCY + armW / 2);
  ctx.lineTo(dpadCX + armW / 2, dpadCY + armL);
  ctx.lineTo(dpadCX - armW / 2, dpadCY + armL);
  ctx.lineTo(dpadCX - armW / 2, dpadCY + armW / 2);
  ctx.lineTo(dpadCX - armL, dpadCY + armW / 2);
  ctx.lineTo(dpadCX - armL, dpadCY - armW / 2);
  ctx.lineTo(dpadCX - armW / 2, dpadCY - armW / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Center circular indentation on GBC D-pad
  ctx.fillStyle = '#161618';
  ctx.beginPath();
  ctx.arc(dpadCX, dpadCY, Math.round(10 * 1.3), 0, Math.PI * 2);
  ctx.fill();

  // Draw subtle tactile directional shapes on arm tips
  ctx.fillStyle = '#141416';
  const arrowSize = Math.round(4 * 1.3);
  
  // Top Arm arrow
  ctx.beginPath();
  ctx.moveTo(dpadCX, dpadCY - armL + Math.round(6 * 1.3));
  ctx.lineTo(dpadCX - arrowSize, dpadCY - armL + Math.round(11 * 1.3));
  ctx.lineTo(dpadCX + arrowSize, dpadCY - armL + Math.round(11 * 1.3));
  ctx.closePath();
  ctx.fill();

  // Bottom Arm arrow
  ctx.beginPath();
  ctx.moveTo(dpadCX, dpadCY + armL - Math.round(6 * 1.3));
  ctx.lineTo(dpadCX - arrowSize, dpadCY + armL - Math.round(11 * 1.3));
  ctx.lineTo(dpadCX + arrowSize, dpadCY + armL - Math.round(11 * 1.3));
  ctx.closePath();
  ctx.fill();

  // Left Arm arrow
  ctx.beginPath();
  ctx.moveTo(dpadCX - armL + Math.round(6 * 1.3), dpadCY);
  ctx.lineTo(dpadCX - armL + Math.round(11 * 1.3), dpadCY - arrowSize);
  ctx.lineTo(dpadCX - armL + Math.round(11 * 1.3), dpadCY + arrowSize);
  ctx.closePath();
  ctx.fill();

  // Right Arm arrow
  ctx.beginPath();
  ctx.moveTo(dpadCX + armL - Math.round(6 * 1.3), dpadCY);
  ctx.lineTo(dpadCX + armL + Math.round(11 * 1.3), dpadCY - arrowSize);
  ctx.lineTo(dpadCX + armL + Math.round(11 * 1.3), dpadCY + arrowSize);
  ctx.closePath();
  ctx.fill();


  // 2. Retro Action A/B Buttons (Right side - angled slant panel) - Scaled 1.3x (40px radius)
  const btnBCX = 530;
  const btnBCY = 1060; // Spaced evenly below the screen lens
  const btnACX = 710;
  const btnACY = 940;
  const btnRadius = Math.round(31 * 1.3); // Exactly 40px radius (beautiful, highly tactile size)

  // Draw recessed pill-shaped plate depression for both buttons
  ctx.save();
  ctx.lineCap = 'round';
  
  const recColor = getButtonBoxColor(params.bezelColor);
  const bordColor = getButtonBoxBorder(params.bezelColor);

  // Draw 3D shadow offset underneath (scaled 1.3x)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.round(101 * 1.3);
  ctx.beginPath();
  ctx.moveTo(btnBCX, btnBCY + Math.round(4 * 1.3));
  ctx.lineTo(btnACX, btnACY + Math.round(4 * 1.3));
  ctx.stroke();

  // Draw physical border of the pill plate
  ctx.strokeStyle = bordColor;
  ctx.lineWidth = Math.round(101 * 1.3);
  ctx.beginPath();
  ctx.moveTo(btnBCX, btnBCY);
  ctx.lineTo(btnACX, btnACY);
  ctx.stroke();

  // Solid fill of the pill plate corresponding to the selected theme style
  ctx.strokeStyle = recColor;
  ctx.lineWidth = Math.round(95 * 1.3);
  ctx.beginPath();
  ctx.moveTo(btnBCX, btnBCY);
  ctx.lineTo(btnACX, btnACY);
  ctx.stroke();
  ctx.restore();

  // Button B (Left)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 4;
  
  let gradB = ctx.createRadialGradient(btnBCX - Math.round(7 * 1.3), btnBCY - Math.round(7 * 1.3), Math.round(3 * 1.3), btnBCX, btnBCY, btnRadius);
  gradB.addColorStop(0, '#be3a6c'); // Bright highlight
  gradB.addColorStop(0.35, '#851b40'); // Core rich GBC plum-crimson
  gradB.addColorStop(1, '#44051a'); // Dark crimson shadow
  ctx.fillStyle = gradB;
  ctx.beginPath();
  ctx.arc(btnBCX, btnBCY, btnRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Button A (Right)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 4;
  
  let gradA = ctx.createRadialGradient(btnACX - Math.round(7 * 1.3), btnACY - Math.round(7 * 1.3), Math.round(3 * 1.3), btnACX, btnACY, btnRadius);
  gradA.addColorStop(0, '#be3a6c'); // Bright highlight
  gradA.addColorStop(0.35, '#851b40'); // Core plum-crimson
  gradA.addColorStop(1, '#44051a'); // Dark crimson shadow
  ctx.fillStyle = gradA;
  ctx.beginPath();
  ctx.arc(btnACX, btnACY, btnRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Letter tags B & A (embossed branding look)
  ctx.fillStyle = '#374151'; // Charcoal gray GBC lettering
  ctx.font = `bold italic ${Math.round(16 * 1.3)}px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('B', btnBCX, btnBCY + btnRadius + Math.round(22 * 1.3));
  ctx.fillText('A', btnACX, btnACY + btnRadius + Math.round(22 * 1.3));


  // 3. Center Select & Start Pill Buttons - Scaled to 1.3x
  const selCX = 345;
  const selCY = 1170; // Moved downward for natural ergonomic placement
  const staCX = 475;
  const staCY = 1170;
  const pillW = Math.round(50 * 1.3);
  const pillH = Math.round(12 * 1.3);

  // Recess depressions for pill buttons
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  
  // Select recess
  ctx.translate(selCX, selCY + Math.round(2 * 1.3));
  ctx.rotate(-Math.PI / 6.5);
  ctx.beginPath();
  ctx.roundRect(-pillW/2, -pillH/2, pillW, pillH, Math.round(6 * 1.3));
  ctx.fill();
  ctx.restore();

  // Start recess
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.translate(staCX, staCY + Math.round(2 * 1.3));
  ctx.rotate(-Math.PI / 6.5);
  ctx.beginPath();
  ctx.roundRect(-pillW/2, -pillH/2, pillW, pillH, Math.round(6 * 1.3));
  ctx.fill();
  ctx.restore();

  // Draw the real rubber grey pill shapes
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#65686c'; // Classic matte grey elastomer rubber

  // Select pill
  ctx.save();
  ctx.translate(selCX, selCY);
  ctx.rotate(-Math.PI / 6.5);
  ctx.beginPath();
  ctx.roundRect(-pillW/2, -pillH/2, pillW, pillH, Math.round(6 * 1.3));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(-pillW/2 + Math.round(1 * 1.3), -pillH/2 + Math.round(1 * 1.3), pillW - Math.round(2 * 1.3), Math.round(2 * 1.3));
  ctx.restore();

  // Start pill
  ctx.save();
  ctx.translate(staCX, staCY);
  ctx.rotate(-Math.PI / 6.5);
  ctx.beginPath();
  ctx.roundRect(-pillW/2, -pillH/2, pillW, pillH, Math.round(6 * 1.3));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(-pillW/2 + Math.round(1 * 1.3), -pillH/2 + Math.round(1 * 1.3), pillW - Math.round(2 * 1.3), Math.round(2 * 1.3));
  ctx.restore();
  ctx.restore();

  // Labels below pills (scaled to 1.3x)
  ctx.fillStyle = '#374151';
  ctx.font = `bold italic ${Math.round(11 * 1.3)}px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SELECT', selCX, selCY + Math.round(24 * 1.3));
  ctx.fillText('START', staCX, staCY + Math.round(24 * 1.3));


  // 4. Authentic GBC Speaker Grill Slits (Lower Right corner slanted slits)
  const grillX = 670;
  const grillY = 1190;
  const slitW = 54;
  const slitH = 8;
  const numSlits = 6;

  ctx.save();
  ctx.translate(grillX, grillY);
  ctx.rotate(-Math.PI / 6.5);
  ctx.fillStyle = '#161618'; // Speaker chamber grill depth

  for (let i = 0; i < numSlits; i++) {
    const sx = i * 16 - (numSlits * 8);
    ctx.beginPath();
    ctx.roundRect(sx, 0, slitH, slitW, 4);
    ctx.fill();
  }
  ctx.restore();
}
