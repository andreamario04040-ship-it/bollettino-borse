// Scarica una volta il logo di ogni azienda e lo salva in docs/loghi/.
//   npm run loghi
//
// Si scaricano invece di collegarli a ogni apertura per tre motivi: il servizio
// che li fornisce limita le richieste, l'app resta più veloce, e nessuno impara
// quali aziende guardi aprendo l'app.

import fs from 'node:fs/promises';
import path from 'node:path';
import { AZIENDE, slug } from './aziende.mjs';
import { CARTELLA as cartella, esisteLogo, scaricaLogo } from './logo.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.mkdir(cartella, { recursive: true });
const soloMancanti = !process.argv.includes('--tutti');

let presi = 0, saltati = 0, falliti = [];
for (const a of AZIENDE) {
  if (!a.dominio) continue;
  const nome = slug(a.nome);
  const destinazione = path.join(cartella, `${nome}.png`);

  if (soloMancanti && await esisteLogo(nome)) { saltati++; continue; }
  if (!soloMancanti) await fs.unlink(destinazione).catch(() => {});

  if (await scaricaLogo(nome, a.dominio)) { presi++; console.log(`  ✓ ${a.nome}`); }
  else falliti.push(`${a.nome} (${a.dominio})`);
  await pausa(1400);   // con calma: il servizio limita chi insiste
}

console.log(`\n  scaricati ${presi}, già presenti ${saltati}, non riusciti ${falliti.length}`);
for (const f of falliti) console.log(`  ✗ ${f}`);
console.log(`\n  Le aziende senza logo mostrano l'iniziale al suo posto: l'app funziona lo stesso.`);
console.log(`  Per riprovare quelle mancanti basta rilanciare; "--tutti" riscarica anche le altre.\n`);
