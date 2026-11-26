// Quotazioni. Due fonti, con ruoli diversi:
//
//  · Yahoo Finance dà prezzo e un anno di storico in un'unica chiamata, ma rifiuta
//    le richieste che arrivano dai data center — quindi da GitHub Actions non risponde.
//  · CNBC risponde ovunque, ma dà solo il prezzo di adesso.
//
// Si prova prima Yahoo (quando il motore gira da casa funziona, ed è la fonte migliore);
// se non risponde si usa CNBC e lo storico conservato nel repository.

import { quotazioniCnbc } from './cnbc.mjs';
import { daSerie, aggiungiPunto, sostituisciSerie } from './serie.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const ATTESE_YAHOO = [1500, 5000];   // poche e brevi: se Yahoo blocca, meglio passare subito a CNBC

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const aPezzi = (v, n) => Array.from({ length: Math.ceil(v.length / n) }, (_, i) => v.slice(i * n, i * n + n));
let giro = Math.floor(Math.random() * HOSTS.length);

async function chiediYahoo(url, tentativo = 0) {
  const host = HOSTS[giro++ % HOSTS.length];
  try {
    const r = await fetch(`https://${host}${url}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (tentativo >= ATTESE_YAHOO.length) throw e;
    await pausa(ATTESE_YAHOO[tentativo]);
    return chiediYahoo(url, tentativo + 1);
  }
}

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
    sym, prezzo: p,
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

// Prova Yahoo. Restituisce una mappa, eventualmente vuota.
export async function daYahoo(simboli, date = '1y') {
  const out = new Map();
  for (const pezzo of aPezzi(simboli, 10)) {
    try {
      const j = await chiediYahoo(`/v8/finance/spark?symbols=${pezzo.map(encodeURIComponent).join(',')}&range=${date}&interval=1d`);
      for (const sym of pezzo) {
        const v = j?.[sym];
        if (v) out.set(sym, { ...componi(sym, v.fulldayPrice, v.fulldayChangePercent, v.close), timestamp: v.timestamp, chiusure: (v.close || []).filter((x) => x != null) });
      }
    } catch (e) {
      console.error(`  · Yahoo non risponde (${e.message})`);
      return out;   // se blocca un pezzo blocca tutto: inutile insistere
    }
    await pausa(400);
  }
  return out;
}

const giornoDa = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

export async function scaricaMercati(strumenti, serie = {}, giornoOggi = new Date().toISOString().slice(0, 10)) {
  const presi = await daYahoo(strumenti.map((s) => s.sym));
  let fonte = 'Yahoo Finance';

  if (presi.size >= strumenti.length / 2) {
    // Yahoo ha risposto: si approfitta per rinfrescare tutto lo storico.
    for (const [sym, d] of presi) {
      if (d.timestamp?.length && d.chiusure?.length) {
        const punti = d.timestamp.map((t, i) => [giornoDa(t), d.chiusure[i]]).filter(([, c]) => c != null);
        sostituisciSerie(serie, sym, punti);
      }
    }
  } else {
    fonte = 'CNBC';
    console.log('  · passo a CNBC e allo storico salvato');
    const perCnbc = new Map(strumenti.map((s) => [s.cnbc, s.sym]));
    try {
      const q = await quotazioniCnbc(strumenti.map((s) => s.cnbc).filter(Boolean));
      for (const [simboloCnbc, d] of q) {
        const sym = perCnbc.get(simboloCnbc);
        if (!sym) continue;
        aggiungiPunto(serie, sym, giornoOggi, d.prezzo);
        const st = daSerie(serie, sym, d.prezzo, giornoOggi);
        presi.set(sym, {
          sym, prezzo: d.prezzo, giorno: d.giorno,
          settimana: st.settimana ?? null, mese: st.mese ?? null,
          trimestre: st.trimestre ?? null, anno: st.anno ?? null,
          max52: st.max52 ?? null, min52: st.min52 ?? null,
          spark: (st.spark || []).map((x) => Number(x.toFixed(4))),
          storicoScarso: st.scarsa === true,
          aggiornato: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error(`  ! anche CNBC non risponde: ${e.message}`);
    }
  }

  // Lo storico si allunga comunque di un punto al giorno.
  for (const [sym, d] of presi) if (d.prezzo != null) aggiungiPunto(serie, sym, giornoOggi, d.prezzo);

  const out = strumenti.map((s) => {
    const d = presi.get(s.sym);
    if (!d) return { ...s, errore: 'non arrivato' };
    const { timestamp, chiusure, ...pulito } = d;
    return { ...s, ...pulito };
  });
  const ok = out.filter((x) => !x.errore).length;
  console.log(`  mercati: ${ok}/${out.length} strumenti da ${fonte}`);
  return { mercati: out, serie, fonte };
}
