// Scarica una volta il logo di ogni azienda e lo salva in docs/loghi/.
//   npm run loghi
//
// Si scaricano invece di collegarli a ogni apertura per tre motivi: il servizio
// che li fornisce limita le richieste, l'app resta più veloce, e nessuno impara
// quali aziende guardi aprendo l'app.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AZIENDE, slug } from './aziende.mjs';

const esegui = promisify(execFile);
const radice = fileURLToPath(new URL('..', import.meta.url));
const cartella = path.join(radice, 'docs/loghi');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.mkdir(cartella, { recursive: true });
const soloMancanti = !process.argv.includes('--tutti');

let presi = 0, saltati = 0, falliti = [];
for (const a of AZIENDE) {
  if (!a.dominio) continue;
  const nome = slug(a.nome);
  const destinazione = path.join(cartella, `${nome}.png`);

  if (soloMancanti) {
    try { await fs.access(destinazione); saltati++; continue; } catch { /* da scaricare */ }
  }

  try {
    const r = await fetch(`https://icons.duckduckgo.com/ip3/${a.dominio}.ico`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) throw new Error('immagine vuota');

    const grezzo = path.join(cartella, `${nome}.grezzo`);
    await fs.writeFile(grezzo, buf);
    // sips normalizza qualunque formato in un PNG di 64 pixel.
    await esegui('sips', ['-s', 'format', 'png', '-z', '64', '64', grezzo, '--out', destinazione]);
    await fs.unlink(grezzo);
    presi++;
    console.log(`  ✓ ${a.nome}`);
  } catch (e) {
    falliti.push(`${a.nome} (${a.dominio}): ${e.message}`);
  }
  await pausa(1400);   // con calma: il servizio limita chi insiste
}

console.log(`\n  scaricati ${presi}, già presenti ${saltati}, non riusciti ${falliti.length}`);
for (const f of falliti) console.log(`  ✗ ${f}`);
console.log(`\n  Le aziende senza logo mostrano l'iniziale al suo posto: l'app funziona lo stesso.`);
console.log(`  Per riprovare quelle mancanti basta rilanciare; "--tutti" riscarica anche le altre.\n`);
