// affiliate.js — Affiliate URL builder
// Maps product domains to affiliate tracking tags

export const AFFILIATE_CONFIG = {
  'fentybeauty.com':         { tag: 'cmp_ft',   commission: 0.08 },
  'maccosmetics.com':        { tag: 'cmp_mac',  commission: 0.10 },
  'lorealparisusa.com':      { tag: 'cmp_lore', commission: 0.10 },
  'maybelline.com':          { tag: 'cmp_may',  commission: 0.10 },
  'narscosmetics.com':       { tag: 'cmp_nars', commission: 0.08 },
  'esteelauder.com':         { tag: 'cmp_est',  commission: 0.08 },
  'elfcosmetics.com':        { tag: 'cmp_elf',  commission: 0.12 },
  'charlottetilbury.com':    { tag: 'cmp_ct',   commission: 0.10 },
  'bareminerals.com':        { tag: 'cmp_bm',   commission: 0.10 },
  'revlon.com':              { tag: 'cmp_rev',  commission: 0.12 },
  'bobbibrowncosmetics.com': { tag: 'cmp_bb',   commission: 0.08 },
  'armanibeauty.com':        { tag: 'cmp_arm',  commission: 0.08 },
  'lancome.com':             { tag: 'cmp_lan',  commission: 0.08 },
  'covergirl.com':           { tag: 'cmp_cg',   commission: 0.12 },
  'urbandecay.com':          { tag: 'cmp_ud',   commission: 0.08 },
  'clinique.com':            { tag: 'cmp_cli',  commission: 0.08 },
  'shiseido.com':            { tag: 'cmp_shi',  commission: 0.08 },
  'itcosmetics.com':        { tag: 'cmp_it',   commission: 0.08 },
  'lauramercier.com':        { tag: 'cmp_lm',   commission: 0.08 },
  'tartecosmetics.com':      { tag: 'cmp_tar',  commission: 0.10 },
  'shophudabeauty.com':      { tag: 'cmp_huda', commission: 0.10 },
  'rarebeauty.com':          { tag: 'cmp_rare', commission: 0.10 },
  'kosas.com':               { tag: 'cmp_kosas',commission: 0.10 },
  'wwwiliabeauty.com':       { tag: 'cmp_ilia', commission: 0.10 },
  'patmcgrath.com':          { tag: 'cmp_pmgl', commission: 0.08 },
  'danessamyricksbeauty.com':{ tag: 'cmp_dm',   commission: 0.10 },
  'tower28beauty.com':       { tag: 'cmp_t28',  commission: 0.10 },
  'westman-atelier.com':     { tag: 'cmp_wa',   commission: 0.08 },
  'opi.com':                 { tag: 'cmp_opi',  commission: 0.10 },
  'essie.com':               { tag: 'cmp_ess',  commission: 0.10 },
  'sallyhansen.com':         { tag: 'cmp_sh',   commission: 0.12 },
  'zoya.com':                { tag: 'cmp_zoya', commission: 0.10 },
  'chinaglaze.com':          { tag: 'cmp_cg2',  commission: 0.12 },
  'butterlondon.com':        { tag: 'cmp_bl',   commission: 0.10 },
  'deborahlippmann.com':     { tag: 'cmp_dl',   commission: 0.08 },
  'oliveandjune.com':        { tag: 'cmp_oj',   commission: 0.10 },
  'sundaysnails.com':        { tag: 'cmp_sun',  commission: 0.10 },
  'dazzledry.com':           { tag: 'cmp_dd',   commission: 0.10 },
  'cnd.com':                 { tag: 'cmp_cnd',  commission: 0.10 },
  'lightelegance.com':       { tag: 'cmp_le',   commission: 0.10 },
  'lechatnails.com':         { tag: 'cmp_lc',   commission: 0.10 },
  'kiarasky.com':            { tag: 'cmp_ks',   commission: 0.10 },
  'ulta.com':                { tag: 'cmp_ulta', commission: 0.08 },
  'sephora.com':             { tag: 'cmp_sep',  commission: 0.05 },
};

export function getAffiliateUrl(shade) {
  const url = shade.url || '';
  if (!url) return '';
  for (const [domain, config] of Object.entries(AFFILIATE_CONFIG)) {
    if (url.includes(domain)) {
      if (url.includes(`ref=${config.tag}`)) return url;
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}ref=${config.tag}`;
    }
  }
  return url;
}
