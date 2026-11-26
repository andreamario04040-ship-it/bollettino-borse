// Riassunto senza modello: si prendono le frasi che contano dagli articoli veri.
//
// Non scrive nulla di nuovo — sceglie. Dalle frasi dell'articolo tiene quelle che
// parlano davvero dell'azienda e portano un fatto, e scarta il contorno. Non è
// elegante come un riassunto scritto, ma dice cosa è successo, è gratis, e non
// può inventare niente: ogni parola viene dall'articolo, che resta citato sotto.

const AZIONI = /\b(annunc|lanc|present|acquis|rilev|compr|vend|sospend|interromp|blocc|taglia|chiud|apr|investi|pubblic|registr|raggiung|supera|perde|guadagn|sale|scende|cresce|cala|firma|accord|avvia|prevede|stima|riduc|aument|assum|licenzi|produce|distribuisc|approv|respin|denunc|multa|indag)/i;
const CIFRE = /\d|per cento|percento|miliard|milion|mila\b/i;
const RUMORE = /\b(cookie|newsletter|iscriviti|abbonati|leggi anche|continua a leggere|tutti i diritti|riproduzione riservata|condividi|segui|clicca|pubblicit|accetta|privacy|registrati|accedi al|commenti)\b/i;

// Spezza in frasi senza rompere su "S.p.A." o "3,91%".
function frasi(testo) {
  return testo
    .replace(/([A-Z])\.([A-Z])\./g, '$1·$2·')
    .split(/(?<=[.!?])\s+(?=[A-Z«"'(])/)
    .map((f) => f.replace(/·/g, '.').replace(/\s+/g, ' ').trim())
    .filter((f) => f.length >= 35 && f.length <= 320);
}

function nomina(frase, nome) {
  const fuga = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${fuga(nome)}`, 'i').test(frase)) return true;
  const parti = nome.split(/\s+/);
  const radice = parti[parti.length - 1];
  return radice.length > 3 && new RegExp(`\\b${fuga(radice)}`, 'i').test(frase);
}

function punteggio(frase, nome, posizione, totale) {
  if (RUMORE.test(frase)) return -1;
  // Requisito, non bonus: se la frase non nomina l'azienda, non la racconta.
  // Senza questa regola il riepilogo di Piazza Affari finiva nella scheda di
  // Stellantis parlando dello spread dei Btp.
  if (!nomina(frase, nome)) return -1;
  let p = 4;
  if (AZIONI.test(frase)) p += 3;
  if (CIFRE.test(frase)) p += 2;
  if (posizione < 3) p += 2;                  // l'attacco dell'articolo è quasi sempre il fatto
  else if (posizione < 6) p += 1;
  if (posizione > totale * 0.75) p -= 1;      // in fondo di solito c'è il contorno
  if (/^[«"']/.test(frase)) p -= 1;           // una citazione non è il fatto
  return p;
}

// Restituisce il riassunto estrattivo di un'azienda, o null se non c'è materiale.
export function estrai(azienda, materiale, quanteFrasi = 3) {
  const fonti = (azienda.titoli || [])
    .map((t) => ({ t, m: materiale.find((x) => x.titolo === t.titolo || x.link === t.link) }))
    .filter((x) => x.m?.testo);

  if (!fonti.length) return null;

  const candidate = [];
  for (const { t, m } of fonti) {
    const elenco = frasi(m.testo);
    elenco.forEach((f, i) => {
      const p = punteggio(f, azienda.nome, i, elenco.length);
      if (p >= 5) candidate.push({ frase: f, p, fonte: t.fonte, ordine: i });
    });
  }
  if (!candidate.length) return null;

  // Le migliori, senza ripetere due volte lo stesso fatto, rimesse nell'ordine
  // in cui stanno nell'articolo: altrimenti il testo salta da un punto all'altro.
  const LUNGHEZZA_MASSIMA = 420;
  const scelte = [];
  let lunghezza = 0;
  for (const c of candidate.sort((a, b) => b.p - a.p)) {
    if (scelte.length >= quanteFrasi) break;
    // Si guarda prima di aggiungere: altrimenti una frase lunga sfonda il tetto.
    if (scelte.length && lunghezza + c.frase.length > LUNGHEZZA_MASSIMA) continue;
    const impronta = c.frase.toLowerCase().replace(/[^a-zàèéìòù0-9 ]/g, '').split(/\s+/).slice(0, 8).join(' ');
    if (scelte.some((s) => s.impronta === impronta)) continue;
    scelte.push({ ...c, impronta });
    lunghezza += c.frase.length;
  }
  scelte.sort((a, b) => a.ordine - b.ordine);

  const fontiUsate = [...new Set(scelte.map((s) => s.fonte))];
  return {
    testo: scelte.map((s) => s.frase).join(' '),
    fonti: fontiUsate,
  };
}

export function riassumiConEstratto(aziende, materiale) {
  let fatti = 0;
  const out = aziende.map((a) => {
    const e = estrai(a, materiale);
    if (!e) return a;
    fatti++;
    return { ...a, motivo: e.testo, scritto: 'estratto', fontiEstratto: e.fonti };
  });
  console.log(`  estratto: ${fatti}/${aziende.length} aziende raccontate con le frasi degli articoli`);
  return out;
}
