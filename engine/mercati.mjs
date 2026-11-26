// Quotazioni da Yahoo Finance.
// Strada principale: un'unica chiamata per tutti i simboli insieme (endpoint "spark").
// È molto più leggera e non viene limitata come le chiamate una per una,
// che restano come riserva per i simboli che dovessero mancare.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const ATTESE = [2000, 6000, 15000, 40000];

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const aPezzi = (v, n) => Array.from({ length: Math.ceil(v.length / n) }, (_, i) => v.slice(i * n, i * n + n));

// I due indirizzi di Yahoo hanno limiti separati: si alternano a ogni richiesta,
// così se uno sta limitando le chiamate l'altro risponde subito.
let giro = Math.floor(Math.random() * HOSTS.length);

async function chiedi(url, tentativo = 0) {
  const host = HOSTS[giro++ % HOSTS.length];
  try {
    const r = await fetch(`https://${host}${url}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.stato = r.status; e.ritenta = r.headers.get('retry-after'); throw e; }
    return await r.json();
  } catch (e) {
    if (tentativo >= ATTESE.length) throw e;
    // Un 429 vuol dire "stai chiedendo troppo": si aspetta molto di più,
    // e se il server dice quanto, si rispetta quello che dice.
    const dettato = Number(e.ritenta) * 1000;
    const attesa = e.stato === 429 ? Math.max(ATTESE[tentativo] * 3, dettato || 0) : ATTESE[tentativo];
    await pausa(attesa);
    return chiedi(url, tentativo + 1);
  }
}

// Variazione percentuale rispetto a N sedute fa.
function variazione(chiusure, sedute) {
  if (!chiusure || chiusure.length < 2) return null;
  const base = chiusure[Math.max(0, chiusure.length - 1 - sedute)];
  const ultimo = chiusure[chiusure.length - 1];
  return base && ultimo ? ((ultimo / base) - 1) * 100 : null;
}

export function componi(sym, prezzo, giorno, chiusure) {
  const serie = (chiusure || []).filter((x) => x != null && isFinite(x));
  if (prezzo == null && !serie.length) return { sym, errore: 'nessun dato' };
  const p = prezzo ?? serie[serie.length - 1];
  return {
    sym,
    prezzo: p,
    giorno: giorno ?? variazione(serie, 1),
    settimana: variazione(serie, 5),
    mese: variazione(serie, 22),
    trimestre: variazione(serie, 66),
    anno: variazione(serie, serie.length - 1),
    max52: serie.length ? Math.max(...serie) : null,
    min52: serie.length ? Math.min(...serie) : null,
    spark: serie.slice(-66).map((x) => Number(x.toFixed(4))),
    aggiornato: new Date().toISOString(),
  };
}

async function inBlocco(simboli) {
  const out = new Map();
  for (const pezzo of aPezzi(simboli, 10)) {
    const url = `/v8/finance/spark?symbols=${pezzo.map(encodeURIComponent).join(',')}&range=1y&interval=1d`;
    try {
      const j = await chiedi(url);
      for (const sym of pezzo) {
        const v = j?.[sym];
        if (!v) continue;
        out.set(sym, componi(sym, v.fulldayPrice, v.fulldayChangePercent, v.close));
      }
    } catch (e) {
      console.error(`  ! blocco (${pezzo.length} simboli): ${e.message}`);
    }
    await pausa(500);
  }
  return out;
}

async function unoAlloVolta(sym) {
  const j = await chiedi(`/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`);
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description || 'risposta vuota');
  const m = res.meta;
  const d = componi(sym, m.regularMarketPrice, m.regularMarketChangePercent, res.indicators?.quote?.[0]?.close);
  return { ...d, valuta: m.currency, mercato: m.exchangeName, max52: m.fiftyTwoWeekHigh ?? d.max52, min52: m.fiftyTwoWeekLow ?? d.min52 };
}

// Oltre questo numero di mancanti non si insiste con le chiamate singole:
// vuol dire che Yahoo sta limitando le richieste, e insistere peggiora le cose.
// Chi ci chiama riuserà l'ultimo valore buono.
const MASSIMO_RECUPERI = 4;

export async function scaricaMercati(strumenti) {
  const simboli = strumenti.map((s) => s.sym);
  const presi = await inBlocco(simboli);

  const mancanti = simboli.filter((s) => !presi.has(s));
  let recuperati = 0;

  if (mancanti.length && mancanti.length <= MASSIMO_RECUPERI) {
    for (const sym of mancanti) {
      try { presi.set(sym, await unoAlloVolta(sym)); recuperati++; }
      catch (e) { console.error(`  ! ${sym}: ${e.message}`); presi.set(sym, { sym, errore: e.message }); }
      await pausa(400);
    }
  } else if (mancanti.length) {
    console.error(`  ! ${mancanti.length} simboli non arrivati: Yahoo sta limitando le richieste, non insisto.`);
    for (const sym of mancanti) presi.set(sym, { sym, errore: 'troppe richieste' });
  }

  const out = strumenti.map((s) => ({ ...s, ...presi.get(s.sym) }));
  const ok = out.filter((x) => !x.errore).length;
  const come = mancanti.length === 0 ? ' in un’unica chiamata'
    : recuperati ? ` (${recuperati} recuperati con chiamata singola)` : '';
  console.log(`  mercati: ${ok}/${out.length} strumenti${come}`);
  return out;
}
