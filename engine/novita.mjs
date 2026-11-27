// Confronta il bollettino appena scritto con il precedente e dice, in italiano,
// se c'è davvero qualcosa di nuovo.
//
// Serve perché il bollettino ha sempre la stessa forma — cinque sezioni, gli stessi
// titoli — e due giornate diverse si somigliano al punto di sembrare la stessa.
// Chi apre l'app deve poter capire in un colpo d'occhio se l'agente ha trovato
// qualcosa o se sta solo ripetendo ieri con altri numeri.

import fs from 'node:fs/promises';
import path from 'node:path';
import { elenco, giornoRoma } from './lingua.mjs';

const RANGO = { mattina: 0, avviso: 1, sera: 2 };

// L'ordine dei file d'archivio è cronologico per costruzione: il nome comincia
// con la data, e dentro la giornata mattina viene prima di sera.
function chiaveDi(nome) {
  const m = /^(\d{4}-\d{2}-\d{2})-(mattina|sera|avviso)/.exec(nome);
  if (!m) return null;
  return { file: nome, giorno: m[1], tipo: m[2], rango: RANGO[m[2]] ?? 1 };
}

// Il bollettino pubblicato prima di questo. Si salta la casella che stiamo
// riscrivendo: un secondo tentativo della stessa mattina non è «il precedente»,
// altrimenti un'esecuzione ripetuta direbbe sempre «niente di nuovo».
export async function bollettinoPrecedente(cartella, giorno, tipo) {
  let nomi = [];
  try { nomi = await fs.readdir(cartella); } catch { return null; }

  const candidati = nomi
    .filter((n) => n.endsWith('.json'))
    .map(chiaveDi)
    .filter((k) => k && !(k.giorno === giorno && k.tipo === tipo))
    .sort((a, b) => a.giorno.localeCompare(b.giorno) || a.rango - b.rango);

  const ultimo = candidati[candidati.length - 1];
  if (!ultimo) return null;
  try { return JSON.parse(await fs.readFile(path.join(cartella, ultimo.file), 'utf8')); } catch { return null; }
}

// «ieri pomeriggio», «stamattina», «mercoledì 25 novembre»: come lo direbbe una
// persona. La frase non porta articoli, così regge sia dopo «rispetto a» sia
// dopo «gli stessi argomenti di» senza storpiature.
export function quandoEra(precedente, adesso = new Date()) {
  const g = giornoRoma(new Date(precedente.generatoIl));
  const oggi = giornoRoma(adesso);
  const ieri = giornoRoma(new Date(adesso.getTime() - 86400000));

  if (g === oggi) return precedente.tipo === 'mattina' ? 'stamattina' : precedente.tipo === 'sera' ? 'oggi pomeriggio' : 'prima, oggi';
  if (g === ieri) return precedente.tipo === 'mattina' ? 'ieri mattina' : precedente.tipo === 'sera' ? 'ieri pomeriggio' : 'ieri';
  return precedente.data || g;
}

const nomiDi = (lista) => (lista || []).map((x) => x?.nome).filter(Boolean);
const testoSezioni = (r) => (r?.sezioni || []).map((s) => s.testo || '').join('\n');

/* Quante borse si sono mosse davvero oggi. Si contano solo gli indici di
   borsa — quelli che hanno una zona del mondo — e non il cambio, l'oro o il
   bitcoin: sono altra roba, e metterli nello stesso conto gonfierebbe il
   verdetto. Sotto mezzo punto è il saliscendi di sempre, non una notizia. */
function quanteBorseMosse(mercati, soglia = 1) {
  return (mercati || []).filter((m) => m.zona && m.giorno != null && Math.abs(m.giorno) >= soglia).length;
}

export function confronta({ report, precedente, mercati = [], adesso = new Date() }) {
  const mossiForte = quanteBorseMosse(mercati, 1);
  const mossi = quanteBorseMosse(mercati, 0.5);

  if (!precedente) {
    return {
      quanto: 'molto',
      riga: 'È il primo bollettino: non ho niente con cui confrontarlo.',
      confrontatoCon: null,
      aziendeNuove: nomiDi(report.aziende), temiNuovi: nomiDi(report.temi),
      indiciNuovi: nomiDi(report.daGuardare), borseMosse: mossiForte, testoCambiato: true,
    };
  }

  const prima = new Set(nomiDi(precedente.aziende));
  const aziendeNuove = nomiDi(report.aziende).filter((n) => !prima.has(n));
  const primaTemi = new Set(nomiDi(precedente.temi));
  const temiNuovi = nomiDi(report.temi).filter((n) => !primaTemi.has(n));
  const primaIndici = new Set(nomiDi(precedente.daGuardare));
  const indiciNuovi = nomiDi(report.daGuardare).filter((n) => !primaIndici.has(n));
  const testoCambiato = testoSezioni(report) !== testoSezioni(precedente);
  const climaCambiato = (report.clima?.parola || null) !== (precedente.clima?.parola || null);
  const quando = quandoEra(precedente, adesso);

  // Tre verdetti. «Niente» è severo per scelta: lo si dichiara solo quando non
  // è cambiata nemmeno una parola, perché è una cosa grossa da dire.
  let quanto, riga;
  if (!testoCambiato && !aziendeNuove.length && !temiNuovi.length && mossi === 0) {
    quanto = 'niente';
    riga = `Non ho trovato niente di nuovo rispetto a ${quando}: stesse aziende, stessi temi, stessi numeri.`;
  } else if (!aziendeNuove.length && !temiNuovi.length && mossiForte < 3) {
    quanto = 'poco';
    const quante = mossiForte === 0 ? "nessuna borsa si muove di oltre l'1%"
      : mossiForte === 1 ? "una sola borsa si muove di oltre l'1%"
      : `solo ${mossiForte} borse si muovono di oltre l'1%`;
    riga = `Gli stessi argomenti di ${quando}: cambiano i numeri, ma ${quante}.`;
  } else {
    quanto = 'molto';
    const pezzi = [];
    if (aziendeNuove.length) pezzi.push(`${aziendeNuove.length === 1 ? 'un\'azienda nuova' : `${aziendeNuove.length} aziende nuove`} (${elenco(aziendeNuove)})`);
    if (temiNuovi.length) pezzi.push(`${temiNuovi.length === 1 ? 'un tema nuovo' : `${temiNuovi.length} temi nuovi`} (${elenco(temiNuovi)})`);
    if (mossiForte) pezzi.push(`${mossiForte} ${mossiForte === 1 ? 'borsa mossa' : 'borse mosse'} di oltre l'1%`);
    if (!pezzi.length && climaCambiato) pezzi.push(`il clima è passato a «${report.clima.parola}»`);
    if (!pezzi.length) pezzi.push('le sezioni sono riscritte');
    riga = `Rispetto a ${quando}: ${elenco(pezzi)}.`;
  }

  return {
    quanto, riga,
    confrontatoCon: { tipo: precedente.tipo, data: precedente.data || null, ora: precedente.ora || null, generatoIl: precedente.generatoIl || null, come: quando },
    aziendeNuove, temiNuovi, indiciNuovi, borseMosse: mossiForte, testoCambiato,
  };
}

/* Le uscite di oggi, perché l'app possa dire quale appuntamento è andato a buon
   fine e quale no, senza che l'utente debba ricordarsene. */
export async function giornataDiOggi(cartella, report, adesso = new Date()) {
  const oggi = giornoRoma(adesso);
  let nomi = [];
  try { nomi = await fs.readdir(cartella); } catch { /* prima volta */ }

  const uscite = new Map();
  for (const n of nomi) {
    const k = chiaveDi(n);
    if (!k || k.giorno !== oggi) continue;
    try {
      const r = JSON.parse(await fs.readFile(path.join(cartella, n), 'utf8'));
      uscite.set(k.tipo, { tipo: k.tipo, ora: r.ora || null, generatoIl: r.generatoIl || null });
    } catch { /* un file illeggibile non deve fermare il bollettino */ }
  }
  // Quello che stiamo scrivendo adesso: sul disco non c'è ancora.
  uscite.set(report.tipo, { tipo: report.tipo, ora: report.ora || null, generatoIl: report.generatoIl });

  return { giorno: oggi, uscite: [...uscite.values()].sort((a, b) => (RANGO[a.tipo] ?? 1) - (RANGO[b.tipo] ?? 1)) };
}
