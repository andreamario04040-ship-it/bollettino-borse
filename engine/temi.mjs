// Riconosce di cosa parlano i giornali oggi e lo spiega in parole semplici.
// Ogni tema ha la sua frase: niente gergo, niente "rally" o "sell-off".

export const TEMI = [
  { id: 'inflazione', nome: 'inflazione',
    re: /inflazion|inflation|\bcpi\b|\bpce\b|prezzi al consumo|carovita|caro ?vita|deflazion/i,
    spiega: 'i prezzi non stanno scendendo con la velocità sperata, e finché restano alti le banche centrali fanno fatica a tagliare i tassi' },
  { id: 'tassi', nome: 'tassi e banche centrali',
    re: /\bfed\b|federal reserve|\bbce\b|\becb\b|powell|lagarde|tass[oi] d|taglio dei tassi|rate cut|rate hike|interest rate|politica monetaria|monetary policy|fomc/i,
    spiega: 'si discute di quanto costerà il denaro nei prossimi mesi: tassi più bassi aiutano le borse, tassi più alti le frenano' },
  { id: 'ai', nome: 'intelligenza artificiale e tecnologia',
    re: /intelligenza artificiale|\bai\b|nvidia|openai|anthropic|semicondutt|chip|data ?cent|cloud|microsoft|apple|alphabet|meta platforms|tesla|big tech/i,
    spiega: 'gli investitori si stanno chiedendo se le aziende dell’intelligenza artificiale valgano davvero i prezzi raggiunti: sono i titoli che pesano di più sugli indici americani' },
  { id: 'dazi', nome: 'dazi e commercio',
    re: /dazi|tariff|guerra commercial|trade war|commercio internazional|export control|sanzion/i,
    spiega: 'nuove tasse sulle merci importate rendono più caro produrre e vendere all’estero, e questo colpisce soprattutto industria e automobili' },
  { id: 'energia', nome: 'energia',
    re: /petrolio|\boil\b|opec|greggio|crude|\bgas\b|energia elettrica|benzina/i,
    spiega: 'il prezzo dell’energia finisce dentro a tutto il resto: quando sale, con qualche mese di ritardo salgono bollette e prezzi al supermercato' },
  { id: 'banche', nome: 'banche',
    re: /banc[ah]|banking|bank\b|credito|crediti deteriorat|mutui|intesa|unicredit|mps|deutsche bank|risiko bancario|opas|ops\b/i,
    spiega: 'le banche pesano moltissimo sulla Borsa di Milano: quando si muovono loro, si muove l’indice italiano' },
  { id: 'cina', nome: 'Cina',
    re: /\bcina\b|\bchina\b|pechino|beijing|shanghai|hong kong|yuan|renminbi/i,
    spiega: 'la Cina è il principale cliente dell’industria e del lusso europei: se la sua economia rallenta, lo sentono Parigi e Francoforte' },
  { id: 'lavoro', nome: 'lavoro ed economia',
    re: /occupazion|mercato del lavoro|\bjobs\b|payroll|disoccupa|unemploy|\bpil\b|\bgdp\b|recession|crescita economica|consumi/i,
    spiega: 'i dati su lavoro e crescita dicono se l’economia regge: un’economia troppo debole spaventa, una troppo forte tiene i tassi alti' },
  { id: 'geopolitica', nome: 'tensioni internazionali',
    re: /guerra|\bwar\b|ucraina|ukraine|russia|medio oriente|middle east|israel|iran|taiwan|attacco|conflitto/i,
    spiega: 'le tensioni internazionali spingono gli investitori verso i beni rifugio come l’oro, e fanno oscillare il prezzo dell’energia' },
  { id: 'italia', nome: 'Italia',
    re: /\bbtp\b|spread|manovra|governo italian|piazza affari|debito pubblico|rating italia/i,
    spiega: 'qui si parla dei conti pubblici italiani: più lo Stato paga per farsi prestare denaro, più diventa difficile la vita alle banche e alla Borsa di Milano' },
  { id: 'utili', nome: 'conti delle aziende',
    re: /utili|earnings|trimestrale|quarterly|ricavi|revenue|guidance|profit warning|bilancio dell|risultati del trimestre/i,
    spiega: 'le aziende stanno pubblicando i conti: se guadagnano più del previsto il titolo sale, altrimenti scende, anche di molto' },
  { id: 'crypto', nome: 'criptovalute',
    re: /bitcoin|criptovalut|crypto|ethereum|stablecoin/i,
    spiega: 'le criptovalute sono il termometro più estremo della voglia di rischiare: quando gli investitori si spaventano, di solito scendono per prime' },
];

// Quali temi dominano oggi. Pesa la testata (un titolo del Sole vale più di un aggregatore)
// e la freschezza: una notizia di stamattina conta il doppio di una di ieri.
export function temiDelGiorno(notizie, quanti = 3) {
  const adesso = Date.now();
  const punteggi = new Map();

  for (const tema of TEMI) {
    let punti = 0;
    const titoli = [];
    for (const n of notizie) {
      const nelTitolo = tema.re.test(n.titolo);
      if (!nelTitolo && !tema.re.test(n.sommario)) continue;
      const ore = n.data ? (adesso - new Date(n.data).getTime()) / 3600000 : 24;
      const freschezza = ore < 6 ? 2 : ore < 18 ? 1.4 : ore < 36 ? 1 : 0.5;
      punti += (n.peso || 1) * freschezza * (n.ufficiale ? 1.6 : 1) * (nelTitolo ? 1 : 0.5);
      // Da citare si prendono solo le notizie il cui titolo parla davvero del tema.
      if (nelTitolo) titoli.push({ ...n, rilievo: (n.peso || 1) * freschezza });
    }
    if (punti > 0) punteggi.set(tema.id, { tema, punti, titoli });
  }

  return [...punteggi.values()]
    .sort((a, b) => b.punti - a.punti)
    .slice(0, quanti)
    .map((x) => ({
      id: x.tema.id,
      nome: x.tema.nome,
      spiega: x.tema.spiega,
      punti: Math.round(x.punti * 10) / 10,
      titoli: x.titoli.sort((a, b) => b.rilievo - a.rilievo).slice(0, 3)
        .map((n) => ({ fonte: n.fonte, titolo: n.titolo, link: n.link, data: n.data, ufficiale: n.ufficiale, lingua: n.lingua })),
    }));
}
