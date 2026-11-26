// L'agente che legge gli articoli e scrive il riassunto di ogni azienda.
//
// Prima di questo, la scheda di un'azienda diceva frasi preconfezionate scelte
// da espressioni regolari: "è fra i nomi più citati di oggi". Non era un
// riassunto, era un riempitivo. Qui il materiale della giornata — titoli e testo
// degli articoli — viene letto davvero e trasformato in un resoconto.
//
// Due motori, provati in quest'ordine:
//
//   1. la chiave API (ANTHROPIC_API_KEY). Si paga a consumo, funziona anche in
//      cloud, quindi è l'unica strada su GitHub.
//   2. il programma `claude` da riga di comando, che usa l'abbonamento Claude
//      già pagato. Gira solo sul Mac di casa, e non costa niente in più.
//
// Se non c'è nessuno dei due, le schede restano all'estratto (le frasi vere
// degli articoli, scelte senza intelligenza artificiale): il bollettino esce
// comunque, e dice con quale dei tre livelli è stato scritto.

import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { pct, num } from './lingua.mjs';

const MODELLO_API = 'claude-opus-5-5';
// Con l'abbonamento il tetto d'uso è a consumo di messaggi, non di euro:
// per riassumere testo già fornito Sonnet basta e lascia margine alla giornata.
const MODELLO_CLI = 'sonnet';
const ATTESA_CLI_MS = 6 * 60 * 1000;

const Schema = z.object({
  aziende: z.array(z.object({
    nome: z.string().describe('Il nome dell’azienda, identico a come è stato fornito'),
    riassunto: z.string().describe(
      'Da tre a sei frasi che raccontano cosa è successo oggi a questa azienda, con i fatti concreti letti negli articoli: cifre, decisioni, prodotti, conti, autorità. Italiano semplice.'),
    materiale_scarso: z.boolean().describe(
      'true se gli articoli forniti non bastano a dire cosa è successo davvero'),
  })),
});

// Lo stesso contratto, nella forma che vuole il programma da riga di comando.
const SCHEMA_JSON = {
  type: 'object',
  properties: {
    aziende: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Il nome dell’azienda, identico a come è stato fornito' },
          riassunto: { type: 'string', description: 'Da tre a sei frasi su cosa è successo oggi a questa azienda, con i fatti concreti letti negli articoli. Italiano semplice.' },
          materiale_scarso: { type: 'boolean', description: 'true se gli articoli non bastano a dire cosa è successo davvero' },
        },
        required: ['nome', 'riassunto', 'materiale_scarso'],
        additionalProperties: false,
      },
    },
  },
  required: ['aziende'],
  additionalProperties: false,
};

const SISTEMA = `Scrivi il bollettino finanziario quotidiano di una persona che sta imparando a informarsi sui mercati. Non è un esperto: capisce le cose se gliele spieghi, non se gliele dai per scontate.

Per ogni azienda scrivi cosa è successo OGGI, raccontando i fatti concreti che trovi nel materiale: cifre, decisioni, prodotti nuovi, conti pubblicati, mosse delle autorità, acquisizioni. Chi legge deve sapere cosa è successo senza dover aprire nessun articolo.

REGOLE, in ordine di importanza.

1. Scrivi SOLTANTO fatti presenti nel materiale che ti do. Non aggiungere nulla che ricordi da altrove, nemmeno se sei sicuro che sia vero: il lettore non può distinguere ciò che hai letto oggi da ciò che ricordi, e un ricordo vecchio diventa una bugia.
2. Copia i numeri esattamente come li trovi. Non arrotondare, non convertire, non stimare.
3. Se il materiale non basta a dire cosa è successo, scrivilo apertamente — "i giornali citano l'azienda senza spiegare perché" — e segna materiale_scarso a true. È molto meglio di una frase vaga che finge di informare.
4. Italiano semplice e diretto. Se usi un termine tecnico, spiegalo in mezza riga dentro la frase. Niente gergo da operatori: niente "rally", "sell-off", "guidance" senza spiegazione.
5. Ogni azienda si racconta col materiale che sta sotto il suo nome. Il quadro generale del mercato entra solo se serve a spiegare quell'azienda, e detto in una riga. Non mettere nella scheda di un'azienda i fatti di un'altra, né quelli delle banche centrali o della politica: hanno la loro sezione, e chi legge si aspetta di trovare lì quella roba.
6. Non dare mai indicazioni su comprare o vendere, e non prevedere il futuro. Racconta cosa è successo.
7. Niente frasi di riempimento. Se una frase non aggiunge un fatto, toglila.`;

// Esportata perché la verifica deve poter guardare esattamente lo stesso testo
// che ha letto l'agente. Ricostruirlo a parte significava scriverne due versioni
// e vederle divergere: il prezzo qui è "149,30", e là diventava "149.3".
export function materialePerAzienda(a, notizie) {
  const pezzi = (a.titoli || []).map((t) => {
    const completa = notizie.find((n) => n.titolo === t.titolo || n.link === t.link);
    const corpo = completa?.testo ? `\nTESTO: ${completa.testo}` : '\n(solo il titolo: l’articolo non si è potuto leggere)';
    return `FONTE: ${t.fonte}\nTITOLO: ${t.titolo}${corpo}`;
  });

  const quot = a.prezzo != null
    ? `Quotazione di oggi: ${num(a.prezzo, 2)} (${pct(a.giorno)}).`
    : 'Quotazione non disponibile.';

  return `### ${a.nome}  —  ${a.settore}\n${quot}\n\n${pezzi.join('\n\n')}`;
}

const richiesta = (aziende, materiale) =>
  `Ecco il materiale di oggi su ${aziende.length} aziende. Scrivi il riassunto di ciascuna.\n\n${materiale}`;

// Incolla i riassunti scritti sulle aziende trovate, lasciando intatta
// qualunque azienda che il modello non ha nominato.
function applica(aziende, scritti) {
  const perNome = new Map(scritti.map((x) => [String(x.nome || '').toLowerCase(), x]));
  let fatti = 0;
  const out = aziende.map((a) => {
    const r = perNome.get(a.nome.toLowerCase());
    if (!r?.riassunto) return a;
    fatti++;
    return { ...a, motivo: r.riassunto, scritto: 'agente', materialeScarso: r.materiale_scarso === true };
  });
  return { out, fatti };
}

// ─────────────────────────────  motore 1: chiave API  ─────────────────────────

async function viaApi(aziende, materiale, chiave, modello) {
  const client = new Anthropic({ apiKey: chiave });
  try {
    const risposta = await client.messages.parse({
      model: modello,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      messages: [{ role: 'user', content: richiesta(aziende, materiale) }],
    });

    if (risposta.stop_reason === 'refusal') {
      console.error(`  ! agente: richiesta rifiutata (${risposta.stop_details?.category ?? 'senza categoria'})`);
      return null;
    }
    const scritti = risposta.parsed_output?.aziende;
    if (!scritti?.length) { console.error('  ! agente: risposta non interpretabile'); return null; }

    const { out, fatti } = applica(aziende, scritti);
    const u = risposta.usage;
    console.log(`  agente: ${fatti}/${aziende.length} riassunte da ${modello} via chiave API (${u.input_tokens} token letti, ${u.output_tokens} scritti)`);
    return out;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error('  ! agente: chiave API rifiutata');
    else if (e instanceof Anthropic.RateLimitError) console.error('  ! agente: troppe richieste, riprovo al prossimo giro');
    else if (e instanceof Anthropic.APIError) console.error(`  ! agente: errore ${e.status} — ${e.message}`);
    else console.error(`  ! agente: ${e.message}`);
    return null;
  }
}

// ───────────────────  motore 2: `claude` da riga di comando  ──────────────────

// Lancia il programma e restituisce quello che ha stampato. Il materiale passa
// dallo standard input: può essere lungo decine di migliaia di caratteri, e la
// riga di comando ha un limite.
function lancia(comando, argomenti, testo, ambiente) {
  return new Promise((risolvi) => {
    const p = spawn(comando, argomenti, {
      env: ambiente,
      cwd: process.env.TMPDIR || '/tmp',   // fuori dal progetto: niente CLAUDE.md, niente contesto
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let fuori = '', errori = '', chiuso = false;
    const orologio = setTimeout(() => { if (!chiuso) { p.kill('SIGKILL'); } }, ATTESA_CLI_MS);

    p.stdout.on('data', (d) => { fuori += d; });
    p.stderr.on('data', (d) => { errori += d; });
    p.on('error', (e) => { chiuso = true; clearTimeout(orologio); risolvi({ codice: -1, fuori, errori: e.message }); });
    p.on('close', (codice) => { chiuso = true; clearTimeout(orologio); risolvi({ codice, fuori, errori }); });

    p.stdin.on('error', () => {});
    p.stdin.end(testo);
  });
}

// Il programma restituisce una busta JSON con dentro, nel campo `result`, il
// testo scritto dal modello — che a sua volta è il JSON che abbiamo chiesto.
function sbustaJson(testo) {
  const pulito = String(testo).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(pulito); } catch {}
  const da = pulito.indexOf('{'), a = pulito.lastIndexOf('}');
  if (da >= 0 && a > da) { try { return JSON.parse(pulito.slice(da, a + 1)); } catch {} }
  return null;
}

async function viaCli(aziende, materiale, comando, modello, env) {
  const argomenti = [
    '--print',
    '--model', modello,
    '--system-prompt', SISTEMA,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(SCHEMA_JSON),
    // L'agente deve soltanto leggere il materiale che gli diamo e scrivere.
    // Senza strumenti non può navigare, non può aprire file, non può sorprenderci.
    '--disallowed-tools', 'Bash Edit Write Read WebFetch WebSearch Task Glob Grep NotebookEdit TodoWrite',
    '--strict-mcp-config',
  ];

  const ambiente = { ...env };
  delete ambiente.ANTHROPIC_API_KEY;   // qui si usa l'abbonamento, non la chiave

  const avvio = Date.now();
  const { codice, fuori, errori } = await lancia(comando, argomenti, richiesta(aziende, materiale), ambiente);
  const secondi = Math.round((Date.now() - avvio) / 1000);

  if (codice !== 0 && !fuori.trim()) {
    console.error(`  ! agente: \`${comando}\` è uscito con codice ${codice}${errori ? ` — ${errori.trim().split('\n')[0]}` : ''}`);
    return null;
  }

  const busta = sbustaJson(fuori);
  if (!busta) { console.error('  ! agente: non capisco la risposta di `claude`'); return null; }
  if (busta.is_error || busta.subtype === 'error_during_execution') {
    const motivo = typeof busta.result === 'string' ? busta.result.split('\n')[0] : busta.subtype;
    console.error(`  ! agente: \`claude\` non ha potuto lavorare — ${motivo}`);
    if (/authenticate|login|token/i.test(String(motivo))) {
      console.error('    serve ricollegare l’abbonamento:  claude setup-token');
    }
    return null;
  }

  const contenuto = sbustaJson(busta.result ?? '');
  const scritti = contenuto?.aziende;
  if (!Array.isArray(scritti) || !scritti.length) {
    console.error('  ! agente: `claude` ha risposto, ma non nel formato richiesto');
    return null;
  }

  const { out, fatti } = applica(aziende, scritti);
  const u = busta.usage || {};
  const letti = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  console.log(`  agente: ${fatti}/${aziende.length} riassunte da ${modello} con l’abbonamento Claude (${secondi} s, ${letti} token letti, ${u.output_tokens ?? 0} scritti)`);
  return out;
}

// ───────────────────────────────  scelta del motore  ──────────────────────────

export async function riassumiAziende(aziende, notizie, env = process.env, modello, modelloCli) {
  if (!aziende?.length) return aziende;
  const materiale = aziende.map((a) => materialePerAzienda(a, notizie)).join('\n\n———\n\n');

  if (env.ANTHROPIC_API_KEY) {
    const esito = await viaApi(aziende, materiale, env.ANTHROPIC_API_KEY, modello || MODELLO_API);
    if (esito) return esito;
  }

  // AGENTE_CLI dice dove sta il programma: "1" per cercarlo nel percorso di
  // sistema, oppure il percorso completo. Senza quella variabile non si prova
  // nemmeno, così una prova in locale non parte per sbaglio.
  const indicato = env.AGENTE_CLI;
  if (indicato) {
    const comando = indicato === '1' || indicato === 'true' ? 'claude' : indicato;
    const esito = await viaCli(aziende, materiale, comando, modelloCli || MODELLO_CLI, env);
    if (esito) return esito;
  }

  if (!env.ANTHROPIC_API_KEY && !indicato) {
    console.log('  agente: nessun motore collegato, le schede restano all’estratto');
  } else {
    console.log('  agente: non è riuscito, le schede restano all’estratto');
  }
  return aziende;
}
