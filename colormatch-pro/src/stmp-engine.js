// stmp-engine.js — Skin Tone Memory Profile engine for Cloudflare Workers
// Patent-pending: seasonal drift, multi-zone authority, confidence decay
// Storage: Cloudflare KV (persistent across edge requests)

// Seasonal drift — how average skin tone shifts per season (L*a*b* additive)
export const SEASONAL_DRIFT = {
  spring: { L: -0.5, a: 0.3,  b: 0.8 },
  summer: { L: -2.8, a: 0.5,  b: 2.6 },
  fall:   { L: -0.3, a: 0.2,  b: 1.2 },
  winter: { L: 2.5,  a: -0.4, b: -2.0 },
};

// Multi-zone authority weights (patent core)
export const ZONE_WEIGHTS = {
  forehead:    { L: 0.40, a: 0.25, b: 0.25 },
  left_cheek:   { L: 0.30, a: 0.30, b: 0.30 },
  right_cheek:  { L: 0.30, a: 0.30, b: 0.30 },
  wrist:        { L: 0.10, a: 0.50, b: 0.50 },
  jaw:          { L: 0.20, a: 0.35, b: 0.35 },
  center:       { L: 0.33, a: 0.33, b: 0.33 },
};

const STALENESS_DAYS = 60;
const MAX_PROFILE_SCANS = 200;

// Get current season from month + latitude
export function getSeason(lat = null, month = null) {
  if (month === null) month = new Date().getUTCMonth() + 1;
  const seasons = {
    winter: [12, 1, 2], spring: [3, 4, 5],
    summer: [6, 7, 8], fall: [9, 10, 11]
  };
  let result = 'winter';
  for (const [s, months] of Object.entries(seasons)) {
    if (months.includes(month)) { result = s; break; }
  }
  if (lat !== null && lat < 0) {
    const flip = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' };
    return flip[result];
  }
  return result;
}

// Weighted blend of multiple skin zones (patent core)
export function blendMultizone(zones) {
  if (!zones || Object.keys(zones).length === 0) return [50, 5, 15];
  const blended = [0, 0, 0];
  const totalWeight = [0, 0, 0];
  for (const [zoneName, lab] of Object.entries(zones)) {
    const w = ZONE_WEIGHTS[zoneName] || ZONE_WEIGHTS.center;
    blended[0] += lab[0] * w.L; totalWeight[0] += w.L;
    blended[1] += lab[1] * w.a; totalWeight[1] += w.a;
    blended[2] += lab[2] * w.b; totalWeight[2] += w.b;
  }
  return [
    Math.round(blended[0] / totalWeight[0] * 100) / 100,
    Math.round(blended[1] / totalWeight[1] * 100) / 100,
    Math.round(blended[2] / totalWeight[2] * 100) / 100,
  ];
}

// STMP Profile — stored in Cloudflare KV
export class STMPProfile {
  constructor(kv, userId) {
    this.kv = kv;
    this.userId = userId;
    this.data = { scans: [], saved_shades: [] };
  }

  async load() {
    if (!this.kv) return this.data;
    try {
      const raw = await this.kv.get(`stmp:${this.userId}`);
      if (raw) this.data = JSON.parse(raw);
      if (!this.data.scans) this.data.scans = [];
      if (!this.data.saved_shades) this.data.saved_shades = [];
    } catch (e) { /* fresh profile */ }
    return this.data;
  }

  async save() {
    if (!this.kv) return;
    await this.kv.put(`stmp:${this.userId}`, JSON.stringify(this.data));
  }

  // opts: { confidence 0..100, confirmed bool, white_balanced bool,
  //         photos int, lighting_issues [codes] }
  // A scan is only trustworthy when the user CONFIRMED the matches it
  // produced. Unconfirmed scans (old behavior) are stored with
  // confirmed:false so the profile can tell them apart.
  async addScan(lab, undertone, zone = 'center', lighting = 'natural', lat = null, opts = {}) {
    const season = getSeason(lat);
    this.data.scans.push({
      timestamp: new Date().toISOString(),
      lab, undertone, zone, lighting, season,
      confidence: opts.confidence ?? null,
      confirmed: opts.confirmed === true,
      white_balanced: opts.white_balanced === true,
      photos: opts.photos ?? 1,
      lighting_issues: opts.lighting_issues || [],
    });
    if (this.data.scans.length > MAX_PROFILE_SCANS) {
      this.data.scans = this.data.scans.slice(-MAX_PROFILE_SCANS);
    }
    await this.save();
  }

  async addShadeMatch(shadeId, purchased = false) {
    if (!this.data.saved_shades) this.data.saved_shades = [];
    const exists = this.data.saved_shades.some(s => s.shade_id === shadeId);
    if (!exists) {
      this.data.saved_shades.push({ shade_id: shadeId, saved_at: new Date().toISOString(), purchased });
      await this.save();
    }
  }

  getCurrentLab() {
    const all = this.data.scans || [];
    if (all.length === 0) {
      return { lab: null, undertone: null, confidence: 0, stale: true, days_since: null, total_scans: 0, season: null };
    }
    // Prefer CONFIRMED scans (user checked the matches) when any exist;
    // unconfirmed scans only count until the first confirmation lands.
    const confirmed = all.filter((s) => s.confirmed === true);
    const scans = confirmed.length > 0 ? confirmed : all;
    const recent = scans.slice(-10);
    const now = Date.now();
    let weighted = [0, 0, 0], totalW = 0;
    for (const scan of recent) {
      const daysAgo = Math.floor((now - new Date(scan.timestamp).getTime()) / 86400000);
      const w = daysAgo <= 7 ? 3 : daysAgo <= 30 ? 2 : 1;
      weighted[0] += scan.lab[0] * w;
      weighted[1] += scan.lab[1] * w;
      weighted[2] += scan.lab[2] * w;
      totalW += w;
    }
    const avgLab = [Math.round(weighted[0]/totalW*100)/100, Math.round(weighted[1]/totalW*100)/100, Math.round(weighted[2]/totalW*100)/100];
    const lastScan = scans[scans.length - 1];
    const daysSince = Math.floor((now - new Date(lastScan.timestamp).getTime()) / 86400000);
    const confidence = daysSince >= STALENESS_DAYS ? 0 : Math.round((1 - daysSince / STALENESS_DAYS) * 100) / 100;
    return {
      lab: avgLab,
      undertone: null, // set by caller using detectUndertone
      confidence,
      stale: daysSince >= STALENESS_DAYS,
      days_since: daysSince,
      total_scans: scans.length,
      season: lastScan.season,
    };
  }

  predictSeasonal(targetSeason) {
    const current = this.getCurrentLab();
    if (!current.lab) return { error: 'No scan data yet' };
    const currentSeason = current.season || getSeason();
    const currentDrift = SEASONAL_DRIFT[currentSeason] || { L: 0, a: 0, b: 0 };
    const neutral = [
      current.lab[0] - currentDrift.L,
      current.lab[1] - currentDrift.a,
      current.lab[2] - currentDrift.b,
    ];
    const targetDrift = SEASONAL_DRIFT[targetSeason] || { L: 0, a: 0, b: 0 };
    const predicted = [
      Math.round((neutral[0] + targetDrift.L) * 100) / 100,
      Math.round((neutral[1] + targetDrift.a) * 100) / 100,
      Math.round((neutral[2] + targetDrift.b) * 100) / 100,
    ];
    return {
      season: targetSeason,
      predicted_lab: predicted,
      predicted_undertone: null, // set by caller
    };
  }

  getHistorySummary() {
    const scans = this.data.scans || [];
    if (scans.length === 0) {
      return { total_scans: 0, confidence: 0, days_since_last: null, current_lab: null, saved_shades: [] };
    }
    const current = this.getCurrentLab();
    const seasonal = {};
    for (const scan of scans) {
      const s = scan.season || 'unknown';
      if (!seasonal[s]) seasonal[s] = [];
      seasonal[s].push(scan.lab);
    }
    const seasonalAvg = {};
    for (const [s, labs] of Object.entries(seasonal)) {
      seasonalAvg[s] = {
        lab: [
          Math.round(labs.reduce((a, l) => a + l[0], 0) / labs.length * 100) / 100,
          Math.round(labs.reduce((a, l) => a + l[1], 0) / labs.length * 100) / 100,
          Math.round(labs.reduce((a, l) => a + l[2], 0) / labs.length * 100) / 100,
        ],
        count: labs.length,
      };
    }
    return {
      total_scans: scans.length,
      confidence: current.confidence,
      days_since_last: current.days_since,
      current_lab: current.lab,
      seasonal_averages: seasonalAvg,
      saved_shades: this.data.saved_shades || [],
    };
  }
}
