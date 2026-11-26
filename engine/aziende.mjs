// Riconosce le aziende di cui parlano i giornali oggi, capisce di cosa si parla
// e ne prende la quotazione. Serve a non fermarsi all'economia in generale:
// spesso la notizia vera è un chip nuovo o un bilancio migliore del previsto.

import { quotazioniCnbc } from './cnbc.mjs';
import { pct, num, taglia } from './lingua.mjs';

// cnbc: null quando il titolo non è scambiato dove possiamo leggerlo (resta
// nella sezione, ma senza prezzo). "fa" spiega in una riga di cosa vive l'azienda.
export const slug = (nome) => nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const AZIENDE = [
  // —— Intelligenza artificiale e semiconduttori
  { nome: 'Nvidia', dominio: 'nvidia.com', cnbc: 'NVDA', re: /\bnvidia\b|\bhuang\b/i, settore: 'Semiconduttori', fa: 'fa i chip su cui gira quasi tutta l’intelligenza artificiale' },
  { nome: 'AMD', dominio: 'amd.com', cnbc: 'AMD', re: /\bamd\b|advanced micro/i, settore: 'Semiconduttori', fa: 'è l’inseguitrice di Nvidia nei chip per l’intelligenza artificiale' },
  { nome: 'Intel', dominio: 'intel.com', cnbc: 'INTC', re: /\bintel\b/i, settore: 'Semiconduttori', fa: 'è il vecchio gigante americano dei processori, in piena riorganizzazione' },
  { nome: 'Broadcom', dominio: 'broadcom.com', cnbc: 'AVGO', re: /\bbroadcom\b/i, settore: 'Semiconduttori', fa: 'fa i chip di rete che collegano fra loro i centri di calcolo' },
  { nome: 'TSMC', dominio: 'tsmc.com', cnbc: 'TSM', re: /\btsmc\b|taiwan semiconductor/i, settore: 'Semiconduttori', fa: 'fabbrica materialmente i chip disegnati da Nvidia, Apple e quasi tutti gli altri' },
  { nome: 'ASML', dominio: 'asml.com', cnbc: 'ASML', re: /\basml\b/i, settore: 'Semiconduttori', fa: 'costruisce le macchine senza le quali i chip moderni non si possono produrre' },
  { nome: 'Micron', dominio: 'micron.com', cnbc: 'MU', re: /\bmicron\b/i, settore: 'Semiconduttori', fa: 'fa le memorie, il collo di bottiglia dei server per l’intelligenza artificiale' },
  { nome: 'Qualcomm', dominio: 'qualcomm.com', cnbc: 'QCOM', re: /\bqualcomm\b/i, settore: 'Semiconduttori', fa: 'fa i chip dei telefoni' },
  { nome: 'OpenAI', dominio: 'openai.com', cnbc: null, re: /\bopenai\b|chatgpt/i, settore: 'Intelligenza artificiale', fa: 'costruisce ChatGPT, e le sue mosse muovono i titoli di tutto il settore' },
  { nome: 'Anthropic', dominio: 'anthropic.com', cnbc: 'ANT', re: /\banthropic\b|\bclaude\b/i, settore: 'Intelligenza artificiale', fa: 'è uno dei grandi nomi dei modelli di intelligenza artificiale' },
  { nome: 'CoreWeave', dominio: 'coreweave.com', cnbc: 'CRWV', re: /coreweave/i, settore: 'Centri di calcolo', fa: 'affitta potenza di calcolo per l’intelligenza artificiale' },
  { nome: 'Palantir', dominio: 'palantir.com', cnbc: 'PLTR', re: /palantir/i, settore: 'Software', fa: 'vende software di analisi dati a governi e grandi aziende' },
  { nome: 'Super Micro', dominio: 'supermicro.com', cnbc: 'SMCI', re: /super ?micro|\bsmci\b/i, settore: 'Server', fa: 'assembla i server che ospitano i chip per l’intelligenza artificiale' },

  // —— Le grandi americane
  { nome: 'Apple', dominio: 'apple.com', cnbc: 'AAPL', re: /\bapple\b|\biphone\b/i, settore: 'Tecnologia', fa: 'fa iPhone e Mac, ed è fra i titoli che pesano di più sugli indici americani' },
  { nome: 'Microsoft', dominio: 'microsoft.com', cnbc: 'MSFT', re: /\bmicrosoft\b|\bazure\b/i, settore: 'Tecnologia', fa: 'vende il cloud su cui girano molte aziende, ed è dentro OpenAI' },
  { nome: 'Alphabet', dominio: 'google.com', cnbc: 'GOOGL', re: /\balphabet\b|\bgoogle\b|\bgemini\b/i, settore: 'Tecnologia', fa: 'vive di pubblicità e sta spingendo forte sull’intelligenza artificiale' },
  { nome: 'Amazon', dominio: 'amazon.com', cnbc: 'AMZN', re: /\bamazon\b|\baws\b/i, settore: 'Tecnologia', fa: 'guadagna più con il cloud che con il commercio online' },
  { nome: 'Meta', dominio: 'meta.com', cnbc: 'META', re: /\bmeta platforms\b|\bfacebook\b|\binstagram\b|\bmeta\b(?! ?dati)/i, settore: 'Tecnologia', fa: 'sta spendendo moltissimo in centri di calcolo per l’intelligenza artificiale' },
  { nome: 'Tesla', dominio: 'tesla.com', cnbc: 'TSLA', re: /\btesla\b|\bmusk\b/i, settore: 'Auto', fa: 'è l’auto elettrica più seguita, e il titolo più emotivo del listino' },
  { nome: 'Oracle', dominio: 'oracle.com', cnbc: 'ORCL', re: /\boracle\b/i, settore: 'Software', fa: 'si è indebitata molto per costruire centri di calcolo' },
  { nome: 'Netflix', dominio: 'netflix.com', cnbc: 'NFLX', re: /\bnetflix\b/i, settore: 'Media', fa: 'è il termometro degli abbonamenti e della pubblicità online' },

  // —— Cina
  { nome: 'Alibaba', dominio: 'alibabagroup.com', cnbc: 'BABA', re: /\balibaba\b/i, settore: 'Cina · Tecnologia', fa: 'è l’Amazon cinese, e ora anche un grande nome del cloud' },
  { nome: 'Baidu', dominio: 'baidu.com', cnbc: 'BIDU', re: /\bbaidu\b/i, settore: 'Cina · Tecnologia', fa: 'è il motore di ricerca cinese, molto attivo sull’intelligenza artificiale' },
  { nome: 'PDD', dominio: 'pddholdings.com', cnbc: 'PDD', re: /\bpdd\b|pinduoduo|\btemu\b/i, settore: 'Cina · Commercio', fa: 'è il gruppo di Temu, il commercio online a basso prezzo' },
  { nome: 'JD.com', dominio: 'jd.com', cnbc: 'JD', re: /\bjd\.com\b/i, settore: 'Cina · Commercio', fa: 'è l’altro grande commercio online cinese' },
  { nome: 'Tencent', dominio: 'tencent.com', cnbc: 'TCEHY', re: /\btencent\b|wechat/i, settore: 'Cina · Tecnologia', fa: 'possiede WeChat e mezzo settore dei videogiochi' },
  { nome: 'BYD', dominio: 'bydglobal.com', cnbc: 'BYDDY', re: /\bbyd\b/i, settore: 'Cina · Auto', fa: 'è il colosso cinese dell’auto elettrica che spaventa l’industria europea' },
  { nome: 'SMIC', dominio: 'smics.com', cnbc: null, re: /\bsmic\b/i, settore: 'Cina · Semiconduttori', fa: 'è il tentativo cinese di produrre chip senza tecnologia occidentale' },
  { nome: 'DeepSeek', dominio: 'deepseek.com', cnbc: null, re: /deepseek/i, settore: 'Cina · Intelligenza artificiale', fa: 'è il modello cinese che ha rimesso in discussione quanto costa l’intelligenza artificiale' },
  { nome: 'Xiaomi', dominio: 'mi.com', cnbc: null, re: /xiaomi/i, settore: 'Cina · Tecnologia', fa: 'fa telefoni e ora anche automobili elettriche' },

  // —— Europa e Italia
  { nome: 'SAP', dominio: 'sap.com', cnbc: 'SAP', re: /\bsap\b/i, settore: 'Europa · Software', fa: 'è il software gestionale di mezza industria europea' },
  { nome: 'LVMH', dominio: 'lvmh.com', cnbc: 'MC-FR', re: /\blvmh\b|louis vuitton/i, settore: 'Europa · Lusso', fa: 'è il termometro del lusso, e quindi dei consumi cinesi' },
  { nome: 'Stellantis', dominio: 'stellantis.com', cnbc: 'STLA', re: /stellantis/i, settore: 'Europa · Auto', fa: 'è il gruppo di Fiat, Peugeot e Chrysler' },
  { nome: 'Ferrari', dominio: 'ferrari.com', cnbc: 'RACE', re: /\bferrari\b/i, settore: 'Italia · Auto', fa: 'fa auto sportive di lusso ed è fra i titoli maggiori di Piazza Affari' },
  { nome: 'STMicroelectronics', dominio: 'st.com', cnbc: 'STM', re: /stmicro|\bstm\b/i, settore: 'Italia · Semiconduttori', fa: 'è il produttore di chip italo-francese' },
  { nome: 'Eni', dominio: 'eni.com', cnbc: 'ENI-IT', re: /\beni\b/i, settore: 'Italia · Energia', fa: 'segue il prezzo del petrolio e pesa molto sull’indice di Milano' },
  { nome: 'Enel', dominio: 'enel.com', cnbc: 'ENEL-IT', re: /\benel\b/i, settore: 'Italia · Energia', fa: 'è la grande utility elettrica, sensibile ai tassi' },
  { nome: 'Intesa Sanpaolo', dominio: 'intesasanpaolo.com', cnbc: 'ISP.MI-IT', re: /intesa ?sanpaolo|\bintesa\b/i, settore: 'Italia · Banche', fa: 'è una delle maggiori banche italiane' },
  { nome: 'UniCredit', dominio: 'unicredit.it', cnbc: 'UCG-IT', re: /unicredit/i, settore: 'Italia · Banche', fa: 'è una delle maggiori banche italiane, molto attiva nelle operazioni fra banche' },
  { nome: 'Monte dei Paschi', dominio: 'gruppomps.it', cnbc: 'BMPS-IT', re: /\bmps\b|monte dei paschi/i, settore: 'Italia · Banche', fa: 'è una banca storica toscana, spesso al centro delle cronache finanziarie' },
  { nome: 'Leonardo', dominio: 'leonardo.com', cnbc: 'LDO-IT', re: /\bleonardo\b/i, settore: 'Italia · Difesa', fa: 'è la difesa italiana, spinta dalle spese militari europee' },
  { nome: 'Generali', dominio: 'generali.com', cnbc: 'G-IT', re: /\bgenerali\b/i, settore: 'Italia · Assicurazioni', fa: 'è la principale assicurazione italiana' },
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
      nome: a.nome, settore: a.settore, simbolo: a.cnbc, fa: a.fa, logo: a.dominio ? slug(a.nome) : null,
      prezzo: q?.prezzo ?? null, giorno: q?.giorno ?? null,
      motivo: tipo ? tipo.dillo(a) : `I giornali la citano oggi, ma senza che emerga un fatto singolo.`,
      scritto: 'regole',
      titoli: titoli.slice(0, 2).map((n) => ({ fonte: n.fonte, titolo: taglia(n.titolo, 130), link: n.link })),
    };
  });

  console.log(`  aziende: ${out.length} (${out.map((x) => x.nome).join(', ')})`);
  return out;
}
