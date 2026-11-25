// index.js — ColorMatch Pro v4 Cloudflare Worker
// The most comprehensive color matching engine on the edge.
// Categories: foundation, concealer, lipstick, blush, eyeshadow, highlighter,
// bronzer, primer, mascara, eyebrow, setting_spray, nail_polish, cologne, skincare

import { rgbToLab, labToRgb, deltaE, detectUndertone, lightnessLabel, applyLightingCorrection } from './color-science.js';
import { STMPProfile, getSeason } from './stmp-engine.js';
import { getAffiliateUrl } from './affiliate.js';

// ─── Database Imports ───
import { FOUNDATIONS, FOUNDATIONS_BRANDS } from './foundations.js';
import { CONCEALERS, CONCEALERS_BRANDS } from './concealers.js';
import { LIPSTICKS, LIPSTICKS_BRANDS } from './lipsticks.js';
import { BLUSH, BLUSH_BRANDS } from './blush.js';
import { EYESHADOW, EYESHADOW_BRANDS } from './eyeshadow.js';
import { HIGHLIGHTER, HIGHLIGHTER_BRANDS } from './highlighter.js';
import { BRONZER, BRONZER_BRANDS } from './bronzer.js';
import { PRIMER, PRIMER_BRANDS } from './primer.js';
import { MASCARA, MASCARA_BRANDS } from './mascara.js';
import { EYEBROW, EYEBROW_BRANDS } from './eyebrow.js';
import { SETTING_SPRAY, SETTING_SPRAY_BRANDS } from './setting-spray.js';
import { NAIL_POLISH, NAIL_POLISH_BRANDS } from './nail-polish.js';
import { COLOGNE, COLOGNE_BRANDS, calculateNoteSimilarity } from './cologne.js';
import { SKINCARE, SKINCARE_BRANDS } from './skincare.js';
import { STORES, STORE_BRAND_MAP } from './stores.js';
import { BRAND_LOGOS } from './brands.js';

// ─── Combined Databases ───
const MAKEUP_SHADES = [
  ...FOUNDATIONS, ...CONCEALERS, ...LIPSTICKS, ...BLUSH, ...EYESHADOW,
  ...HIGHLIGHTER, ...BRONZER, ...PRIMER, ...MASCARA, ...EYEBROW,
  ...SETTING_SPRAY, ...NAIL_POLISH,
];

const ALL_MAKEUP_BRANDS = [
  ...FOUNDATIONS_BRANDS, ...CONCEALERS_BRANDS, ...LIPSTICKS_BRANDS, ...BLUSH_BRANDS,
  ...EYESHADOW_BRANDS, ...HIGHLIGHTER_BRANDS, ...BRONZER_BRANDS, ...PRIMER_BRANDS,
  ...MASCARA_BRANDS, ...EYEBROW_BRANDS, ...SETTING_SPRAY_BRANDS, ...NAIL_POLISH_BRANDS,
];

// ─── Brand quality tiers — from real average shade prices in this database ───
// drugstore avg < $20 · prestige $20–45 · luxury > $45
const BRAND_TIER = (() => {
  const agg = {};
  for (const s of MAKEUP_SHADES) {
    if (!agg[s.brand]) agg[s.brand] = { sum: 0, n: 0 };
    agg[s.brand].sum += s.price || 0; agg[s.brand].n++;
  }
  const out = {};
  for (const [b, a] of Object.entries(agg)) {
    const avg = a.n ? a.sum / a.n : 0;
    out[b] = { avg: Math.round(avg * 100) / 100, tier: avg < 20 ? 'drugstore' : avg < 45 ? 'prestige' : 'luxury' };
  }
  return out;
})();
const TIER_RANK = { drugstore: 0, prestige: 1, luxury: 2 };

const CATEGORIES = [
  { id: 'foundation', name: 'Foundation', count: FOUNDATIONS.length, icon: '🎨' },
  { id: 'concealer', name: 'Concealer', count: CONCEALERS.length, icon: '✨' },
  { id: 'lipstick', name: 'Lipstick', count: LIPSTICKS.length, icon: '💄' },
  { id: 'blush', name: 'Blush', count: BLUSH.length, icon: '🌸' },
  { id: 'eyeshadow', name: 'Eyeshadow', count: EYESHADOW.length, icon: '👁️' },
  { id: 'highlighter', name: 'Highlighter', count: HIGHLIGHTER.length, icon: '✨' },
  { id: 'bronzer', name: 'Bronzer', count: BRONZER.length, icon: '☀️' },
  { id: 'primer', name: 'Primer', count: PRIMER.length, icon: '🛡️' },
  { id: 'mascara', name: 'Mascara', count: MASCARA.length, icon: '👁️' },
  { id: 'eyebrow', name: 'Eyebrow', count: EYEBROW.length, icon: '✏️' },
  { id: 'setting_spray', name: 'Setting Spray', count: SETTING_SPRAY.length, icon: '💦' },
  { id: 'nail_polish', name: 'Nail Polish', count: NAIL_POLISH.length, icon: '💅' },
  { id: 'cologne', name: 'Cologne', count: COLOGNE.length, icon: '🎯' },
  { id: 'skincare', name: 'Skincare', count: SKINCARE.length, icon: '🧴' },
];

// ─── Match Engine ───

function undertoneCompatible(userUt, shadeUt) {
  if (userUt === 'neutral') return ['neutral', 'warm', 'cool'].includes(shadeUt);
  if (userUt === 'warm') return ['warm', 'neutral'].includes(shadeUt);
  if (userUt === 'olive') return ['warm', 'neutral', 'olive'].includes(shadeUt);
  return ['cool', 'neutral'].includes(shadeUt);
}

function findMatches(userLab, userUndertone, prefs, database, maxResults = 12) {
  const runMatch = (filterFn) => {
    const results = [];
    for (const shade of database) {
      if (filterFn && !filterFn(userUndertone, shade.undertone)) continue;
      if (prefs.price_max && prefs.price_max > 0 && shade.price > prefs.price_max) continue;
      if (prefs.coverage && prefs.coverage !== 'any' && shade.coverage !== prefs.coverage) continue;
      if (prefs.finish && prefs.finish !== 'any' && shade.finish !== prefs.finish) continue;
      if (prefs.brands && prefs.brands.length > 0 && !prefs.brands.includes(shade.brand)) continue;
      const de = deltaE(userLab, shade.lab);
      if (de < 6.0) results.push({ ...shade, delta_e: de });
    }
    results.sort((a, b) => a.delta_e - b.delta_e);
    return results.slice(0, maxResults);
  };

  let results = runMatch(undertoneCompatible);
  if (results.length < 3) {
    const relaxed = (u, s) => undertoneCompatible(u, s) || s === 'neutral';
    const relaxedResults = runMatch(relaxed);
    if (relaxedResults.length > results.length) results = relaxedResults;
  }
  return results;
}

function formatMatch(m) {
  return {
    id: m.id, brand: m.brand, product: m.product, shade: m.shade,
    category: m.category || 'foundation',
    lab: m.lab, rgb: labToRgb(m.lab),
    undertone: m.undertone || 'neutral',
    coverage: m.coverage, formula: m.formula, finish: m.finish,
    price: m.price, url: m.url,
    affiliate_url: getAffiliateUrl(m),
    delta_e: m.delta_e || 0,
    logo: BRAND_LOGOS[m.brand] || null,
    brand_tier: (BRAND_TIER[m.brand] || {}).tier || null,
    tier3_why: m.tier3_why || null,
  };
}

// ─── Dupe Finder ───

function findDupes(shadeId, allShades) {
  const original = allShades.find(s => s.id === shadeId);
  if (!original) return [];

  const sameCategory = allShades.filter(s =>
    s.id !== shadeId &&
    s.category === original.category &&
    s.price < original.price * 0.6
  );

  const dupes = [];
  for (const shade of sameCategory) {
    const de = deltaE(original.lab, shade.lab);
    if (de < 5.0) {
      dupes.push({
        ...shade,
        delta_e: de,
        original_price: original.price,
        savings: Math.round((1 - shade.price / original.price) * 100),
      });
    }
  }

  dupes.sort((a, b) => a.delta_e - b.delta_e);
  return dupes.slice(0, 8);
}

// ─── Store Locator ───

function findNearbyStores(lat, lng, radius = 50) {
  // If stores have GPS coordinates, calculate distance; otherwise return all
  const hasCoords = STORES.some(s => s.locations && s.locations.length > 0);
  if (!hasCoords) {
    // Return all stores with their store locator URLs for the user to find nearest
    return STORES.map(s => ({ ...s, distance: null, use_locator: true }));
  }
  const R = 6371;
  return STORES.map(store => {
    if (!store.locations) return { ...store, distance: null };
    let minDist = Infinity;
    for (const loc of store.locations) {
      const dLat = (loc.lat - lat) * Math.PI / 180;
      const dLng = (loc.lng - lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180) * Math.cos(loc.lat*Math.PI/180) * Math.sin(dLng/2)**2;
      const d = 2 * R * Math.asin(Math.sqrt(a));
      minDist = Math.min(minDist, d);
    }
    return { ...store, distance: minDist <= radius ? Math.round(minDist * 10) / 10 : null };
  }).filter(s => s.distance !== null).sort((a, b) => a.distance - b.distance);
}

// ─── JSON Response Helper ───

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ─── Main Worker ───

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const kv = env?.STMP_KV || null;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }});
    }

    // ── API Routes ──
    if (path.startsWith('/api/')) {
      try {
        // GET /api/health
        if (path === '/api/health' && method === 'GET') {
          return json({
            status: 'ok',
            total_shades: MAKEUP_SHADES.length + COLOGNE.length + SKINCARE.length,
            makeup_shades: MAKEUP_SHADES.length,
            cologne_count: COLOGNE.length,
            skincare_count: SKINCARE.length,
            brand_count: new Set(ALL_MAKEUP_BRANDS.map(b => b.name)).size,
            categories: CATEGORIES.length,
            version: '4.1.0',
            lighting_fix: true,
          });
        }

        // GET /api/brands
        if (path === '/api/brands' && method === 'GET') {
          const unique = {};
          for (const b of ALL_MAKEUP_BRANDS) {
            if (!unique[b.name]) unique[b.name] = b;
            else {
              unique[b.name].shade_count += b.shade_count;
              unique[b.name].price_min = Math.min(unique[b.name].price_min, b.price_min);
              unique[b.name].price_max = Math.max(unique[b.name].price_max, b.price_max);
            }
          }
          return json({ brands: Object.values(unique).sort((a,b) => a.name.localeCompare(b.name)), total: Object.keys(unique).length });
        }

        // GET /api/brands/logos
        if (path === '/api/brands/logos' && method === 'GET') {
          return json({ logos: BRAND_LOGOS });
        }

        // GET /api/categories
        if (path === '/api/categories' && method === 'GET') {
          return json({ categories: CATEGORIES, total: CATEGORIES.length });
        }

        // GET /api/shades
        if (path === '/api/shades' && method === 'GET') {
          const category = url.searchParams.get('category');
          const brand = url.searchParams.get('brand');
          const undertone = url.searchParams.get('undertone');
          const coverage = url.searchParams.get('coverage');
          const finish = url.searchParams.get('finish');
          const priceMax = url.searchParams.get('price_max');
          let results = MAKEUP_SHADES;
          if (category) results = results.filter(s => s.category === category);
          if (brand) results = results.filter(s => s.brand === brand);
          if (undertone) results = results.filter(s => s.undertone === undertone);
          if (coverage) results = results.filter(s => s.coverage === coverage);
          if (finish) results = results.filter(s => s.finish === finish);
          if (priceMax && parseFloat(priceMax) > 0) results = results.filter(s => s.price <= parseFloat(priceMax));
          return json({ shades: results.map(s => formatMatch({ ...s, delta_e: 0 })), total: results.length });
        }

        // POST /api/analyze
        // LIGHTING FIX (v4.1.0): analyzing does NOT save to STMP anymore.
        // The client runs the lighting check + smart sampling + multi-photo
        // averaging FIRST, sends the corrected lab + a confidence score, and
        // only saves to the profile after the shopper CONFIRMS the matches
        // (POST /api/profile/:userId/confirm-scan). Pass save_stmp:true to
        // keep the old auto-save behavior (e.g. server-side callers).
        // Matching math is untouched — only the input path changed.
        if (path === '/api/analyze' && method === 'POST') {
          const body = await request.json();
          if (!body || !body.lab) return json({ error: 'No lab values provided' }, 400);
          const { lab, lighting = 'natural', prefs = {}, user_id, lat, lng } = body;
          const userId = user_id || `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

          const corrected = applyLightingCorrection(lab, lighting);
          const undertone = detectUndertone(corrected);
          const season = getSeason(lat);

          // Input quality, measured by the client before sending (see
          // lighting-core.js). Echoed back so the UI can show it honestly.
          const input = {
            confidence: typeof body.confidence === 'number' ? body.confidence : null,
            lighting_score: body.lighting_report?.score ?? null,
            lighting_issues: (body.lighting_report?.issues || []).map((i) => i.code),
            photos_used: body.photos_used || 1,
            white_balanced: body.white_balanced === true,
            saved_to_stmp: body.save_stmp === true,
          };

          const profile = new STMPProfile(kv, userId);
          await profile.load();
          if (body.save_stmp === true) {
            await profile.addScan(corrected, undertone, 'client', lighting, lat, {
              confidence: input.confidence, confirmed: false,
              white_balanced: input.white_balanced, photos: input.photos_used,
              lighting_issues: input.lighting_issues,
            });
          }
          const current = profile.getCurrentLab();
          current.undertone = detectUndertone(current.lab || corrected);

          const cat = prefs.category || 'foundation';
          const matchDb = MAKEUP_SHADES.filter(s => s.category === cat);
          const matches = findMatches(corrected, undertone, prefs, matchDb, 12);

          // Also find dupes for the top match
          let dupes = [];
          if (matches.length > 0 && matches[0].price > 15) {
            dupes = findDupes(matches[0].id, MAKEUP_SHADES);
          }

          return json({
            user_id: userId,
            analysis: {
              lab: corrected,
              rgb: labToRgb(corrected),
              undertone,
              lightness: lightnessLabel(corrected[0]),
              lighting_used: lighting,
              season,
            },
            input,
            stmp: {
              confidence: current.confidence,
              total_scans: current.total_scans,
              stale: current.stale,
              days_since: current.days_since,
            },
            matches: matches.map(formatMatch),
            dupes: dupes.map(d => formatMatch(d)),
            total: matches.length,
            nearby_stores: (lat && lng) ? findNearbyStores(lat, lng).slice(0, 5) : null,
          });
        }

        // POST /api/skin-health
        if (path === '/api/skin-health' && method === 'POST') {
          const body = await request.json();
          if (!body || !body.skinData) return json({ error: 'No skin analysis data' }, 400);
          const { skinData } = body;
          // skinData comes from client-side canvas analysis
          // { redness, darkness, brightness, saturation, texture, zones: {tZone, cheeks, forehead, jaw} }

          const issues = [];
          const recommendations = [];

          if (skinData.redness > 0.3) {
            issues.push({ type: 'redness', severity: Math.min(5, Math.round(skinData.redness * 5)), label: 'Redness detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('redness')).slice(0, 3));
          }
          if (skinData.darkness > 0.2) {
            issues.push({ type: 'dark-spots', severity: Math.min(5, Math.round(skinData.darkness * 5)), label: 'Dark spots detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('dark-spots')).slice(0, 3));
          }
          if (skinData.texture > 0.3) {
            issues.push({ type: 'aging', severity: Math.min(5, Math.round(skinData.texture * 5)), label: 'Texture/aging signs' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('aging')).slice(0, 3));
          }
          if (skinData.oiliness > 0.5) {
            issues.push({ type: 'oiliness', severity: Math.min(5, Math.round(skinData.oiliness * 5)), label: 'Oily skin detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('oiliness')).slice(0, 3));
          }
          if (skinData.dryness > 0.5) {
            issues.push({ type: 'dryness', severity: Math.min(5, Math.round(skinData.dryness * 5)), label: 'Dry skin detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('dryness')).slice(0, 3));
          }
          if (skinData.acneScore > 0.25) {
            issues.push({ type: 'acne', severity: Math.min(5, Math.round(skinData.acneScore * 5)), label: 'Acne/breakouts detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('acne')).slice(0, 5));
          }
          if (skinData.dullness > 0.4) {
            issues.push({ type: 'dullness', severity: Math.min(5, Math.round(skinData.dullness * 5)), label: 'Dull skin detected' });
            recommendations.push(...SKINCARE.filter(p => p.concerns?.includes('dullness')).slice(0, 3));
          }

          // Skin type classification
          let skinType = 'normal';
          if (skinData.oiliness > 0.6 && skinData.dryness < 0.3) skinType = 'oily';
          else if (skinData.dryness > 0.6 && skinData.oiliness < 0.3) skinType = 'dry';
          else if (skinData.oiliness > 0.4 && skinData.dryness > 0.4) skinType = 'combination';
          else if (skinData.redness > 0.4) skinType = 'sensitive';

          // Filter recommendations by skin type
          const typedRecs = recommendations.length > 0
            ? recommendations.filter(r => !r.skin_types || r.skin_types.includes(skinType) || r.skin_types.includes('all'))
            : [];
          const finalRecs = typedRecs.length > 0 ? typedRecs : recommendations;

          // Deduplicate
          const seen = new Set();
          const uniqueRecs = finalRecs.filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          }).slice(0, 8);

          return json({
            skin_type: skinType,
            issues,
            health_score: Math.max(0, Math.round((1 - (issues.reduce((a, i) => a + i.severity, 0) / 25)) * 100)),
            recommendations: uniqueRecs.map(r => ({
              ...r,
              logo: BRAND_LOGOS[r.brand] || null,
              affiliate_url: getAffiliateUrl({ url: r.url, brand: r.brand }),
            })),
            total_issues: issues.length,
          });
        }

        // POST /api/equivalent — 3 tiers + cross-store filter
        // Tiers: Exact (dE<1, same shade different brand) / Closest (1<=dE<3) /
        // Better (dE<5, blended: your undertone, step-up brand tier, better price, different finish).
        // body.store = store name (e.g. "Target") — limits results to brands that store carries.
        // body.user_undertone = the user's scanned undertone, for the "better" tier.
        if (path === '/api/equivalent' && method === 'POST') {
          const body = await request.json();
          if (!body || !body.shade_id) return json({ error: 'No shade_id' }, 400);
          const ref = MAKEUP_SHADES.find(s => s.id === body.shade_id);
          if (!ref) return json({ error: `Shade '${body.shade_id}' not found` }, 404);
          const userUt = body.user_undertone || null;
          let storeBrands = null, storeName = null;
          if (body.store) {
            const st = STORES.find(s => s.name.toLowerCase() === String(body.store).toLowerCase());
            if (st) { storeBrands = new Set(st.carries_brands); storeName = st.name; }
          }
          const others = MAKEUP_SHADES.filter(s => s.id !== body.shade_id && s.category === ref.category && (!storeBrands || storeBrands.has(s.brand)));
          // Wide color pool — distance only, no undertone gate (tiers sort it out)
          const pool = [];
          for (const shade of others) {
            if (body.prefs && body.prefs.price_max && shade.price > body.prefs.price_max) continue;
            if (body.prefs && body.prefs.brands && body.prefs.brands.length > 0 && !body.prefs.brands.includes(shade.brand)) continue;
            const de = deltaE(ref.lab, shade.lab);
            if (de < 6.0) pool.push({ ...shade, delta_e: de });
          }
          pool.sort((a, b) => a.delta_e - b.delta_e);
          const inTier = (m, arr) => arr.some(x => x.id === m.id);
          const t1 = pool.filter(m => m.delta_e < 1.0).slice(0, 4);
          const t2 = pool.filter(m => m.delta_e >= 1.0 && m.delta_e < 3.0).slice(0, 3);
          // Tier 3 "better": a better fit for YOUR skin, a step up in brand, or both.
          const refTier = (BRAND_TIER[ref.brand] || {}).tier || 'prestige';
          const refRank = TIER_RANK[refTier];
          const t3 = [];
          const pushT3 = (list, whyFn) => {
            for (const m of list) {
              if (t3.length >= 3) break;
              if (inTier(m, t1) || inTier(m, t2) || inTier(m, t3)) continue;
              t3.push({ ...m, tier3_why: whyFn(m) });
            }
          };
          // A. Your undertone — the shade you wear isn't your undertone
          if (userUt && ref.undertone && ref.undertone !== userUt) {
            pushT3(pool.filter(m => m.delta_e < 5.0 && m.undertone === userUt), m => `Your undertone (${userUt}) — same color, a better fit for your skin.`);
          }
          // B. Step up in brand — a higher-tier brand than the one you wear
          pushT3(pool.filter(m => m.delta_e < 5.0 && (BRAND_TIER[m.brand] || {}).tier && TIER_RANK[(BRAND_TIER[m.brand] || {}).tier] > refRank), m => `Step up — ${m.brand} is ${(BRAND_TIER[m.brand] || {}).tier}, a tier above ${ref.brand}.`);
          // C. Better price
          pushT3(pool.filter(m => m.delta_e < 5.0 && m.price < ref.price), () => 'Same color family — and an easier price than your shade.');
          // D. Different finish
          pushT3(pool.filter(m => m.delta_e < 5.0 && m.finish && ref.finish && m.finish !== ref.finish), m => `Same color — try a ${m.finish} finish instead of ${ref.finish}.`);
          const t3why = t3.length ? 'Not just a dupe — a better fit for your skin, a better brand, or both.' : '';
          const flat = [...t1, ...t2, ...t3];
          return json({
            reference: formatMatch({ ...ref, delta_e: 0 }),
            equivalents: flat.map(formatMatch),
            tiers: { exact: t1.map(formatMatch), closest: t2.map(formatMatch), better: t3.map(formatMatch), better_why: t3why },
            store: storeName,
            total: flat.length,
          });
        }

        // GET /api/dupes/:shadeId
        const dupeMatch = path.match(/^\/api\/dupes\/(.+)$/);
        if (dupeMatch && method === 'GET') {
          const shadeId = decodeURIComponent(dupeMatch[1]);
          const dupes = findDupes(shadeId, MAKEUP_SHADES);
          return json({
            original: formatMatch(MAKEUP_SHADES.find(s => s.id === shadeId) || {}),
            dupes: dupes.map(d => formatMatch(d)),
            total: dupes.length,
          });
        }

        // POST /api/dupes
        if (path === '/api/dupes' && method === 'POST') {
          const body = await request.json();
          if (!body || !body.shade_id) return json({ error: 'No shade_id' }, 400);
          const dupes = findDupes(body.shade_id, MAKEUP_SHADES);
          const original = MAKEUP_SHADES.find(s => s.id === body.shade_id);
          return json({
            original: original ? formatMatch({ ...original, delta_e: 0 }) : null,
            dupes: dupes.map(d => formatMatch(d)),
            total: dupes.length,
          });
        }

        // GET /api/stores
        if (path === '/api/stores' && method === 'GET') {
          return json({ stores: STORES, total: STORES.length });
        }

        // GET /api/stores/nearby
        if (path === '/api/stores/nearby' && method === 'GET') {
          const lat = parseFloat(url.searchParams.get('lat'));
          const lng = parseFloat(url.searchParams.get('lng'));
          const radius = parseFloat(url.searchParams.get('radius') || '50');
          if (isNaN(lat) || isNaN(lng)) return json({ error: 'Need lat and lng params' }, 400);
          const nearby = findNearbyStores(lat, lng, radius);
          return json({ stores: nearby, total: nearby.length });
        }

        // GET /api/stores/for-brand/:brandName
        const storeBrandMatch = path.match(/^\/api\/stores\/for-brand\/(.+)$/);
        if (storeBrandMatch && method === 'GET') {
          const brandName = decodeURIComponent(storeBrandMatch[1]);
          const stores = STORES.filter(s => s.carries_brands?.includes(brandName));
          return json({ brand: brandName, stores, total: stores.length });
        }

        // GET /api/cologne
        if (path === '/api/cologne' && method === 'GET') {
          const brand = url.searchParams.get('brand');
          const occasion = url.searchParams.get('occasion');
          const season = url.searchParams.get('season');
          const gender = url.searchParams.get('gender');
          let results = COLOGNE;
          if (brand) results = results.filter(c => c.brand === brand);
          if (occasion) results = results.filter(c => c.occasion === occasion);
          if (season) results = results.filter(c => c.season?.includes(season));
          if (gender) results = results.filter(c => c.gender === gender || c.gender === 'unisex');
          return json({ colognes: results, total: results.length });
        }

        // POST /api/cologne/match
        if (path === '/api/cologne/match' && method === 'POST') {
          const body = await request.json();
          if (!body || !body.notes) return json({ error: 'No notes provided' }, 400);
          const userNotes = body.notes;
          const maxResults = body.max_results || 10;

          const matches = COLOGNE.map(c => {
            const allNotes = [...(c.top || []), ...(c.heart || []), ...(c.base || [])];
            const similarity = calculateNoteSimilarity(userNotes, allNotes);
            return { ...c, similarity, logo: BRAND_LOGOS[c.brand] || null };
          }).filter(c => c.similarity > 0.15)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);

          return json({ matches, total: matches.length });
        }

        // GET /api/cologne/dupes/:id
        const cologneDupeMatch = path.match(/^\/api\/cologne\/dupes\/(.+)$/);
        if (cologneDupeMatch && method === 'GET') {
          const cologneId = decodeURIComponent(cologneDupeMatch[1]);
          const original = COLOGNE.find(c => c.id === cologneId);
          if (!original) return json({ error: 'Cologne not found' }, 404);

          const origNotes = [...(original.top || []), ...(original.heart || []), ...(original.base || [])];

          // Find direct dupes first
          const directDupes = COLOGNE.filter(c => c.dupe_for === cologneId);

          // Find similar cheaper alternatives
          const similar = COLOGNE.filter(c => c.id !== cologneId && c.price < original.price * 0.6)
            .map(c => {
              const cNotes = [...(c.top || []), ...(c.heart || []), ...(c.base || [])];
              const sim = calculateNoteSimilarity(origNotes, cNotes);
              return { ...c, similarity: sim, savings: Math.round((1 - c.price / original.price) * 100) };
            })
            .filter(c => c.similarity > 0.2)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 8);

          return json({
            original: { ...original, logo: BRAND_LOGOS[original.brand] || null },
            direct_dupes: directDupes.map(d => ({ ...d, logo: BRAND_LOGOS[d.brand] || null })),
            similar_dupes: similar,
            total: directDupes.length + similar.length,
          });
        }

        // GET /api/skincare
        if (path === '/api/skincare' && method === 'GET') {
          const concern = url.searchParams.get('concern');
          const skinType = url.searchParams.get('skin_type');
          const category = url.searchParams.get('category');
          let results = SKINCARE;
          if (concern) results = results.filter(p => p.concerns?.includes(concern));
          if (skinType) results = results.filter(p => p.skin_types?.includes(skinType) || p.skin_types?.includes('all'));
          if (category) results = results.filter(p => p.category === category);
          return json({
            products: results.map(r => ({ ...r, logo: BRAND_LOGOS[r.brand] || null, affiliate_url: getAffiliateUrl({ url: r.url, brand: r.brand }) })),
            total: results.length,
          });
        }

        // GET /api/skincare/recommend/:concern
        const skincareRecMatch = path.match(/^\/api\/skincare\/recommend\/(.+)$/);
        if (skincareRecMatch && method === 'GET') {
          const concern = decodeURIComponent(skincareRecMatch[1]);
          const skinType = url.searchParams.get('skin_type');
          let results = SKINCARE.filter(p => p.concerns?.includes(concern));
          if (skinType) results = results.filter(p => !p.skin_types || p.skin_types.includes(skinType) || p.skin_types.includes('all'));
          return json({
            concern,
            products: results.slice(0, 10).map(r => ({ ...r, logo: BRAND_LOGOS[r.brand] || null, affiliate_url: getAffiliateUrl({ url: r.url, brand: r.brand }) })),
            total: results.length,
          });
        }

        // ── STMP Profile Routes ──
        const profileMatch = path.match(/^\/api\/profile\/([^/]+)$/);
        if (profileMatch && method === 'GET') {
          const userId = decodeURIComponent(profileMatch[1]);
          const profile = new STMPProfile(kv, userId);
          await profile.load();
          const summary = profile.getHistorySummary();
          if (summary.current_lab) {
            summary.current_rgb = labToRgb(summary.current_lab);
            summary.current_undertone = detectUndertone(summary.current_lab);
          }
          return json(summary);
        }

        const seasonalMatch = path.match(/^\/api\/profile\/([^/]+)\/seasonal$/);
        if (seasonalMatch && method === 'GET') {
          const userId = decodeURIComponent(seasonalMatch[1]);
          const profile = new STMPProfile(kv, userId);
          await profile.load();
          const current = profile.getCurrentLab();
          if (!current.lab) return json({ error: 'No scan data yet' }, 404);
          current.undertone = detectUndertone(current.lab);
          const seasons = ['spring', 'summer', 'fall', 'winter'];
          const predictions = {};
          for (const s of seasons) {
            const pred = profile.predictSeasonal(s);
            if (pred.predicted_lab) {
              pred.predicted_rgb = labToRgb(pred.predicted_lab);
              pred.predicted_undertone = detectUndertone(pred.predicted_lab);
            }
            predictions[s] = pred;
          }
          return json({ current: { lab: current.lab, rgb: labToRgb(current.lab), undertone: current.undertone, confidence: current.confidence }, predictions });
        }

        // POST /api/profile/:userId/confirm-scan — LIGHTING FIX (v4.1.0)
        // The shopper looked at the top matches and confirmed one looks right.
        // ONLY NOW does the corrected skin Lab get saved to STMP — never the
        // raw photo reading, never before confirmation.
        // body: { lab:[L,a,b], undertone?, lighting?, confidence?, white_balanced?,
        //         photos?, lighting_issues?, shade_id? }
        const confirmMatch = path.match(/^\/api\/profile\/([^/]+)\/confirm-scan$/);
        if (confirmMatch && method === 'POST') {
          const userId = decodeURIComponent(confirmMatch[1]);
          const body = await request.json();
          if (!body || !Array.isArray(body.lab) || body.lab.length !== 3 ||
              body.lab.some((v) => typeof v !== 'number' || !isFinite(v))) {
            return json({ error: 'Need lab:[L,a,b] numbers' }, 400);
          }
          const lab = body.lab.map((v) => Math.round(v * 100) / 100);
          const undertone = body.undertone || detectUndertone(lab);
          const profile = new STMPProfile(kv, userId);
          await profile.load();
          await profile.addScan(lab, undertone, 'client', body.lighting || 'natural', null, {
            confidence: typeof body.confidence === 'number' ? body.confidence : null,
            confirmed: true,
            white_balanced: body.white_balanced === true,
            photos: body.photos || 1,
            lighting_issues: body.lighting_issues || [],
          });
          if (body.shade_id) await profile.addShadeMatch(body.shade_id, false);
          const current = profile.getCurrentLab();
          current.undertone = detectUndertone(current.lab || lab);
          return json({
            status: 'confirmed',
            user_id: userId,
            lab, undertone,
            confidence: body.confidence ?? null,
            stmp: {
              confidence: current.confidence,
              total_scans: current.total_scans,
              stale: current.stale,
              days_since: current.days_since,
            },
          });
        }

        const saveMatch = path.match(/^\/api\/profile\/([^/]+)\/save-shade$/);
        if (saveMatch && method === 'POST') {
          const userId = decodeURIComponent(saveMatch[1]);
          const body = await request.json();
          if (!body || !body.shade_id) return json({ error: 'No shade_id' }, 400);
          const profile = new STMPProfile(kv, userId);
          await profile.load();
          await profile.addShadeMatch(body.shade_id, false);
          return json({ status: 'saved', shade_id: body.shade_id });
        }

        return json({ error: 'Not found' }, 404);
      } catch (err) {
        return json({ error: `Server error: ${err.message}` }, 500);
      }
    }

    // ── Static Files ──
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Assets not configured', { status: 500 });
  }
};
