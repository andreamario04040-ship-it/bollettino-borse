// Le correzioni degli errori dell'app.
//
// Quando si scopre che il bollettino ha detto una cosa sbagliata, non basta
// sistemare il codice: chi l'ha letta merita di saperlo. Ogni correzione finisce
// qui, viene notificata una volta sola e resta visibile nell'app per qualche giorno.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { giornoRoma } from './lingua.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));
export const FILE = path.join(radice, 'docs/data/correzioni.json');

export async function leggiCorrezioni() {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { return { correzioni: [] }; }
}

export async function scriviCorrezioni(dati) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(dati, null, 2));
}

export async function aggiungiCorrezione({ titolo, sbagliato, corretto, data }) {
  const dati = await leggiCorrezioni();
  const giorno = data || giornoRoma(new Date());
  const base = `${giorno}-${titolo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  let id = base, n = 2;
  while (dati.correzioni.some((c) => c.id === id)) id = `${base}-${n++}`;

  dati.correzioni.unshift({ id, data: giorno, titolo, sbagliato, corretto, notificata: false });
  await scriviCorrezioni(dati);
  return id;
}

export const daNotificare = (dati) => (dati.correzioni || []).filter((c) => !c.notificata);

export async function segnaNotificate(ids) {
  const dati = await leggiCorrezioni();
  for (const c of dati.correzioni) if (ids.includes(c.id)) c.notificata = true;
  await scriviCorrezioni(dati);
}

// Il testo della notifica dedicata.
export function notificaDi(correzioni) {
  const titolo = 'Ho fatto un errore';
  const corpo = correzioni.length === 1
    ? `${correzioni[0].titolo}. Apri l'app: ti spiego cosa avevo sbagliato e com'è adesso.`
    : `${correzioni.length} correzioni. Apri l'app: ti spiego cosa avevo sbagliato e com'è adesso.`;
  return { titolo, corpo, tipo: 'correzione' };
}
