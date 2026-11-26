// Lo storico delle chiusure, conservato nel repository.
// Yahoo dà un anno di dati in un colpo solo, ma risponde soltanto da una connessione
// di casa. CNBC risponde ovunque ma dà solo il prezzo di adesso. Così lo storico si
// semina una volta da casa e poi si allunga da solo, un punto al giorno.

const GIORNI_CONSERVATI = 400;

export const serieVuota = () => ({});

export function aggiungiPunto(serie, sym, giorno, chiusura) {
  if (chiusura == null || !isFinite(chiusura)) return serie;
  const punti = serie[sym] ? [...serie[sym]] : [];
  const i = punti.findIndex(([g]) => g === giorno);
  if (i >= 0) punti[i] = [giorno, Number(chiusura.toFixed(4))];
  else punti.push([giorno, Number(chiusura.toFixed(4))]);
  punti.sort((a, b) => a[0].localeCompare(b[0]));
  serie[sym] = punti.slice(-GIORNI_CONSERVATI);
  return serie;
}

export function sostituisciSerie(serie, sym, punti) {
  serie[sym] = punti.slice(-GIORNI_CONSERVATI);
  return serie;
}

// Variazione fra il prezzo di adesso e quello di N sedute fa.
function variazione(chiusure, prezzoOra, sedute) {
  if (!chiusure.length) return null;
  const base = chiusure[Math.max(0, chiusure.length - 1 - sedute)];
  return base ? ((prezzoOra / base) - 1) * 100 : null;
}

// Dallo storico ricava settimana, mese, anno, minimi, massimi e il grafico.
export function daSerie(serie, sym, prezzoOra, giornoOggi) {
  const punti = (serie[sym] || []).filter(([g]) => g !== giornoOggi);
  const chiusure = punti.map(([, c]) => c);
  if (!chiusure.length) return { spark: [], scarsa: true };

  const conOggi = [...chiusure, prezzoOra];
  return {
    settimana: variazione(chiusure, prezzoOra, 4),
    mese: variazione(chiusure, prezzoOra, 21),
    trimestre: variazione(chiusure, prezzoOra, 65),
    anno: variazione(chiusure, prezzoOra, chiusure.length - 1),
    max52: Math.max(...conOggi),
    min52: Math.min(...conOggi),
    spark: conOggi.slice(-66),
    // Con pochi punti le variazioni lunghe sono inattendibili: meglio dirlo.
    scarsa: chiusure.length < 25,
  };
}

export function quantiPunti(serie) {
  const v = Object.values(serie).map((p) => p.length);
  return v.length ? { simboli: v.length, minimo: Math.min(...v), massimo: Math.max(...v) } : { simboli: 0, minimo: 0, massimo: 0 };
}
