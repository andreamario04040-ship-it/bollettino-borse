// Riconosce le aziende di cui parlano i giornali oggi, capisce di cosa si parla
// e ne prende la quotazione. Serve a non fermarsi all'economia in generale:
// spesso la notizia vera è un chip nuovo o un bilancio migliore del previsto.

import { quotazioniCnbc } from './cnbc.mjs';
import { pct, num, taglia } from './lingua.mjs';

// cnbc: null quando il titolo non è scambiato dove possiamo leggerlo (resta
// nella sezione, ma senza prezzo). "fa" spiega in una riga di cosa vive l'azienda.
export const AZIENDE = [
  // —— Intelligenza artificiale e semiconduttori
  { nome: 'Nvidia', cnbc: 'NVDA', re: /\bnvidia\b|\bhuang\b/i, settore: 'Semiconduttori', fa: 'fa i chip su cui gira quasi tutta l’intelligenza artificiale' },
  { nome: 'AMD', cnbc: 'AMD', re: /\bamd\b|advanced micro/i, settore: 'Semiconduttori', fa: 'è l’inseguitrice di Nvidia nei chip per l’intelligenza artificiale' },
  { nome: 'Intel', cnbc: 'INTC', re: /\bintel\b/i, settore: 'Semiconduttori', fa: 'è il vecchio gigante americano dei processori, in piena riorganizzazione' },
  { nome: 'Broadcom', cnbc: 'AVGO', re: /\bbroadcom\b/i, settore: 'Semiconduttori', fa: 'fa i chip di rete che collegano fra loro i centri di calcolo' },
  { nome: 'TSMC', cnbc: 'TSM', re: /\btsmc\b|taiwan semiconductor/i, settore: 'Semiconduttori', fa: 'fabbrica materialmente i chip disegnati da Nvidia, Apple e quasi tutti gli altri' },
  { nome: 'ASML', cnbc: 'ASML', re: /\basml\b/i, settore: 'Semiconduttori', fa: 'costruisce le macchine senza le quali i chip moderni non si possono produrre' },
  { nome: 'Micron', cnbc: 'MU', re: /\bmicron\b/i, settore: 'Semiconduttori', fa: 'fa le memorie, il collo di bottiglia dei server per l’intelligenza artificiale' },
  { nome: 'Qualcomm', cnbc: 'QCOM', re: /\bqualcomm\b/i, settore: 'Semiconduttori', fa: 'fa i chip dei telefoni' },
  { nome: 'OpenAI', cnbc: null, re: /\bopenai\b|chatgpt/i, settore: 'Intelligenza artificiale', fa: 'non è quotata, ma le sue mosse muovono i titoli di tutto il settore' },
  { nome: 'Anthropic', cnbc: null, re: /\banthropic\b|\bclaude\b/i, settore: 'Intelligenza artificiale', fa: 'non è quotata, ed è l’altro grande nome dei modelli di intelligenza artificiale' },
  { nome: 'CoreWeave', cnbc: 'CRWV', re: /coreweave/i, settore: 'Centri di calcolo', fa: 'affitta potenza di calcolo per l’intelligenza artificiale' },
  { nome: 'Palantir', cnbc: 'PLTR', re: /palantir/i, settore: 'Software', fa: 'vende software di analisi dati a governi e grandi aziende' },
  { nome: 'Super Micro', cnbc: 'SMCI', re: /super ?micro|\bsmci\b/i, settore: 'Server', fa: 'assembla i server che ospitano i chip per l’intelligenza artificiale' },

  // —— Le grandi americane
  { nome: 'Apple', cnbc: 'AAPL', re: /\bapple\b|\biphone\b/i, settore: 'Tecnologia', fa: 'pesa più di ogni altra sugli indici americani' },
  { nome: 'Microsoft', cnbc: 'MSFT', re: /\bmicrosoft\b|\bazure\b/i, settore: 'Tecnologia', fa: 'vende il cloud su cui girano molte aziende, ed è dentro OpenAI' },
  { nome: 'Alphabet', cnbc: 'GOOGL', re: /\balphabet\b|\bgoogle\b|\bgemini\b/i, settore: 'Tecnologia', fa: 'vive di pubblicità e sta spingendo forte sull’intelligenza artificiale' },
  { nome: 'Amazon', cnbc: 'AMZN', re: /\bamazon\b|\baws\b/i, settore: 'Tecnologia', fa: 'guadagna più con il cloud che con il commercio online' },
  { nome: 'Meta', cnbc: 'META', re: /\bmeta platforms\b|\bfacebook\b|\binstagram\b|\bmeta\b(?! ?dati)/i, settore: 'Tecnologia', fa: 'sta spendendo moltissimo in centri di calcolo per l’intelligenza artificiale' },
  { nome: 'Tesla', cnbc: 'TSLA', re: /\btesla\b|\bmusk\b/i, settore: 'Auto', fa: 'è l’auto elettrica più seguita, e il titolo più emotivo del listino' },
  { nome: 'Oracle', cnbc: 'ORCL', re: /\boracle\b/i, settore: 'Software', fa: 'si è indebitata molto per costruire centri di calcolo' },
  { nome: 'Netflix', cnbc: 'NFLX', re: /\bnetflix\b/i, settore: 'Media', fa: 'è il termometro degli abbonamenti e della pubblicità online' },

  // —— Cina
  { nome: 'Alibaba', cnbc: 'BABA', re: /\balibaba\b/i, settore: 'Cina · Tecnologia', fa: 'è l’Amazon cinese, e ora anche un grande nome del cloud' },
  { nome: 'Baidu', cnbc: 'BIDU', re: /\bbaidu\b/i, settore: 'Cina · Tecnologia', fa: 'è il motore di ricerca cinese, molto attivo sull’intelligenza artificiale' },
  { nome: 'PDD', cnbc: 'PDD', re: /\bpdd\b|pinduoduo|\btemu\b/i, settore: 'Cina · Commercio', fa: 'è il gruppo di Temu, il commercio online a basso prezzo' },
  { nome: 'JD.com', cnbc: 'JD', re: /\bjd\.com\b/i, settore: 'Cina · Commercio', fa: 'è l’altro grande commercio online cinese' },
  { nome: 'Tencent', cnbc: 'TCEHY', re: /\btencent\b|wechat/i, settore: 'Cina · Tecnologia', fa: 'possiede WeChat e mezzo settore dei videogiochi' },
  { nome: 'BYD', cnbc: 'BYDDY', re: /\bbyd\b/i, settore: 'Cina · Auto', fa: 'è il colosso cinese dell’auto elettrica che spaventa l’industria europea' },
  { nome: 'SMIC', cnbc: null, re: /\bsmic\b/i, settore: 'Cina · Semiconduttori', fa: 'è il tentativo cinese di produrre chip senza tecnologia occidentale' },
  { nome: 'DeepSeek', cnbc: null, re: /deepseek/i, settore: 'Cina · Intelligenza artificiale', fa: 'è il modello cinese che ha rimesso in discussione quanto costa l’intelligenza artificiale' },
  { nome: 'Xiaomi', cnbc: null, re: /xiaomi/i, settore: 'Cina · Tecnologia', fa: 'fa telefoni e ora anche automobili elettriche' },

  // —— Europa e Italia
  { nome: 'SAP', cnbc: 'SAP', re: /\bsap\b/i, settore: 'Europa · Software', fa: 'è il software gestionale di mezza industria europea' },
  { nome: 'LVMH', cnbc: 'MC-FR', re: /\blvmh\b|louis vuitton/i, settore: 'Europa · Lusso', fa: 'è il termometro del lusso, e quindi dei consumi cinesi' },
  { nome: 'Stellantis', cnbc: 'STLA', re: /stellantis/i, settore: 'Europa · Auto', fa: 'è il gruppo di Fiat, Peugeot e Chrysler' },
  { nome: 'Ferrari', cnbc: 'RACE', re: /\bferrari\b/i, settore: 'Italia · Auto', fa: 'è il titolo più prezioso di Piazza Affari' },
  { nome: 'STMicroelectronics', cnbc: 'STM', re: /stmicro|\bstm\b/i, settore: 'Italia · Semiconduttori', fa: 'è l’unico grande produttore di chip italo-francese' },
  { nome: 'Eni', cnbc: 'ENI-IT', re: /\beni\b/i, settore: 'Italia · Energia', fa: 'segue il prezzo del petrolio e pesa molto sull’indice di Milano' },
  { nome: 'Enel', cnbc: 'ENEL-IT', re: /\benel\b/i, settore: 'Italia · Energia', fa: 'è la grande utility elettrica, sensibile ai tassi' },
  { nome: 'Intesa Sanpaolo', cnbc: 'ISP.MI-IT', re: /intesa ?sanpaolo|\bintesa\b/i, settore: 'Italia · Banche', fa: 'è la prima banca italiana per capitalizzazione' },
  { nome: 'UniCredit', cnbc: 'UCG-IT', re: /unicredit/i, settore: 'Italia · Banche', fa: 'è la seconda banca italiana, al centro del risiko bancario' },
  { nome: 'Monte dei Paschi', cnbc: 'BMPS-IT', re: /\bmps\b|monte dei paschi/i, settore: 'Italia · Banche', fa: 'è la banca più discussa d’Italia' },
  { nome: 'Leonardo', cnbc: 'LDO-IT', re: /\bleonardo\b/i, settore: 'Italia · Difesa', fa: 'è la difesa italiana, spinta dalle spese militari europee' },
  { nome: 'Generali', cnbc: 'G-IT', re: /\bgenerali\b/i, settore: 'Italia · Assicurazioni', fa: 'è la maggiore assicurazione italiana' },
];

// Di cosa si parla: la prima che corrisponde vince.
const TIPI = [
  { id: 'conti', re: /utili|earnings|trimestral|quarterly|ricavi|revenue|risultati|bilanc|profitt|guidance|outlook|margini/i,
    dillo: (a) => `Ha pubblicato i conti. È il momento in cui un titolo si muove di più: conta se ha fatto meglio o peggio di quanto gli analisti si aspettavano.` },
  { id: 'acquisizione', re: /acquisi|acquisition|acquire|merger|fusione|takeover|rileva|opas\b|\bops\b|partecipazione/i,
    dillo: () => `È dentro un'operazione straordinaria: un'acquisizione o una fusione. Di solito sale chi viene comprato e scende chi compra.` },
  { id: 'regole', re: /antitrust|causa legale|lawsuit|indagine|probe|regolator|regulat|multa|\bfine\b|sanzion|\bsec\b|tribunale|export control|dazi|tariff|divieto|\bban\b|blocc|interrompe le spedizioni|restrizion/i,
    dillo: () => `È alle prese con autorità o tribunali. Sono notizie che pesano sul titolo più a lungo di un singolo trimestre.` },
  { id: 'prodotto', re: /lancia|launch|unveil|presenta|svela|debutt|nuovo (chip|modello|processore|prodotto)|new (chip|model|product)|rilascia|annuncia il/i,
    dillo: () => `Ha presentato un prodotto nuovo. Nei semiconduttori un chip nuovo può spostare gli equilibri per anni.` },
  { id: 'giudizi', re: /rating|downgrade|upgrade|target price|prezzo obiettivo|raccomandazion|analisti|analysts|declassa/i,
    dillo: () => `Gli analisti hanno cambiato giudizio. Conta soprattutto quando a cambiarlo sono in molti insieme.` },
  { id: 'investimenti', re: /investiment|investment|data ?cent|capex|miliardi|billion|stabilimento|fabbrica|impianto/i,
    dillo: () => `Ha annunciato investimenti. Nel settore dell'intelligenza artificiale la domanda è sempre la stessa: quei soldi torneranno indietro?` },
];

const tipoDi = (testo) => TIPI.find((t) => t.re.test(testo)) || null;

export async function aziendeDelGiorno(notizie, quante = 6) {
  const adesso = Date.now();
  const trovate = new Map();

  for (const a of AZIENDE) {
    const titoli = [];
    let punti = 0;
    for (const n of notizie) {
      if (!a.re.test(n.titolo)) continue;             // solo il titolo: il sommario porta troppi falsi
      const ore = n.data ? (adesso - new Date(n.data).getTime()) / 3600000 : 24;
      punti += (n.peso || 1) * (ore < 8 ? 2 : ore < 24 ? 1.3 : 0.6);
      titoli.push(n);
    }
    if (titoli.length) trovate.set(a.nome, { a, punti, titoli });
  }

  // Al massimo due per settore: senza, una giornata di risiko bancario
  // riempirebbe la sezione di banche e lascerebbe fuori tutto il resto.
  const perSettore = new Map();
  const scelte = [];
  for (const v of [...trovate.values()].sort((x, y) => y.punti - x.punti)) {
    const n = perSettore.get(v.a.settore) || 0;
    if (n >= 2) continue;
    perSettore.set(v.a.settore, n + 1);
    scelte.push(v);
    if (scelte.length >= quante) break;
  }
  if (!scelte.length) { console.log('  aziende: nessuna citata nei titoli di oggi'); return []; }

  // Le quotazioni di tutte in una chiamata sola.
  let prezzi = new Map();
  const simboli = scelte.map((s) => s.a.cnbc).filter(Boolean);
  if (simboli.length) {
    try { prezzi = await quotazioniCnbc(simboli); }
    catch (e) { console.error(`  ! quotazioni delle aziende non disponibili: ${e.message}`); }
  }

  const out = scelte.map(({ a, titoli }) => {
    const q = a.cnbc ? prezzi.get(a.cnbc) : null;
    const tipo = tipoDi(titoli.map((n) => `${n.titolo} ${n.sommario}`).join(' '));
    return {
      nome: a.nome, settore: a.settore, simbolo: a.cnbc, fa: a.fa,
      prezzo: q?.prezzo ?? null, giorno: q?.giorno ?? null,
      motivo: tipo ? tipo.dillo(a) : `È fra i nomi più citati di oggi, senza un fatto singolo che spieghi tutto.`,
      titoli: titoli.slice(0, 2).map((n) => ({ fonte: n.fonte, titolo: taglia(n.titolo, 130), link: n.link })),
    };
  });

  console.log(`  aziende: ${out.length} (${out.map((x) => x.nome).join(', ')})`);
  return out;
}
