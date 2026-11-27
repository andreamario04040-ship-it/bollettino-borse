// Verifica un bollettino già pubblicato, senza rigenerare niente.
//   npm run verifica                      → quello in vetrina adesso
//   npm run verifica 2026-11-27-mattina   → uno qualsiasi dell'archivio
//
// Il controllo serio è quello che gira mentre il bollettino si scrive: lì ci
// sono sotto mano i titoli di quel momento, i prezzi di quel momento e il testo
// degli articoli che l'agente ha letto. Qui, dopo, di quelle tre cose se ne può
// ricostruire una sola: gli articoli, riscaricandoli dai link che il bollettino
// stesso cita. È la più importante — è la difesa contro le cifre inventate —
// ma le altre due si dichiarano saltate invece di far finta.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifica, stampaVerifica } from './verifica.mjs';
import { arricchisci } from './articoli.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
const leggi = async (f) => JSON.parse(await fs.readFile(path.join(radice, f), 'utf8'));

const quale = process.argv[2];
const file = quale ? `docs/data/storico/${quale.replace(/\.json$/, '')}.json` : 'docs/data/report.json';

let report;
try { report = await leggi(file); } catch {
  console.error(`\n  Non trovo ${file}.`);
  if (quale) {
    const archivio = await fs.readdir(path.join(radice, 'docs/data/storico')).catch(() => []);
    console.error(`  Nell'archivio ci sono: ${archivio.slice(-6).map((f) => f.replace('.json', '')).join(', ') || 'niente'}\n`);
  }
  process.exit(1);
}
const mercati = await leggi('docs/data/mercati.json');

console.log(`\n▸ Controllo il bollettino ${report.tipo} del ${report.data}, ore ${report.ora}\n`);

// Gli articoli che il bollettino cita, uno per link: sono quelli che l'agente
// ha letto, e ogni cifra delle sue schede deve stare lì dentro.
const visti = new Set();
const citati = [];
for (const a of report.aziende || []) {
  for (const t of a.titoli || []) {
    if (!t.link || visti.has(t.link)) continue;
    visti.add(t.link);
    citati.push(t);
  }
}

if (citati.length) {
  report.materialeAgente = await arricchisci(citati, 30);
  const vuoti = report.materialeAgente.filter((m) => !m.testo);
  // Un articolo che oggi non si apre più non è una cifra inventata: senza
  // questa riga le sue schede verrebbero accusate di qualcosa che non hanno fatto.
  if (vuoti.length) {
    console.log(`  ${vuoti.length} articol${vuoti.length === 1 ? 'o non si apre' : 'i non si aprono'} più: le cifre che venivano da lì non si possono controllare.`);
    for (const v of vuoti) console.log(`    · ${v.fonte}: ${v.titolo.slice(0, 70)}`);
  }
  console.log();
} else {
  console.log('  Il bollettino non cita nessun articolo: niente da riscaricare.\n');
}

const { blocchi } = stampaVerifica(verifica({
  report, mercati, notizie: [], adesso: new Date(report.generatoIl), tardivo: true,
}));
console.log();
process.exit(blocchi ? 1 : 0);
