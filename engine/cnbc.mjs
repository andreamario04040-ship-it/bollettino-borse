// Quotazioni dal servizio pubblico di CNBC.
// Serve perché Yahoo rifiuta le richieste che arrivano dai data center,
// e GitHub Actions gira dentro un data center: senza questa fonte,
// i numeri non si aggiornerebbero mai da soli.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const BASE = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol'
  + '?requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1&symbols=';

// "7,182.78" → 7182.78 ; "4.864%" → 4.864 ; "UNCH" → 0 ; "" → null
function numero(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t || /^unch$/i.test(t)) return 0;
  const n = Number(t.replace(/,/g, '').replace(/%$/, '').replace(/^\+/, ''));
  return isFinite(n) ? n : null;
}

export async function quotazioniCnbc(simboli) {
  if (!simboli.length) return new Map();
  const url = BASE + encodeURIComponent(simboli.join('|'));
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();

  let voci = j?.FormattedQuoteResult?.FormattedQuote ?? [];
  if (!Array.isArray(voci)) voci = [voci];

  const out = new Map();
  for (const v of voci) {
    if (!v?.symbol) continue;
    const prezzo = numero(v.last);
    if (prezzo == null) continue;
    out.set(v.symbol, {
      prezzo,
      giorno: numero(v.change_pct),
      chiusuraPrecedente: numero(v.previous_day_closing),
      massimoGiorno: numero(v.high),
      minimoGiorno: numero(v.low),
      mercatoAperto: /REG_MKT|EXT_MKT/i.test(v.curmktstatus || ''),
    });
  }
  return out;
}
