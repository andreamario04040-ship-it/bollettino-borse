// Semina lo storico delle chiusure, da eseguire una volta da una connessione di casa:
// Yahoo rifiuta le richieste dei data center, quindi questo non può farlo GitHub.
//   npm run storico

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { daYahoo } from './mercati.mjs';
import { serieVuota, sostituisciSerie, quantiPunti } from './serie.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
const file = path.join(radice, 'docs/data/serie.json');
const config = JSON.parse(await fs.readFile(path.join(radice, 'config.json'), 'utf8'));

let serie = serieVuota();
try { serie = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* prima volta */ }

console.log(`\n▸ Semino lo storico di ${config.strumenti.length} strumenti da Yahoo Finance…`);
const presi = await daYahoo(config.strumenti.map((s) => s.sym));

if (!presi.size) {
  console.error('\n  Yahoo non ha risposto. Succede se hai fatto molte richieste di recente:');
  console.error('  aspetta una decina di minuti e riprova. Serve una connessione di casa,');
  console.error('  non una VPN aziendale o un server.\n');
  process.exit(1);
}

let aggiunti = 0;
for (const [sym, d] of presi) {
  if (!d.timestamp?.length || !d.chiusure?.length) continue;
  const punti = d.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), d.chiusure[i]])
    .filter(([, c]) => c != null);
  sostituisciSerie(serie, sym, punti);
  aggiunti++;
}

await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, JSON.stringify(serie));

const q = quantiPunti(serie);
const peso = (await fs.stat(file)).size;
console.log(`\n  ${aggiunti} strumenti seminati, ${q.simboli} in archivio.`);
console.log(`  Sedute conservate: da ${q.minimo} a ${q.massimo} per strumento.`);
console.log(`  File: docs/data/serie.json (${Math.round(peso / 1024)} KB)\n`);
console.log('  Ora caricalo con: git add docs/data/serie.json && git commit -m "Storico" && git push\n');
