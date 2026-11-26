// L'agente che legge gli articoli e scrive il riassunto di ogni azienda.
//
// Prima di questo, la scheda di un'azienda diceva frasi preconfezionate scelte
// da espressioni regolari: "è fra i nomi più citati di oggi". Non era un
// riassunto, era un riempitivo. Qui il materiale della giornata — titoli e testo
// degli articoli — viene letto davvero e trasformato in un resoconto.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { pct, num } from './lingua.mjs';

const MODELLO_PREDEFINITO = 'claude-opus-5-5';

const Schema = z.object({
  aziende: z.array(z.object({
    nome: z.string().describe('Il nome dell’azienda, identico a come è stato fornito'),
    riassunto: z.string().describe(
      'Da tre a sei frasi che raccontano cosa è successo oggi a questa azienda, con i fatti concreti letti negli articoli: cifre, decisioni, prodotti, conti, autorità. Italiano semplice.'),
    materiale_scarso: z.boolean().describe(
      'true se gli articoli forniti non bastano a dire cosa è successo davvero'),
  })),
});

const SISTEMA = `Scrivi il bollettino finanziario quotidiano di una persona che sta imparando a informarsi sui mercati. Non è un esperto: capisce le cose se gliele spieghi, non se gliele dai per scontate.

Per ogni azienda scrivi cosa è successo OGGI, raccontando i fatti concreti che trovi nel materiale: cifre, decisioni, prodotti nuovi, conti pubblicati, mosse delle autorità, acquisizioni. Chi legge deve sapere cosa è successo senza dover aprire nessun articolo.

REGOLE, in ordine di importanza.

1. Scrivi SOLTANTO fatti presenti nel materiale che ti do. Non aggiungere nulla che ricordi da altrove, nemmeno se sei sicuro che sia vero: il lettore non può distinguere ciò che hai letto oggi da ciò che ricordi, e un ricordo vecchio diventa una bugia.
2. Copia i numeri esattamente come li trovi. Non arrotondare, non convertire, non stimare.
3. Se il materiale non basta a dire cosa è successo, scrivilo apertamente — "i giornali citano l'azienda senza spiegare perché" — e segna materiale_scarso a true. È molto meglio di una frase vaga che finge di informare.
4. Italiano semplice e diretto. Se usi un termine tecnico, spiegalo in mezza riga dentro la frase. Niente gergo da operatori: niente "rally", "sell-off", "guidance" senza spiegazione.
5. Non dare mai indicazioni su comprare o vendere, e non prevedere il futuro. Racconta cosa è successo.
6. Niente frasi di riempimento. Se una frase non aggiunge un fatto, toglila.`;

function materialePerAzienda(a, notizie) {
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

export async function riassumiAziende(aziende, notizie, env = process.env, modello = MODELLO_PREDEFINITO) {
  if (!aziende?.length) return aziende;
  if (!env.ANTHROPIC_API_KEY) {
    console.log('  agente: ANTHROPIC_API_KEY assente, resto alle frasi di base');
    return aziende;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const materiale = aziende.map((a) => materialePerAzienda(a, notizie)).join('\n\n———\n\n');

  try {
    const risposta = await client.messages.parse({
      model: modello,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      messages: [{
        role: 'user',
        content: `Ecco il materiale di oggi su ${aziende.length} aziende. Scrivi il riassunto di ciascuna.\n\n${materiale}`,
      }],
    });

    if (risposta.stop_reason === 'refusal') {
      console.error(`  ! agente: richiesta rifiutata (${risposta.stop_details?.category ?? 'senza categoria'}), resto alle frasi di base`);
      return aziende;
    }
    const scritti = risposta.parsed_output?.aziende;
    if (!scritti?.length) {
      console.error('  ! agente: risposta non interpretabile, resto alle frasi di base');
      return aziende;
    }

    const perNome = new Map(scritti.map((x) => [x.nome.toLowerCase(), x]));
    let fatti = 0;
    const out = aziende.map((a) => {
      const r = perNome.get(a.nome.toLowerCase());
      if (!r?.riassunto) return a;
      fatti++;
      return { ...a, motivo: r.riassunto, scritto: 'agente', materialeScarso: r.materiale_scarso === true };
    });

    const u = risposta.usage;
    console.log(`  agente: ${fatti}/${aziende.length} riassunte da ${modello} (${u.input_tokens} token letti, ${u.output_tokens} scritti)`);
    return out;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error('  ! agente: chiave API rifiutata');
    else if (e instanceof Anthropic.RateLimitError) console.error('  ! agente: troppe richieste, riprovo al prossimo giro');
    else if (e instanceof Anthropic.APIError) console.error(`  ! agente: errore ${e.status} — ${e.message}`);
    else console.error(`  ! agente: ${e.message}`);
    return aziende;   // il bollettino esce comunque, con le frasi di base
  }
}
