// Punto d'ingresso. Due modi:
//   node engine/esegui.mjs bollettino [mattina|sera]   → il bollettino fisso
//   node engine/esegui.mjs avviso                      → controllo del giorno, manda solo se serve

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaMercati } from './mercati.mjs';
import { scaricaNotizie } from './notizie.mjs';
import { costruisciReport } from './report.mjs';
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

// GitHub ragiona in UTC, l'Italia cambia ora due volte l'anno: ogni appuntamento parte
// a due orari diversi e qui si ferma subito quello che non corrisponde.
const attesa = process.env.ORA_ATTESA;
if (attesa) {
  const [h, m] = attesa.split(':').map(Number);
  const scarto = Math.abs(minutiDaMezzanotteRoma(adesso) - (h * 60 + m));
  if (scarto > 35) {
    console.log(`  in Italia sono le ${oraItalia(adesso)}, l'appuntamento è alle ${attesa}: non è questo il turno.`);
    process.exit(0);
  }
}

const [appena, notizie] = await Promise.all([
  scaricaMercati(config.strumenti),
  scaricaNotizie(config.feed),
]);

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
  await scriviJson(dentro('docs/data/report.json'), r);
  await scriviJson(dentro(`docs/data/storico/${giornoRoma(adesso)}-avviso-${esito.evento.motivo}.json`), r);
  await inviaNotifica({ ...r.notifica, tipo: 'avviso' });
  console.log(`  AVVISO inviato: ${esito.evento.motivo} — ${esito.notifica.titolo}`);
  process.exit(0);
}

// Bollettino fisso: mattina o sera, dedotto dall'ora se non specificato.
const tipo = quale || (minutiDaMezzanotteRoma(adesso) < 13 * 60 ? 'mattina' : 'sera');
const report = costruisciReport(mercati, notizie, tipo, adesso);

await scriviJson(dentro('docs/data/report.json'), report);
await scriviJson(dentro(`docs/data/storico/${giornoRoma(adesso)}-${tipo}.json`), report);

// Un bollettino azzera il contatore degli avvisi del giorno quando cambia la data.
const stato = await leggiJson(dentro('docs/data/stato.json'), statoVuoto());
if (stato.giorno !== giornoRoma(adesso)) await scriviJson(dentro('docs/data/stato.json'), { ...statoVuoto(), giorno: giornoRoma(adesso) });

console.log(`  » ${report.notifica.titolo}\n    ${report.notifica.corpo}`);
await inviaNotifica({ ...report.notifica, tipo: 'bollettino' });
console.log('  fatto.\n');
