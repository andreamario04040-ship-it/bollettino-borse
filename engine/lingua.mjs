// Formattazione italiana dei numeri e piccole funzioni di lingua.

export const MENO = '−';          // segno meno tipografico
const SOTTILE = ' ';              // spazio sottile per le migliaia

export function num(n, dec) {
  if (n == null || !isFinite(n)) return '—';
  const d = dec ?? (Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 2 : 4);
  // Il separatore delle migliaia va messo solo sulla parte intera.
  const [intera, decimale] = Math.abs(n).toFixed(d).split('.');
  const conPunti = intera.replace(/\B(?=(\d{3})+(?!\d))/g, SOTTILE);
  return (n < 0 ? MENO : '') + conPunti + (decimale ? ',' + decimale : '');
}

export function pct(n, dec = 2) {
  if (n == null || !isFinite(n)) return '—';
  return (n > 0 ? '+' : n < 0 ? MENO : '') + Math.abs(n).toFixed(dec).replace('.', ',') + '%';
}

export function direzione(n, soglia = 0.15) {
  if (n == null) return 'invariato';
  if (n > soglia) return 'in rialzo';
  if (n < -soglia) return 'in calo';
  return 'sostanzialmente piatto';
}

export function verbo(n, soglia = 0.15) {
  if (n == null) return 'è rimasto fermo';
  if (n > soglia) return 'ha guadagnato';
  if (n < -soglia) return 'ha perso';
  return 'ha chiuso invariato';
}

// "Milano, Francoforte e Parigi"
export function elenco(voci) {
  const v = voci.filter(Boolean);
  if (v.length === 0) return '';
  if (v.length === 1) return v[0];
  return v.slice(0, -1).join(', ') + ' e ' + v[v.length - 1];
}

export function maiuscola(s = '') {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Taglia un titolo senza spezzare le parole a metà.
export function taglia(s = '', max = 110) {
  if (s.length <= max) return s;
  const t = s.slice(0, max);
  return t.slice(0, t.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

export function oraItalia(d = new Date()) {
  const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false });
  return f.format(d);
}

export function dataItalia(d = new Date()) {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function minutiDaMezzanotteRoma(d = new Date()) {
  const [h, m] = oraItalia(d).split(':').map(Number);
  return h * 60 + m;
}

export function giornoRoma(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
