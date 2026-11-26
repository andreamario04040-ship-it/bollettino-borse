// Verifica il bollettino già pubblicato, senza rigenerare niente.
//   npm run verifica
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifica, stampaVerifica } from './verifica.mjs';
import { scaricaNotizie } from './notizie.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
const leggi = async (f) => JSON.parse(await fs.readFile(path.join(radice, f), 'utf8'));

const config = await leggi('config.json');
const report = await leggi('docs/data/report.json');
const mercati = await leggi('docs/data/mercati.json');

console.log(`\n▸ Controllo il bollettino ${report.tipo} del ${report.data}, ore ${report.ora}\n`);
const notizie = await scaricaNotizie(config.feed);
const { blocchi } = stampaVerifica(verifica({ report, mercati, notizie, adesso: new Date(report.generatoIl) }));
console.log();
process.exit(blocchi ? 1 : 0);
