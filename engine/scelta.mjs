// Chi decide cosa conta oggi.
//
// Prima di questo file la scelta era meccanica: un dizionario di quaranta
// aziende, un'espressione regolare per ciascuna, un punteggio per quante volte
// il nome compariva nei titoli, massimo due per settore. Il risultato era
// prevedibile in tutti i sensi: tornavano sempre gli stessi nomi, e bastava una
// citazione di passaggio — "Intesa saliva del 2,78%" dentro un riepilogo di
// Piazza Affari — per guadagnarsi una scheda in cui non c'era niente da dire.
//
// Qui invece i titoli del giorno e i dati di mercato vengono letti, e si
// risponde a una domanda che un conteggio non può porsi: oggi, di questa
// azienda, è successo qualcosa che vale la pena sapere? E quale indice, oggi,
// sta dicendo qualcosa?
//
// Il dizionario resta, ma cambia mestiere: non è più il cancello che decide chi
// entra, è l'anagrafica di chi è entrato — ticker, settore, logo.

import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { num, pct, taglia } from './lingua.mjs';

const MODELLO_API = 'claude-opus-5-5';
const MODELLO_CLI = 'sonnet';
const ATTESA_CLI_MS = 6 * 60 * 1000;
const MASSIMO_TITOLI = 140;

const SISTEMA = `Scegli di cosa parlerà oggi il bollettino finanziario di una persona che sta imparando a informarsi sui mercati. Ti arrivano i titoli di giornale di oggi, numerati, e i dati di mercato di oggi.

Il tuo compito non è riassumere: è DECIDERE. Cosa, oggi, vale il tempo di chi legge.

AZIENDE — scegline da 3 a 6, in ordine di importanza, la più importante per prima.

Perché un'azienda entra: oggi le è successo qualcosa. Ha pubblicato i conti, ha presentato un prodotto, è dentro un'acquisizione, un'autorità l'ha colpita, ha annunciato un investimento, ha perso o guadagnato molto per una ragione che i giornali spiegano.

Perché un'azienda NON entra, e questa è la parte che conta:
- è famosa. La fama non è una notizia.
- è nominata di passaggio in un riepilogo di borsa, in mezzo all'elenco dei titoli che salgono o scendono. Che una banca sia salita del 2% in una giornata in cui è salito tutto il listino non è un fatto suo.
- è salita o scesa senza che nessuno spieghi perché. Un movimento senza causa raccontata non è una notizia, è un numero.
- c'era anche ieri e non è successo niente di nuovo.

Se oggi solo tre aziende hanno davvero qualcosa, scegline tre. Un elenco di sei nomi di cui due pieni di niente è peggio di tre pieni. E non riempire con un solo settore se la giornata ne offre di più.

Per ciascuna:
- "nome": come la chiamerebbe un giornale italiano. Il gruppo, non il marchio: PDD, non Temu.
- "perche": UNA frase breve, al massimo 140 caratteri, che dice il fatto di oggi — con la cifra, se c'è. È la riga che spiega a chi legge perché deve fermarsi qui. Non "è fra i nomi più citati", non "è sotto i riflettori": il fatto.
- "titoli": i numeri dei titoli che riguardano questa azienda, quelli veri, al massimo tre.
- "settore": due o tre parole, nello stile "Italia · Banche", "Cina · Auto", "Semiconduttori".
- "fa": di cosa vive l'azienda, in mezza riga. Viene stampata subito dopo il nome, quindi DEVE cominciare con un verbo alla terza persona singolare e non deve ripetere il nome. Si legge così: "Nvidia · fa i chip su cui gira quasi tutta l'intelligenza artificiale", "Sanofi · produce farmaci e vaccini", "Poundland · gestisce una catena di negozi a prezzi bassi nel Regno Unito". Scrivere "farmaci e vaccini, con sede in Francia" è sbagliato: letto dopo il nome non è una frase.
- "simboli": da zero a due codici con cui il titolo potrebbe essere scambiato, dal più probabile ("NVDA", "SAN-FR" per Parigi, "DBK-DE" per Francoforte, "ISP.MI-IT" per Milano). Verranno controllati uno per uno: si usa il primo a cui la borsa risponde col nome di questa azienda, e se nessuno risponde non si mostra nessun prezzo. Quindi puoi provare, ma non inventare: lista vuota se non ne hai idea, o se l'azienda non è quotata.
- "dominio": il sito ufficiale dell'azienda, solo se ne sei certo ("sanofi.com", "dell.com"), per prendere il logo. null se hai dubbi. Verrà controllato che contenga il nome dell'azienda.

INDICI — scegline da 2 a 4, fra quelli dell'elenco che ti do, in ordine di importanza.

Scegli quelli che oggi stanno dicendo qualcosa: si sono mossi più del solito, o una notizia li spiega, o il loro livello è in sé la notizia. Non quelli che stanno fermi.
- "nome": copiato esattamente dall'elenco, carattere per carattere.
- "perche": UNA frase breve, al massimo 140 caratteri, che lega il numero di oggi a quello che sta succedendo.

REGOLE SU TUTTO
1. Scrivi soltanto fatti che stanno nei titoli o nei dati che ti ho dato. Non aggiungere nulla che ricordi da altrove: chi legge non può distinguere ciò che hai letto oggi da ciò che ricordi, e un ricordo vecchio diventa una bugia.
2. Copia le cifre esattamente come le trovi. Non costruire intervalli e non arrotondare: se il materiale dice 110 punti scrivi 110, non "circa 108-110".
3. Italiano semplice. Niente gergo da operatori.
4. Non dire mai se comprare o vendere, e non prevedere il futuro.`;

const Schema = z.object({
  aziende: z.array(z.object({
    nome: z.string(),
    perche: z.string(),
    titoli: z.array(z.number()),
    settore: z.string(),
    fa: z.string(),
    simboli: z.array(z.string()),
    dominio: z.string().nullable(),
  })),
  indici: z.array(z.object({ nome: z.string(), perche: z.string() })),
});

const SCHEMA_JSON = {
  type: 'object',
  properties: {
    aziende: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome dell’azienda come la chiamerebbe un giornale italiano' },
          perche: { type: 'string', description: 'Una frase breve, max 140 caratteri, col fatto di oggi' },
          titoli: { type: 'array', items: { type: 'number' }, description: 'Numeri dei titoli che la riguardano, max 3' },
          settore: { type: 'string' },
          fa: { type: 'string', description: 'Di cosa vive l’azienda: comincia con un verbo alla terza persona, senza ripetere il nome' },
          simboli: { type: 'array', items: { type: 'string' }, description: 'Da zero a due codici di borsa possibili, verranno controllati' },
          dominio: { type: ['string', 'null'], description: 'Sito ufficiale per il logo, oppure null' },
        },
        required: ['nome', 'perche', 'titoli', 'settore', 'fa', 'simboli', 'dominio'],
        additionalProperties: false,
      },
    },
    indici: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Copiato esattamente dall’elenco fornito' },
          perche: { type: 'string', description: 'Una frase breve, max 140 caratteri' },
        },
        required: ['nome', 'perche'],
        additionalProperties: false,
      },
    },
  },
  required: ['aziende', 'indici'],
  additionalProperties: false,
};

// ───────────────────────────────  il materiale  ───────────────────────────────

function materiale(notizie, mercati) {
  const usabili = notizie.slice(0, MASSIMO_TITOLI);
  const righe = usabili.map((n, i) => {
    const s = n.sommario ? `\n    ${taglia(n.sommario, 300)}` : '';
    return `[${i + 1}] (${n.fonte}) ${n.titolo}${s}`;
  });

  const dati = mercati.filter((m) => m.prezzo != null).map((m) => {
    const pezzi = [`${m.nome}: ${num(m.prezzo, m.decimali ?? 2)}`, `oggi ${pct(m.giorno)}`];
    if (m.settimana != null) pezzi.push(`settimana ${pct(m.settimana)}`);
    if (m.mese != null) pezzi.push(`mese ${pct(m.mese)}`);
    if (m.anno != null) pezzi.push(`da inizio anno ${pct(m.anno)}`);
    if (m.obsoleto) pezzi.push('(valore di ieri: oggi non è arrivato)');
    return `  ${pezzi.join(' · ')}`;
  });

  return { usabili, testo: `=== TITOLI DI OGGI ===\n${righe.join('\n')}\n\n=== DATI DI MERCATO DI OGGI ===\n${dati.join('\n')}` };
}

// ─────────────────────────────────  i motori  ─────────────────────────────────

async function viaApi(testo, chiave, modello) {
  const client = new Anthropic({ apiKey: chiave });
  const r = await client.messages.parse({
    model: modello,
    max_tokens: 8000,
    system: SISTEMA,
    output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
    messages: [{ role: 'user', content: testo }],
  });
  if (r.stop_reason === 'refusal') throw new Error('richiesta rifiutata');
  return r.parsed_output;
}

function sbusta(x) {
  const t = String(x).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

function viaCli(testo, comando, modello, env) {
  const argomenti = [
    '--print', '--model', modello, '--system-prompt', SISTEMA,
    '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA_JSON),
    '--disallowed-tools', 'Bash Edit Write Read WebFetch WebSearch Task Glob Grep NotebookEdit TodoWrite',
    '--strict-mcp-config',
  ];
  const ambiente = { ...env };
  delete ambiente.ANTHROPIC_API_KEY;

  return new Promise((risolvi, rifiuta) => {
    const p = spawn(comando, argomenti, { env: ambiente, cwd: process.env.TMPDIR || '/tmp', stdio: ['pipe', 'pipe', 'pipe'] });
    let fuori = '', errori = '', chiuso = false;
    const orologio = setTimeout(() => { if (!chiuso) p.kill('SIGKILL'); }, ATTESA_CLI_MS);
    p.stdout.on('data', (d) => { fuori += d; });
    p.stderr.on('data', (d) => { errori += d; });
    p.on('error', (e) => { chiuso = true; clearTimeout(orologio); rifiuta(e); });
    p.on('close', () => {
      chiuso = true; clearTimeout(orologio);
      const busta = sbusta(fuori);
      if (!busta) return rifiuta(new Error(errori.trim().split('\n')[0] || 'risposta illeggibile'));
      if (busta.is_error) return rifiuta(new Error(String(busta.result || '').split('\n')[0]));
      const c = sbusta(busta.result ?? '');
      if (!c) return rifiuta(new Error('risposta non nel formato richiesto'));
      risolvi(c);
    });
    p.stdin.on('error', () => {});
    p.stdin.end(testo);
  });
}

// ──────────────────────────────  la scelta vera  ──────────────────────────────

export async function scegliIlGiorno({ notizie, mercati, env = process.env, modello, modelloCli }) {
  if (!notizie?.length) return null;
  const { usabili, testo } = materiale(notizie, mercati);

  let scelta = null;
  const avvio = Date.now();
  if (env.ANTHROPIC_API_KEY) {
    try { scelta = await viaApi(testo, env.ANTHROPIC_API_KEY, modello || MODELLO_API); }
    catch (e) { console.error(`  ! scelta: chiave API — ${e.message}`); }
  }
  if (!scelta && env.AGENTE_CLI) {
    const comando = env.AGENTE_CLI === '1' || env.AGENTE_CLI === 'true' ? 'claude' : env.AGENTE_CLI;
    try { scelta = await viaCli(testo, comando, modelloCli || MODELLO_CLI, env); }
    catch (e) {
      console.error(`  ! scelta: \`claude\` — ${e.message}`);
      if (/authenticate|login|token/i.test(e.message)) console.error('    serve ricollegare l’abbonamento:  claude setup-token');
    }
  }
  if (!scelta?.aziende?.length) return null;

  const secondi = Math.round((Date.now() - avvio) / 1000);

  // I titoli li indica per numero: si riportano agli articoli veri, e un numero
  // fuori elenco si butta invece di far finta che esista.
  const aziende = scelta.aziende.slice(0, 7).map((a) => ({
    nome: String(a.nome || '').trim(),
    perche: taglia(String(a.perche || '').trim(), 200),
    settore: String(a.settore || '').trim() || 'Azienda',
    fa: String(a.fa || '').trim(),
    simboli: (Array.isArray(a.simboli) ? a.simboli : [])
      .map((x) => String(x || '').trim()).filter(Boolean).slice(0, 2),
    dominio: a.dominio ? String(a.dominio).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null,
    titoli: [...new Set(a.titoli || [])]
      .map((i) => usabili[Number(i) - 1])
      .filter(Boolean)
      .slice(0, 3),
  })).filter((a) => a.nome && a.titoli.length);

  const indici = (scelta.indici || []).slice(0, 4).map((x) => ({
    nome: String(x.nome || '').trim(),
    perche: taglia(String(x.perche || '').trim(), 200),
  })).filter((x) => x.nome && x.perche);

  console.log(`  scelta: ${aziende.length} aziende e ${indici.length} indici, decisi dall’agente in ${secondi} s`);
  return { aziende, indici };
}
