// color-science.js — CIE color science for Cloudflare Workers
// Ported from the Python STMP engine. Same math, same results.

// RGB [0-255] → CIE L*a*b* using D65 white point
export function rgbToLab(r, g, b) {
  // Normalize and inverse sRGB gamma
  const invGamma = (c) => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const rLin = invGamma(r / 255);
  const gLin = invGamma(g / 255);
  const bLin = invGamma(b / 255);
  
  // RGB → XYZ (D65)
  let X = rLin * 0.4124 + gLin * 0.3576 + bLin * 0.1805;
  let Y = rLin * 0.2126 + gLin * 0.7152 + bLin * 0.0722;
  let Z = rLin * 0.0193 + gLin * 0.1192 + bLin * 0.9505;
  
  // Normalize by D65 white point
  X = X / 0.95047;
  Y = Y / 1.00000;
  Z = Z / 1.08883;
  
  // XYZ → Lab
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);
  
  return [Math.round(L * 100) / 100, Math.round(a * 100) / 100, Math.round(bLab * 100) / 100];
}

// CIE L*a*b* → RGB [0-255] with gamma correction (D65)
export function labToRgb(lab) {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const invF = (t) => Math.pow(t, 3) > 0.008856 ? Math.pow(t, 3) : (t - 16/116) / 7.787;
  const X = invF(fx) * 95.047, Y = invF(fy) * 100.0, Z = invF(fz) * 108.883;
  
  let R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let B = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
  
  const gamma = (c) => c > 0.0031308 ? 1.055 * Math.pow(c, 1/2.4) - 0.055 : 12.92 * c;
  R = Math.max(0, Math.min(255, Math.round(gamma(R/100) * 255)));
  G = Math.max(0, Math.min(255, Math.round(gamma(G/100) * 255)));
  B = Math.max(0, Math.min(255, Math.round(gamma(B/100) * 255)));
  return [R, G, B];
}

// CIE Delta E 2000 (full implementation)
export function deltaE(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  
  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1*a1 + b1*b1);
  const C2 = Math.sqrt(a2*a2 + b2*b2);
  const avgC = (C1 + C2) / 2;
  
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  
  const C1p = Math.sqrt(a1p*a1p + b1*b1);
  const C2p = Math.sqrt(a2p*a2p + b2*b2);
  const avgCp = (C1p + C2p) / 2;
  
  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  if (h2p < 0) h2p += 360;
  
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  
  let dhp;
  if (Math.abs(h1p - h2p) <= 180) dhp = h2p - h1p;
  else if (h2p <= h1p) dhp = h2p - h1p + 360;
  else dhp = h2p - h1p - 360;
  
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * Math.PI / 180);
  
  let avgHp;
  if (Math.abs(h1p - h2p) > 180) {
    if (h1p + h2p < 360) avgHp = (h1p + h2p + 360) / 2;
    else avgHp = (h1p + h2p - 360) / 2;
  } else {
    avgHp = (h1p + h2p) / 2;
  }
  
  const T = 1 - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180)
            + 0.24 * Math.cos((2 * avgHp) * Math.PI / 180)
            + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180)
            - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  
  const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const RT = -Math.sin((2 * dTheta) * Math.PI / 180) * RC;
  
  const dE = Math.sqrt(
    Math.pow(dLp / SL, 2) +
    Math.pow(dCp / SC, 2) +
    Math.pow(dHp / SH, 2) +
    RT * (dCp / SC) * (dHp / SH)
  );
  
  return Math.round(dE * 100) / 100;
}

// Detect undertone from L*a*b*
export function detectUndertone(lab) {
  const [, a, b] = lab;
  if (a < 1.5 && b < 11) return 'cool';
  if (a > 6 && b > 18) return 'warm';
  if (Math.abs(a) < 3 && b > 10 && b < 18) return 'olive';
  return 'neutral';
}

// Map L* to human-readable lightness label
export function lightnessLabel(L) {
  if (L >= 78) return 'very light';
  if (L >= 68) return 'light';
  if (L >= 58) return 'medium';
  if (L >= 48) return 'deep';
  return 'very deep';
}

// Lighting correction offsets
export const LIGHTING_CORRECTION = {
  natural:     { L: 0,  a: 0,  b: 0 },
  fluorescent: { L: 1.5, a: -0.8, b: -3.0 },
  warm_indoor: { L: -1.5, a: 1.0, b: 3.5 },
  cool_indoor: { L: 1.0, a: -1.0, b: -2.0 },
  outdoor_sun: { L: -0.8, a: 0.5, b: 1.5 },
};

export function applyLightingCorrection(lab, lighting) {
  const c = LIGHTING_CORRECTION[lighting] || LIGHTING_CORRECTION.natural;
  return [
    Math.round((lab[0] - c.L) * 100) / 100,
    Math.round((lab[1] - c.a) * 100) / 100,
    Math.round((lab[2] - c.b) * 100) / 100,
  ];
}
