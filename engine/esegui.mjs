// Punto d'ingresso. Due modi:
//   node engine/esegui.mjs bollettino [mattina|sera]   → il bollettino fisso
//   node engine/esegui.mjs avviso                      → controllo del giorno, manda solo se serve

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaMercati } from './mercati.mjs';
import { serieVuota } from './serie.mjs';
import { scaricaNotizie } from './notizie.mjs';
import { costruisciReport } from './report.mjs';
import { aziendeDelGiorno } from './aziende.mjs';
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
  sera: { da: '17:30', a: '21:30' },
};
const inMinuti = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const daCalendario = !!process.env.DA_CALENDARIO;

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
  r.aziende = await aziendeDelGiorno(notizie, 3);
  await scriviJson(dentro('docs/data/report.json'), r);
  await scriviJson(dentro(`docs/data/storico/${giornoRoma(adesso)}-avviso-${esito.evento.motivo}.json`), r);
  await inviaNotifica({ ...r.notifica, tipo: 'avviso' });
  console.log(`  AVVISO inviato: ${esito.evento.motivo} — ${esito.notifica.titolo}`);
  process.exit(0);
}

// Bollettino fisso: mattina o sera, dedotto dall'ora se non specificato.
const tipo = quale || (minutiDaMezzanotteRoma(adesso) < 13 * 60 ? 'mattina' : 'sera');
const archivio = dentro(`docs/data/storico/${giornoRoma(adesso)}-${tipo}.json`);

if (daCalendario) {
  const f = FINESTRE[tipo];
  const ora = minutiDaMezzanotteRoma(adesso);
  if (f && (ora < inMinuti(f.da) || ora > inMinuti(f.a))) {
    console.log(`  in Italia sono le ${oraItalia(adesso)}: fuori dalla finestra del bollettino ${tipo} (${f.da}–${f.a}).`);
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
report.aziende = await aziendeDelGiorno(notizie, config.aziende?.quante ?? 6);

await scriviJson(dentro('docs/data/report.json'), report);
await scriviJson(archivio, report);

// Un bollettino azzera il contatore degli avvisi del giorno quando cambia la data.
const stato = await leggiJson(dentro('docs/data/stato.json'), statoVuoto());
if (stato.giorno !== giornoRoma(adesso)) await scriviJson(dentro('docs/data/stato.json'), { ...statoVuoto(), giorno: giornoRoma(adesso) });

console.log(`  » ${report.notifica.titolo}\n    ${report.notifica.corpo}`);
await inviaNotifica({ ...report.notifica, tipo: 'bollettino' });
console.log('  fatto.\n');
