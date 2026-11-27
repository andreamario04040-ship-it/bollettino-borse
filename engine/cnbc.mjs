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
  if (!t) return null;            // vuoto vuol dire «non so», non «zero»
  if (/^unch$/i.test(t)) return 0;
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

    // CNBC scrive "UNCH" in due casi diversi: il titolo è davvero fermo, oppure
    // non ha un valore fresco e ripete la chiusura di ieri. Si distinguono
    // guardando se l'ultimo prezzo è identico alla chiusura precedente: un
    // indice che chiude esattamente sullo zero, al centesimo, non esiste.
    // Chiamarlo «fermo» e lasciar decidere a chi legge è più onesto che
    // spacciare per piatta una borsa di cui non si sa niente.
    const invariato = /^unch$/i.test(String(v.change_pct ?? '').trim());
    const chiusura = numero(v.previous_day_closing);
    const fermo = invariato && chiusura != null && prezzo === chiusura;
    out.set(v.symbol, {
      // Il nome serve a controllare un codice di borsa proposto dall'agente:
      // se chiedo STLA e mi risponde "Stellantis N.V." il codice è quello
      // giusto; se risponde un'altra azienda, meglio nessun prezzo.
      nome: v.name || v.altName || null,
      prezzo,
      giorno: fermo ? null : numero(v.change_pct),
      fermo,
      chiusuraPrecedente: numero(v.previous_day_closing),
      massimoGiorno: numero(v.high),
      minimoGiorno: numero(v.low),
      mercatoAperto: /REG_MKT|EXT_MKT/i.test(v.curmktstatus || ''),
    });
  }
  return out;
}
