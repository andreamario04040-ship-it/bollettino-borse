// Punto d'ingresso. Tre modi:
//   node engine/esegui.mjs bollettino [mattina|sera]   → il bollettino fisso
//   node engine/esegui.mjs avviso                      → controllo del giorno, manda solo se serve
//   node engine/esegui.mjs notifica                    → manda la notifica di un bollettino già scritto
//
// Il terzo serve al Mac. Lì l'agente scrive il bollettino usando l'abbonamento
// Claude, ma le iscrizioni alle notifiche stanno nei segreti di GitHub e da casa
// non si possono leggere. Quindi il Mac scrive, carica, e poi chiede a GitHub di
// fare partire solo l'invio.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaMercati } from './mercati.mjs';
import { serieVuota } from './serie.mjs';
import { scaricaNotizie } from './notizie.mjs';
import { costruisciReport } from './report.mjs';
import { aziendeDelGiorno, componiAziende, componiIndici, componiRadar, NOMI_CONOSCIUTI } from './aziende.mjs';
import { scegliIlGiorno } from './scelta.mjs';
import { arricchisci } from './articoli.mjs';
import { riassumiAziende } from './agente.mjs';
import { riassumiConEstratto } from './estratto.mjs';
import { verifica, stampaVerifica } from './verifica.mjs';
import { leggiCorrezioni, daNotificare, segnaNotificate, notificaDi } from './correzioni.mjs';
import { valutaAvviso, statoVuoto } from './avvisi.mjs';
import { inviaNotifica } from './push.mjs';
import { giornoRoma, oraItalia, dataItalia, minutiDaMezzanotteRoma } from './lingua.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
const dentro = (...p) => path.join(radice, ...p);

const leggiJson = async (f, fallback = null) => {
  try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return fallback; }
};
const scriviJson = async (f, v) => {
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(v));
};

const modo = process.argv[2] || 'bollettino';
const quale = process.argv[3];
const adesso = new Date();

const config = await leggiJson(dentro('config.json'));
if (!config) throw new Error('config.json non trovato');

console.log(`\n▸ ${modo} — ${dataItalia(adesso)} ore ${oraItalia(adesso)} (ora italiana)`);

// Ogni appuntamento ha una finestra larga, non un orario esatto: GitHub fa partire
// le esecuzioni programmate con ritardi di decine di minuti, e un controllo stretto
// farebbe saltare il bollettino proprio nei giorni in cui il servizio è carico.
// A non farne partire due è il controllo sotto, che guarda se è già stato pubblicato.
const FINESTRE = {
  mattina: { da: '08:00', a: '12:30' },
  // Il ripiego: è lo stesso bollettino del mattino, ma la sua finestra si apre
  // solo a mezzogiorno, quando il Mac non l'ha ancora fatto e l'agente è perso.
  mezzogiorno: { da: '11:55', a: '13:10' },
  sera: { da: '17:30', a: '21:30' },
};
const inMinuti = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const daCalendario = !!process.env.DA_CALENDARIO;

// ─── modo "notifica": non si genera niente, si manda quello che c'è già ───────
if (modo === 'notifica') {
  const r = await leggiJson(dentro('docs/data/report.json'));
  if (!r?.notifica?.titolo) {
    console.error('  non c’è nessun bollettino da notificare.');
    process.exit(1);
  }

  // Lo stesso bollettino non si annuncia due volte: se il Mac chiede l'invio e
  // qualcosa fa partire la richiesta un'altra volta, la seconda non disturba.
  const giaFatto = await leggiJson(dentro('docs/data/notificato.json'), {});
  if (giaFatto.generatoIl && giaFatto.generatoIl === r.generatoIl) {
    console.log(`  il bollettino ${r.tipo} di ${r.data} è già stato annunciato: non lo ripeto.`);
    process.exit(0);
  }

  console.log(`  » ${r.notifica.titolo}\n    ${r.notifica.corpo}`);
  const esito = await inviaNotifica({ ...r.notifica, tipo: 'bollettino' });
  if (esito.inviate > 0) await scriviJson(dentro('docs/data/notificato.json'), { generatoIl: r.generatoIl, quando: new Date().toISOString() });

  const daDire = daNotificare(await leggiCorrezioni());
  if (daDire.length) {
    const e2 = await inviaNotifica(notificaDi(daDire));
    if (e2.inviate > 0) {
      await segnaNotificate(daDire.map((c) => c.id));
      console.log(`  correzioni: notificata${daDire.length > 1 ? 'e ' + daDire.length : ''}`);
    }
  }
  console.log('  fatto.\n');
  process.exit(esito.inviate > 0 ? 0 : 1);
}

const serieSalvata = await leggiJson(dentro('docs/data/serie.json'), serieVuota());
const oggi = giornoRoma(adesso);

const [esitoMercati, notizie] = await Promise.all([
  scaricaMercati(config.strumenti, serieSalvata, oggi),
  scaricaNotizie(config.feed),
]);
const appena = esitoMercati.mercati;
await scriviJson(dentro('docs/data/serie.json'), esitoMercati.serie);

// Se un indice non risponde (succede: Yahoo limita chi lo interroga spesso) si tiene
// l'ultimo valore buono e lo si segna come fermo, invece di lasciare un buco nell'app.
const precedenti = new Map((await leggiJson(dentro('docs/data/mercati.json'), []) || []).map((m) => [m.sym, m]));
const mercati = appena.map((m) => {
  if (!m.errore) return m;
  const vecchio = precedenti.get(m.sym);
  if (!vecchio || vecchio.prezzo == null) return m;
  console.log(`  ↺ ${m.nome}: tengo il valore precedente`);
  return { ...vecchio, obsoleto: true };
});

const validi = mercati.filter((m) => m.prezzo != null).length;
if (validi < mercati.length / 2) {
  console.error(`  Solo ${validi} strumenti su ${mercati.length} hanno un valore: non pubblico un bollettino monco.`);
  process.exit(1);
}

// I numeri degli indici si aggiornano a ogni esecuzione, anche quando non si manda niente.
await scriviJson(dentro('docs/data/mercati.json'), mercati);

// I titoli del giorno, nudi. Servono alla pagina dei preferiti: per un'azienda
// che il motore non conosce — una che hai aggiunto tu — nessun agente è andato
// a cercare, ma l'app può almeno dire quali titoli di oggi la nominano. È meno
// di un riassunto, ed è detto per quello che è.
await scriviJson(dentro('docs/data/titoli.json'),
  notizie.slice(0, 220).map((n) => ({ t: n.titolo, f: n.fonte, l: n.link })));

if (modo === 'avviso') {
  const stato = await leggiJson(dentro('docs/data/stato.json'), statoVuoto());
  const esito = valutaAvviso({ mercati, notizie, stato, config, adesso });
  await scriviJson(dentro('docs/data/stato.json'), esito.stato);

  if (!esito.inviare) { console.log(`  nessun avviso: ${esito.perche}`); process.exit(0); }

  const r = costruisciReport(mercati, notizie, 'avviso', adesso);
  r.notifica = { titolo: esito.notifica.titolo, corpo: esito.notifica.corpo };
  r.sezioni = [
    { id: 'avviso', titolo: 'Perché ti ho avvisato', testo: esito.evento.corpo },
    ...r.sezioni.filter((s) => s.id === 'perche' || s.id === 'contesto'),
  ];
  r.utente = config.utente || null;
  const az = await aziendeDelGiorno(notizie, 3);
  const link = new Set(az.flatMap((a) => (a.titoli || []).map((t) => t.link)));
  const testi = await arricchisci(notizie.filter((n) => link.has(n.link)), 8);
  r.aziende = await riassumiAziende(riassumiConEstratto(az, testi), testi, process.env, config.agente?.modello, config.agente?.modello_cli);
  r.materialeAgente = testi;
  const controllo = stampaVerifica(verifica({ report: r, mercati, notizie, adesso }));
  if (controllo.blocchi) { console.error('  Non mando l’avviso: i dati non tornano.'); process.exit(1); }

  const { materialeAgente: _m, ...avvisoDaPubblicare } = r;
  await scriviJson(dentro('docs/data/report.json'), avvisoDaPubblicare);
  await scriviJson(dentro(`docs/data/storico/${giornoRoma(adesso)}-avviso-${esito.evento.motivo}.json`), avvisoDaPubblicare);
  await inviaNotifica({ ...r.notifica, tipo: 'avviso' });
  console.log(`  AVVISO inviato: ${esito.evento.motivo} — ${esito.notifica.titolo}`);
  process.exit(0);
}

// Bollettino fisso: mattina o sera, dedotto dall'ora se non specificato.
const richiesto = quale || (minutiDaMezzanotteRoma(adesso) < 13 * 60 ? 'mattina' : 'sera');
const tipo = richiesto === 'mezzogiorno' ? 'mattina' : richiesto;
const archivio = dentro(`docs/data/storico/${giornoRoma(adesso)}-${tipo}.json`);

if (daCalendario) {
  const f = FINESTRE[richiesto];
  const ora = minutiDaMezzanotteRoma(adesso);
  if (f && (ora < inMinuti(f.da) || ora > inMinuti(f.a))) {
    console.log(`  in Italia sono le ${oraItalia(adesso)}: fuori dalla finestra del bollettino ${richiesto} (${f.da}–${f.a}).`);
    process.exit(0);
  }
  // Due appuntamenti coprono ora solare e ora legale: il secondo non deve ripetere il primo.
  if (await leggiJson(archivio)) {
    console.log(`  il bollettino ${tipo} di oggi è già stato pubblicato: non lo rifaccio.`);
    process.exit(0);
  }
}

const report = costruisciReport(mercati, notizie, tipo, adesso);
report.utente = config.utente || null;   // serve all'app per il saluto
// Le aziende: prima si trovano, poi si legge il testo degli articoli che le
// riguardano, poi l'agente scrive il riassunto di ciascuna.
// Chi conta oggi lo decide l'agente, leggendo i titoli del giorno e i dati di
// mercato: così le aziende cambiano con le notizie invece di essere sempre le
// stesse, e ognuna arriva con la riga che dice perché è lì. Se l'agente non c'è
// o non ce la fa, si torna al conteggio delle citazioni: meno sveglio, sempre
// disponibile.
const scelta = await scegliIlGiorno({
  notizie, mercati, conosciute: NOMI_CONOSCIUTI, env: process.env,
  modello: config.agente?.modello, modelloCli: config.agente?.modello_cli,
});
let aziendeTrovate;
if (scelta) {
  aziendeTrovate = await componiAziende(scelta.aziende);
  report.daGuardare = componiIndici(scelta.indici, mercati);
  // Le aziende che si possono seguire: la lista intera, con la notizia di oggi
  // dove c'è. Quali seguire lo decide l'app, sul dispositivo.
  report.radar = await componiRadar(scelta.radar);
} else {
  console.log('  scelta: nessun agente, torno al conteggio delle citazioni nei titoli');
  aziendeTrovate = await aziendeDelGiorno(notizie, config.aziende?.quante ?? 6);
}
const serviranno = new Set(aziendeTrovate.flatMap((a) => (a.titoli || []).map((t) => t.link)));
const conTesto = await arricchisci(notizie.filter((n) => serviranno.has(n.link)), config.agente?.massimo_articoli ?? 20);
// Tre livelli, dal migliore al sempre disponibile: l'agente scrive il riassunto;
// senza chiave si estraggono le frasi vere degli articoli; se non c'è nemmeno il
// testo, resta la frase di base, che lo dichiara.
const conEstratto = riassumiConEstratto(aziendeTrovate, conTesto);
report.aziende = await riassumiAziende(conEstratto, conTesto, process.env, config.agente?.modello, config.agente?.modello_cli);
report.materialeAgente = conTesto;   // serve alla verifica, non viene pubblicato

// Niente esce senza controllo: se un numero scritto non corrisponde ai dati,
// è meglio nessun bollettino che un bollettino falso.
const { blocchi } = stampaVerifica(verifica({ report, mercati, notizie, adesso }));
if (blocchi) {
  console.error(`  Non pubblico: ${blocchi} problem${blocchi === 1 ? 'a' : 'i'} da bloccare.`);
  process.exit(1);
}

const { materialeAgente, ...daPubblicare } = report;
await scriviJson(dentro('docs/data/report.json'), daPubblicare);
await scriviJson(archivio, daPubblicare);

// Un bollettino azzera il contatore degli avvisi del giorno quando cambia la data.
const stato = await leggiJson(dentro('docs/data/stato.json'), statoVuoto());
if (stato.giorno !== giornoRoma(adesso)) await scriviJson(dentro('docs/data/stato.json'), { ...statoVuoto(), giorno: giornoRoma(adesso) });

console.log(`  » ${report.notifica.titolo}\n    ${report.notifica.corpo}`);
const esitoInvio = await inviaNotifica({ ...report.notifica, tipo: 'bollettino' });
if (esitoInvio.inviate > 0) await scriviJson(dentro('docs/data/notificato.json'), { generatoIl: report.generatoIl, quando: new Date().toISOString() });

// Se l'app ha detto qualcosa di sbagliato e la correzione non è ancora stata
// comunicata, parte una notifica a parte. Una sola volta, qualunque sia il numero.
const nuoveCorrezioni = daNotificare(await leggiCorrezioni());
if (nuoveCorrezioni.length) {
  const esito = await inviaNotifica(notificaDi(nuoveCorrezioni));
  // Si segna come notificata solo se è davvero partita: altrimenti una prova
  // in locale, dove le chiavi non ci sono, brucerebbe la correzione in silenzio.
  if (esito.inviate > 0) {
    await segnaNotificate(nuoveCorrezioni.map((c) => c.id));
    console.log(`  correzioni: notificata${nuoveCorrezioni.length > 1 ? 'e ' + nuoveCorrezioni.length : ''}`);
  } else {
    console.log(`  correzioni: ${nuoveCorrezioni.length} in attesa, resta${nuoveCorrezioni.length > 1 ? 'no' : ''} da notificare`);
  }
}

console.log('  fatto.\n');
