// Controlla che ogni fonte si faccia leggere davvero, senza abbonamento.
//   npm run fonti
//
// Perché esiste: un titolo che entra nel bollettino e poi non si può aprire è
// peggio di un titolo che non entra. Le schede delle aziende finivano per dire
// "l'articolo non si è potuto leggere", e chi legge non sapeva se la notizia
// fosse povera o il giornale chiuso. Misurato il 26/11/2026, tre fonti su otto
// davano zero articoli leggibili su quattro: Financial Times, Investing.com,
// MarketWatch. Questo script serve a riaccorgersene quando cambierà qualcosa,
// perché i giornali chiudono i battenti senza avvisare.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaNotizie } from './notizie.mjs';
import { scaricaArticolo } from './articoli.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
const QUANTI = Number(process.argv.find((x) => /^\d+$/.test(x)) || 4);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const config = JSON.parse(await fs.readFile(path.join(radice, 'config.json'), 'utf8'));

console.log(`\n▸ Provo ${config.feed.length} fonti, ${QUANTI} articoli ciascuna.\n`);
const notizie = await scaricaNotizie(config.feed);

const perFonte = new Map();
for (const n of notizie) {
  if (!perFonte.has(n.fonte)) perFonte.set(n.fonte, []);
  perFonte.get(n.fonte).push(n);
}

console.log('fonte                   titoli   leggibili   lettere   esito');
console.log('─'.repeat(62));

const muri = [], mute = [];
for (const f of config.feed) {
  const lista = perFonte.get(f.fonte) || [];
  if (!lista.length) {
    console.log(`${f.fonte.padEnd(24)}${String(0).padStart(6)}${'—'.padStart(12)}${'—'.padStart(10)}   feed muto`);
    mute.push(f.fonte);
    continue;
  }
  const campione = lista.slice(0, QUANTI);
  let ok = 0, lettere = 0;
  for (const n of campione) {
    const t = await scaricaArticolo(n.link);
    if (t) { ok++; lettere += t.length; }
    await pausa(400);
  }
  const quota = ok / campione.length;
  const esito = quota >= 0.75 ? 'si legge' : quota > 0 ? 'a volte' : 'MURO';
  if (quota === 0) muri.push(f.fonte);
  console.log(`${f.fonte.padEnd(24)}${String(lista.length).padStart(6)}${String(`${ok}/${campione.length}`).padStart(12)}${String(ok ? Math.round(lettere / ok) : 0).padStart(10)}   ${esito}`);
}

console.log('');
if (!muri.length && !mute.length) {
  console.log('  ✓ tutte le fonti si fanno leggere. Niente da cambiare.\n');
} else {
  for (const m of mute) console.log(`  ✗ ${m}: il feed non risponde più o ha cambiato indirizzo.`);
  for (const m of muri) console.log(`  ✗ ${m}: nessun articolo leggibile — va sostituita in config.json, voce "feed".`);
  console.log('\n  Un titolo che non si può aprire non serve a niente: meglio una fonte in meno.\n');
  process.exitCode = 1;
}
