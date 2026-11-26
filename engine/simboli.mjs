// Controlla che ogni codice di borsa del dizionario sia davvero di quell'azienda.
//   npm run simboli
//
// Perché esiste: nessuno guarda novantotto quotazioni una per una, e un codice
// scritto male non dà un errore — dà il prezzo di un'altra società, che è molto
// peggio. Qui si chiede alla borsa come si chiama ciò che risponde, e lo si
// confronta col nome che gli diamo noi. Dove in borsa il nome è un altro — AMD
// è «Advanced Micro Devices», BMW è «Bayerische Motoren Werke» — il dizionario
// lo dichiara nel campo `nomeBorsa`.

import { AZIENDE, stessoNome } from './aziende.mjs';
import { quotazioniCnbc } from './cnbc.mjs';

const conCodice = AZIENDE.filter((a) => a.cnbc);
const senzaCodice = AZIENDE.filter((a) => !a.cnbc);

const prezzi = new Map();
for (let i = 0; i < conCodice.length; i += 20) {
  const parte = conCodice.slice(i, i + 20).map((a) => a.cnbc);
  try { for (const [k, v] of await quotazioniCnbc(parte)) prezzi.set(k, v); }
  catch (e) { console.error(`  ! blocco non arrivato: ${e.message}`); }
}

const sbagliati = [];
for (const a of conCodice) {
  const q = prezzi.get(a.cnbc);
  if (!q) { sbagliati.push([a, a.cnbc, 'la borsa non risponde']); continue; }
  const combacia = stessoNome(q.nome || '', a.nome) || (a.nomeBorsa && stessoNome(q.nome || '', a.nomeBorsa));
  if (!combacia) sbagliati.push([a, a.cnbc, `risponde «${q.nome}»`]);
}

console.log(`\n▸ ${conCodice.length} codici provati, ${senzaCodice.length} aziende senza codice.\n`);
if (!sbagliati.length) {
  console.log('  ✓ ogni codice è dell’azienda giusta.\n');
} else {
  for (const [a, c, perche] of sbagliati) console.log(`  ✗ ${a.nome.padEnd(22)} ${c.padEnd(12)} ${perche}`);
  console.log('\n  Correggi il codice in engine/aziende.mjs, oppure aggiungi "nomeBorsa" se in');
  console.log('  borsa quell’azienda si chiama in un altro modo. Un codice che resta sbagliato');
  console.log('  non rompe niente — il controllo lo scarta e l’azienda resta senza prezzo.\n');
  process.exitCode = 1;
}
if (senzaCodice.length) console.log(`  Senza quotazione: ${senzaCodice.map((a) => a.nome).join(', ')}\n`);
