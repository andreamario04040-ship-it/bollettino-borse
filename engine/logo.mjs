// Il logo di un'azienda, scaricato una volta e tenuto in docs/loghi/.
//
// Serve perché le aziende non sono più un elenco fisso: l'agente ne sceglie di
// nuove ogni giorno, e di quelle il logo non c'è ancora. Si scarica qui, sul
// Mac, e finisce nel repository: nessuno impara quali aziende guardi aprendo
// l'app, perché il browser non chiede niente a nessuno.
//
// Se non riesce non è un problema: l'app mostra l'iniziale al suo posto.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const esegui = promisify(execFile);
export const CARTELLA = path.join(fileURLToPath(new URL('..', import.meta.url)), 'docs/loghi');

export async function esisteLogo(nomeFile) {
  try { await fs.access(path.join(CARTELLA, `${nomeFile}.png`)); return true; } catch { return false; }
}

export async function scaricaLogo(nomeFile, dominio) {
  if (!nomeFile || !dominio) return false;
  if (await esisteLogo(nomeFile)) return true;

  const destinazione = path.join(CARTELLA, `${nomeFile}.png`);
  const grezzo = path.join(CARTELLA, `${nomeFile}.grezzo`);
  try {
    const r = await fetch(`https://icons.duckduckgo.com/ip3/${dominio}.ico`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return false;          // l'icona vuota di chi non ne ha una

    await fs.mkdir(CARTELLA, { recursive: true });
    await fs.writeFile(grezzo, buf);
    // sips normalizza qualunque formato in un PNG di 64 pixel. Esiste solo su
    // macOS: fuori da qui il logo si salta, e si vede l'iniziale.
    await esegui('sips', ['-s', 'format', 'png', '-z', '64', '64', grezzo, '--out', destinazione]);
    return true;
  } catch {
    return false;
  } finally {
    await fs.unlink(grezzo).catch(() => {});
  }
}
