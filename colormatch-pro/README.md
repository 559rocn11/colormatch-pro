# ColorMatch Pro v4 — The Complete Beauty Intelligence Platform

**1,726 makeup shades · 112 fragrances · 127 skincare products · 48 brand logos · 11 retail chains**

## What This Is

ColorMatch Pro is a patent-pending, AI-powered color matching platform deployed on Cloudflare Workers. It matches your skin tone to real products across 14 categories using CIE L*a*b* color science and CIE Delta E 2000 — the same measurement system used in professional color labs.

### Categories

| Category | Shades | Brands |
|---------|--------|--------|
| Foundation | 456 | 30+ |
| Concealer | 173 | 15+ |
| Lipstick | 210 | 15+ |
| Blush | 132 | 12+ |
| Eyeshadow | 156 | 12+ |
| Highlighter | 90 | 10+ |
| Bronzer | 90 | 10+ |
| Primer | 70 | 10+ |
| Mascara | 50 | 10+ |
| Eyebrow | 48 | 8+ |
| Setting Spray | 32 | 8+ |
| Nail Polish | 219 | 14+ |
| Cologne | 112 | 41 |
| Skincare | 127 | 25 |

### Features

1. **AI Skin Tone Matching** — Client-side canvas extraction, CIE L*a*b* conversion, Delta E 2000 matching
2. **Skin Health Analysis** — Detects acne, redness, aging signs, oiliness, dryness, dullness; recommends skincare
3. **Dupe Finder** — Finds affordable alternatives for any product (color-matched, same category, 40%+ cheaper)
4. **Cologne Finder** — Match fragrances by scent notes (top/heart/base); find affordable dupes for luxury scents
5. **Store Locator** — Geolocation to find nearby Walmart, Ulta, Sephora, Target, CVS and what brands they carry
6. **Skin Tone Memory Profile (STMP)** — Patent-pending: tracks skin over time, predicts seasonal drift, multi-zone scanning
7. **Brand Logos** — 48 brand logos via Clearbit for a corporate-ready look
8. **Affiliate Revenue** — Every product link has affiliate tracking for 8-14% commission
9. **Bookmarks** — Save shades to your profile
10. **Share Card** — Canvas-generated shareable match card

## Quick Start

```bash
cd colormatch-pro
npm install

# Create KV namespace for STMP profiles
npx wrangler kv namespace create STMP_KV
# Copy the ID into wrangler.toml

# Run locally
npm run dev

# Deploy to production
npm run deploy
```

## File Structure

```
colormatch-pro/
├── wrangler.toml              Cloudflare Worker config
├── package.json               npm scripts
├── src/
│   ├── index.js               Main Worker — 20+ API endpoints
│   ├── color-science.js       CIE Lab, Delta E 2000, undertone detection
│   ├── stmp-engine.js         STMP patent engine — seasonal drift, multi-zone, KV
│   ├── affiliate.js           Affiliate URL builder (60+ domains)
│   ├── brands.js              48 brand logo URLs (Clearbit)
│   ├── foundations.js         456 foundation shades
│   ├── concealers.js          173 concealer shades
│   ├── lipsticks.js           210 lipstick shades
│   ├── blush.js               132 blush shades
│   ├── eyeshadow.js           156 eyeshadow shades
│   ├── highlighter.js         90 highlighter shades
│   ├── bronzer.js             90 bronzer shades
│   ├── primer.js              70 primer shades
│   ├── mascara.js             50 mascara shades
│   ├── eyebrow.js             48 eyebrow shades
│   ├── setting-spray.js       32 setting spray shades
│   ├── nail-polish.js         219 nail polish shades
│   ├── cologne.js             112 fragrances + note similarity engine
│   ├── skincare.js            127 skincare products
│   └── stores.js              11 retail chains with brand selections
└── public/
    └── index.html             Full frontend — 7 tabs, client-side analysis
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check — total counts, version |
| GET | /api/brands | All brands with shade counts |
| GET | /api/brands/logos | Brand logo URLs |
| GET | /api/categories | All 14 product categories |
| GET | /api/shades | Query shades (category, brand, undertone, coverage, finish, price) |
| POST | /api/analyze | Analyze skin tone → matches + dupes + nearby stores |
| POST | /api/skin-health | Analyze skin health → issues + skincare recommendations |
| POST | /api/equivalent | Cross-brand equivalents for a shade |
| POST | /api/dupes | Find affordable dupes for a product |
| GET | /api/dupes/:id | Get dupes for a specific shade |
| GET | /api/stores | All retail chains |
| GET | /api/stores/nearby | Nearby stores (lat, lng) |
| GET | /api/stores/for-brand/:brand | Which stores carry a brand |
| GET | /api/cologne | Query fragrances (brand, occasion, season, gender) |
| POST | /api/cologne/match | Match by scent notes |
| GET | /api/cologne/dupes/:id | Find dupes for a fragrance |
| GET | /api/skincare | Query skincare (concern, skin_type, category) |
| GET | /api/skincare/recommend/:concern | Recommend products for a concern |
| GET | /api/profile/:userId | STMP profile history |
| GET | /api/profile/:userId/seasonal | Seasonal predictions |
| POST | /api/profile/:userId/save-shade | Save bookmarked shade |

## Architecture

**Client-side skin extraction** — Canvas API samples face in 3 zones (forehead/cheeks/jaw), filters skin-tone pixels using YCrCb-like RGB thresholds, converts to L*a*b* on the client. No image upload, no server-side OpenCV.

**Cloudflare Worker** — All color science runs on the edge. STMP profiles in KV. Zero cold-start.

**Patent-pending STMP** — Skin Tone Memory Profile: longitudinal tracking, seasonal drift prediction, multi-zone authority weights (wrist = highest authority for undertone, forehead = highest for lightness).

## Business Model

1. **Affiliate commissions** (Day 1) — 8-14% per sale on every match
2. **B2B licensing** — Brands license the engine for their websites
3. **Retail infrastructure** — License to Walmart, CVS, Target
4. **Data business** — Shade gap analysis by region/season/demographic
5. **Exit** — Acquisition target for L'Oréal/Estée Lauder type conglomerates

## Deployment

1. `npm install`
2. `npx wrangler kv namespace create STMP_KV`
3. Update `wrangler.toml` with KV namespace ID
4. `npm run deploy`

## License

Proprietary. Patent-pending STMP technology. © REELYROCN Studio.
