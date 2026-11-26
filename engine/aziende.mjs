// Riconosce le aziende di cui parlano i giornali oggi, capisce di cosa si parla
// e ne prende la quotazione. Serve a non fermarsi all'economia in generale:
// spesso la notizia vera è un chip nuovo o un bilancio migliore del previsto.

import { quotazioniCnbc } from './cnbc.mjs';
import { scaricaLogo, esisteLogo } from './logo.mjs';
import { pct, num, taglia } from './lingua.mjs';

// cnbc: null quando il titolo non è scambiato dove possiamo leggerlo (resta
// nella sezione, ma senza prezzo). "fa" spiega in una riga di cosa vive l'azienda.
export const slug = (nome) => nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const AZIENDE = [
  // —— Intelligenza artificiale e semiconduttori
  { nome: 'Nvidia', dominio: 'nvidia.com', cnbc: 'NVDA', re: /\bnvidia\b|\bhuang\b/i, settore: 'Semiconduttori', fa: 'fa i chip su cui gira quasi tutta l’intelligenza artificiale' },
  { nome: 'AMD', dominio: 'amd.com', cnbc: 'AMD', nomeBorsa: 'Advanced Micro Devices', re: /\bamd\b|advanced micro/i, settore: 'Semiconduttori', fa: 'è l’inseguitrice di Nvidia nei chip per l’intelligenza artificiale' },
  { nome: 'Intel', dominio: 'intel.com', cnbc: 'INTC', re: /\bintel\b/i, settore: 'Semiconduttori', fa: 'è il vecchio gigante americano dei processori, in piena riorganizzazione' },
  { nome: 'Broadcom', dominio: 'broadcom.com', cnbc: 'AVGO', re: /\bbroadcom\b/i, settore: 'Semiconduttori', fa: 'fa i chip di rete che collegano fra loro i centri di calcolo' },
  { nome: 'TSMC', dominio: 'tsmc.com', cnbc: 'TSM', nomeBorsa: 'Taiwan Semiconductor Manufacturing', re: /\btsmc\b|taiwan semiconductor/i, settore: 'Semiconduttori', fa: 'fabbrica materialmente i chip disegnati da Nvidia, Apple e quasi tutti gli altri' },
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
  { nome: 'Generali', dominio: 'generali.com', cnbc: 'G-IT', nomeBorsa: 'Assicurazioni Generali', re: /\bgenerali\b/i, settore: 'Italia · Assicurazioni', fa: 'è la principale assicurazione italiana' },

  // —— Italia, il resto del listino principale
  { nome: 'Poste Italiane', dominio: 'poste.it', cnbc: 'PST-IT', re: /poste italiane/i, settore: 'Italia · Servizi', fa: 'consegna la posta, ma guadagna soprattutto con risparmio e assicurazioni' },
  { nome: 'Moncler', dominio: 'moncler.com', cnbc: 'MONC-IT', re: /moncler/i, settore: 'Italia · Lusso', fa: 'fa piumini e abbigliamento di lusso' },
  { nome: 'Campari', dominio: 'camparigroup.com', cnbc: 'CPR-IT', nomeBorsa: 'Davide Campari Milano', re: /campari/i, settore: 'Italia · Bevande', fa: 'produce aperitivi e liquori venduti in tutto il mondo' },
  { nome: 'Prysmian', dominio: 'prysmian.com', cnbc: 'PRY-IT', re: /prysmian/i, settore: 'Italia · Industria', fa: 'fa i cavi elettrici e in fibra ottica che tengono in piedi le reti' },
  { nome: 'Terna', dominio: 'terna.it', cnbc: 'TRN-IT', nomeBorsa: 'Terna Rete Elettrica Nazionale', re: /\bterna\b/i, settore: 'Italia · Energia', fa: 'gestisce la rete elettrica italiana ad alta tensione' },
  { nome: 'Snam', dominio: 'snam.it', cnbc: 'SRG-IT', re: /\bsnam\b/i, settore: 'Italia · Energia', fa: 'gestisce i gasdotti italiani' },
  { nome: 'Banco BPM', dominio: 'bancobpm.it', cnbc: 'BAMI-IT', re: /banco bpm|\bbpm\b/i, settore: 'Italia · Banche', fa: 'è la terza banca italiana, spesso al centro delle operazioni fra banche' },
  { nome: 'Mediobanca', dominio: 'mediobanca.com', cnbc: 'MB-IT', nomeBorsa: 'Mediobanca Banca di Credito Finanziario', re: /mediobanca/i, settore: 'Italia · Banche', fa: 'è la banca d’affari storica di Milano' },
  { nome: 'Pirelli', dominio: 'pirelli.com', cnbc: 'PIRC-IT', re: /pirelli/i, settore: 'Italia · Industria', fa: 'fa pneumatici, soprattutto per automobili di fascia alta' },
  { nome: 'Telecom Italia', dominio: 'gruppotim.it', cnbc: 'TIT-IT', re: /telecom italia|\btim\b/i, settore: 'Italia · Telecomunicazioni', fa: 'è l’ex monopolista del telefono, ancora alle prese con i suoi debiti' },
  { nome: 'Fincantieri', dominio: 'fincantieri.com', cnbc: 'FCT-IT', re: /fincantieri/i, settore: 'Italia · Industria', fa: 'costruisce navi, militari e da crociera' },
  { nome: 'Azimut', dominio: 'azimut-group.com', cnbc: 'AZM-IT', nomeBorsa: 'Azimut Holding', re: /\bazimut\b/i, settore: 'Italia · Risparmio', fa: 'gestisce i risparmi altrui' },
  { nome: 'Amplifon', dominio: 'amplifon.com', cnbc: 'AMP-IT', re: /amplifon/i, settore: 'Italia · Salute', fa: 'vende apparecchi acustici in mezzo mondo' },
  { nome: 'Nexi', dominio: 'nexi.it', cnbc: 'NEXI-IT', re: /\bnexi\b/i, settore: 'Italia · Pagamenti', fa: 'fa funzionare i pagamenti con carta in Italia' },
  { nome: 'Saipem', dominio: 'saipem.com', cnbc: 'SPM-IT', re: /saipem/i, settore: 'Italia · Energia', fa: 'costruisce impianti e piattaforme per le compagnie petrolifere' },
  { nome: 'Recordati', dominio: 'recordati.com', cnbc: null, re: /recordati/i, settore: 'Italia · Farmaceutica', fa: 'produce farmaci per malattie rare e di uso comune' },

  // —— Europa
  { nome: 'Airbus', dominio: 'airbus.com', cnbc: 'AIR-FR', re: /airbus/i, settore: 'Europa · Aerospazio', fa: 'costruisce aerei di linea, in duello perenne con Boeing' },
  { nome: 'Siemens', dominio: 'siemens.com', cnbc: 'SIE-DE', re: /siemens/i, settore: 'Europa · Industria', fa: 'fa automazione industriale, treni e tecnologia per le fabbriche' },
  { nome: 'Volkswagen', dominio: 'volkswagen.com', cnbc: 'VOW3-DE', re: /volkswagen/i, settore: 'Europa · Auto', fa: 'è il primo gruppo automobilistico europeo' },
  { nome: 'Mercedes-Benz', dominio: 'mercedes-benz.com', cnbc: 'MBG-DE', nomeBorsa: 'Mercedes-Benz Group', re: /mercedes/i, settore: 'Europa · Auto', fa: 'fa automobili di lusso tedesche' },
  { nome: 'BMW', dominio: 'bmw.com', cnbc: 'BMW-DE', nomeBorsa: 'Bayerische Motoren Werke', re: /\bbmw\b/i, settore: 'Europa · Auto', fa: 'fa automobili e moto di fascia alta' },
  { nome: 'Adidas', dominio: 'adidas.com', cnbc: 'ADS-DE', re: /adidas/i, settore: 'Europa · Consumi', fa: 'fa scarpe e abbigliamento sportivo' },
  { nome: 'Deutsche Bank', dominio: 'db.com', cnbc: 'DBK-DE', nomeBorsa: 'Deutsche Bank', re: /deutsche bank/i, settore: 'Europa · Banche', fa: 'è la maggiore banca tedesca' },
  { nome: 'BNP Paribas', dominio: 'bnpparibas.com', cnbc: 'BNP-FR', re: /bnp paribas/i, settore: 'Europa · Banche', fa: 'è la maggiore banca francese' },
  { nome: 'Banco Santander', dominio: 'santander.com', cnbc: 'SAN', re: /santander/i, settore: 'Europa · Banche', fa: 'è la maggiore banca spagnola' },
  { nome: 'Novo Nordisk', dominio: 'novonordisk.com', cnbc: 'NVO', re: /novo nordisk/i, settore: 'Europa · Farmaceutica', fa: 'fa i farmaci per il diabete e per l’obesità' },
  { nome: 'Sanofi', dominio: 'sanofi.com', cnbc: 'SNY', re: /sanofi/i, settore: 'Europa · Farmaceutica', fa: 'produce farmaci e vaccini' },
  { nome: 'AstraZeneca', dominio: 'astrazeneca.com', cnbc: 'AZN', re: /astrazeneca/i, settore: 'Europa · Farmaceutica', fa: 'produce farmaci, soprattutto contro i tumori' },
  { nome: 'Shell', dominio: 'shell.com', cnbc: 'SHEL', re: /\bshell\b/i, settore: 'Europa · Energia', fa: 'è una delle grandi compagnie petrolifere mondiali' },
  { nome: 'TotalEnergies', dominio: 'totalenergies.com', cnbc: 'TTE', re: /totalenergies/i, settore: 'Europa · Energia', fa: 'è la compagnia petrolifera francese' },
  { nome: 'Nestlé', dominio: 'nestle.com', cnbc: 'NSRGY', nomeBorsa: 'Nestle', re: /nestl[eé]/i, settore: 'Europa · Alimentari', fa: 'è il primo gruppo alimentare al mondo' },
  { nome: 'Unilever', dominio: 'unilever.com', cnbc: 'UL', re: /unilever/i, settore: 'Europa · Consumi', fa: 'fa detersivi, gelati e prodotti per la casa' },

  // —— Stati Uniti, fuori dalla tecnologia
  { nome: 'JPMorgan', dominio: 'jpmorganchase.com', cnbc: 'JPM', nomeBorsa: 'JPMorgan Chase', re: /jp ?morgan/i, settore: 'Stati Uniti · Banche', fa: 'è la maggiore banca americana' },
  { nome: 'Goldman Sachs', dominio: 'goldmansachs.com', cnbc: 'GS', re: /goldman sachs/i, settore: 'Stati Uniti · Banche', fa: 'è la banca d’affari più seguita di Wall Street' },
  { nome: 'Visa', dominio: 'visa.com', cnbc: 'V', re: /\bvisa inc\b|\bvisa\b(?= (inc|card|pagament))/i, settore: 'Stati Uniti · Pagamenti', fa: 'incassa una piccola quota su quasi ogni pagamento con carta' },
  { nome: 'Coca-Cola', dominio: 'coca-cola.com', cnbc: 'KO', nomeBorsa: 'Coca-Cola', re: /coca.?cola/i, settore: 'Stati Uniti · Bevande', fa: 'vende bibite in praticamente ogni paese del mondo' },
  { nome: 'McDonald’s', dominio: 'mcdonalds.com', cnbc: 'MCD', nomeBorsa: 'McDonald', re: /mcdonald/i, settore: 'Stati Uniti · Ristorazione', fa: 'è la catena di ristoranti più grande del mondo' },
  { nome: 'Starbucks', dominio: 'starbucks.com', cnbc: 'SBUX', re: /starbucks/i, settore: 'Stati Uniti · Ristorazione', fa: 'vende caffè, e misura la voglia di spendere degli americani' },
  { nome: 'Nike', dominio: 'nike.com', cnbc: 'NKE', re: /\bnike\b/i, settore: 'Stati Uniti · Consumi', fa: 'fa scarpe e abbigliamento sportivo' },
  { nome: 'Walmart', dominio: 'walmart.com', cnbc: 'WMT', re: /walmart/i, settore: 'Stati Uniti · Distribuzione', fa: 'è la più grande catena di negozi al mondo' },
  { nome: 'Disney', dominio: 'disney.com', cnbc: 'DIS', nomeBorsa: 'Walt Disney', re: /\bdisney\b/i, settore: 'Stati Uniti · Media', fa: 'fa film, parchi a tema e televisione' },
  { nome: 'Boeing', dominio: 'boeing.com', cnbc: 'BA', re: /boeing/i, settore: 'Stati Uniti · Aerospazio', fa: 'costruisce aerei di linea, in duello perenne con Airbus' },
  { nome: 'Pfizer', dominio: 'pfizer.com', cnbc: 'PFE', re: /pfizer/i, settore: 'Stati Uniti · Farmaceutica', fa: 'produce farmaci e vaccini' },
  { nome: 'Eli Lilly', dominio: 'lilly.com', cnbc: 'LLY', nomeBorsa: 'Eli Lilly', re: /eli lilly/i, settore: 'Stati Uniti · Farmaceutica', fa: 'fa i farmaci contro l’obesità che hanno cambiato il settore' },

  // —— Stati Uniti e Asia, tecnologia
  { nome: 'Dell', dominio: 'dell.com', cnbc: 'DELL', nomeBorsa: 'Dell Technologies', re: /dell technologies|\bdell\b(?!['’])/i, settore: 'Stati Uniti · Computer', fa: 'vende computer e server, oggi soprattutto per l’intelligenza artificiale' },
  { nome: 'IBM', dominio: 'ibm.com', cnbc: 'IBM', nomeBorsa: 'International Business Machines', re: /\bibm\b/i, settore: 'Stati Uniti · Informatica', fa: 'vende informatica alle grandi aziende, ed è il nome più antico del settore' },
  { nome: 'Cisco', dominio: 'cisco.com', cnbc: 'CSCO', nomeBorsa: 'Cisco Systems', re: /\bcisco\b/i, settore: 'Stati Uniti · Reti', fa: 'fa gli apparati che collegano fra loro le reti aziendali' },
  { nome: 'Salesforce', dominio: 'salesforce.com', cnbc: 'CRM', re: /salesforce/i, settore: 'Stati Uniti · Software', fa: 'vende il software con cui le aziende seguono i clienti' },
  { nome: 'Adobe', dominio: 'adobe.com', cnbc: 'ADBE', re: /\badobe\b/i, settore: 'Stati Uniti · Software', fa: 'fa i programmi con cui si disegna e si monta quasi tutto' },
  { nome: 'Uber', dominio: 'uber.com', cnbc: 'UBER', nomeBorsa: 'Uber Technologies', re: /\buber\b/i, settore: 'Stati Uniti · Trasporti', fa: 'porta in giro persone e cibo con l’app' },
  { nome: 'Airbnb', dominio: 'airbnb.com', cnbc: 'ABNB', re: /airbnb/i, settore: 'Stati Uniti · Viaggi', fa: 'affitta case per brevi periodi in tutto il mondo' },
  { nome: 'Spotify', dominio: 'spotify.com', cnbc: 'SPOT', nomeBorsa: 'Spotify Technology', re: /spotify/i, settore: 'Europa · Media', fa: 'è il servizio di musica in abbonamento più grande' },
  { nome: 'Coinbase', dominio: 'coinbase.com', cnbc: 'COIN', nomeBorsa: 'Coinbase Global', re: /coinbase/i, settore: 'Stati Uniti · Criptovalute', fa: 'è la borsa delle criptovalute quotata a Wall Street' },
  { nome: 'Sony', dominio: 'sony.com', cnbc: 'SONY', nomeBorsa: 'Sony Group', re: /\bsony\b/i, settore: 'Giappone · Tecnologia', fa: 'fa PlayStation, fotocamere, musica e film' },
  { nome: 'Toyota', dominio: 'toyota.com', cnbc: 'TM', nomeBorsa: 'Toyota Motor', re: /toyota/i, settore: 'Giappone · Auto', fa: 'è il primo costruttore di automobili al mondo' },
  { nome: 'Samsung', dominio: 'samsung.com', cnbc: 'SSNLF', nomeBorsa: 'Samsung Electronics', re: /samsung/i, settore: 'Corea · Tecnologia', fa: 'fa telefoni, televisori e le memorie dei computer' },
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

// ─────────────────────  l'anagrafica di chi l'agente sceglie  ────────────────
//
// Quando la scelta la fa l'agente (engine/scelta.mjs), il dizionario qui sopra
// cambia mestiere: non decide più chi entra, ma dice quello che sappiamo di chi
// è entrato — il codice di borsa, il settore, il logo già scaricato. Un'azienda
// che il dizionario non conosce entra comunque: avrà l'iniziale al posto del
// logo, e il prezzo soltanto se il codice che l'agente propone si rivela giusto.

const SUFFISSI = /\b(s\.?p\.?a|n\.?v|inc|incorporated|corp|corporation|ltd|plc|a\.?g|s\.?a|s\.?e|holdings?|group|gruppo|co|company|limited|platforms)\b/gi;
// Parole che da sole non identificano nessuno: senza questa lista "Banca Intesa"
// e "Banca Monte dei Paschi" sarebbero la stessa azienda.
const GENERICHE = new Set(['banca', 'bank', 'banco', 'assicurazioni', 'insurance', 'energia', 'energy',
  'motors', 'auto', 'telecom', 'industries', 'partners', 'capital', 'technology', 'technologies',
  'international', 'semiconductor', 'semiconduttori', 'systems', 'solutions', 'italia', 'italiana']);

const normalizza = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(SUFFISSI, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const significative = (s) => normalizza(s).split(' ').filter((t) => t.length >= 4 && !GENERICHE.has(t));

export function stessoNome(x, y) {
  const a = normalizza(x), b = normalizza(y);
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = significative(x), sb = significative(y);
  if (sa.length && sb.length) return sa.some((t) => sb.includes(t));
  // Nomi corti e senza parole proprie (PDD, AMD, Eni): o combaciano o no.
  return a.split(' ').some((t) => b.split(' ').includes(t));
}

// Prende le aziende scelte dall'agente e le completa: anagrafica dal dizionario
// quando c'è, quotazioni da CNBC, e un controllo sul codice di borsa proposto.
export async function componiAziende(scelte) {
  if (!scelte?.length) return [];

  const risolte = scelte.map((s) => {
    const d = AZIENDE.find((a) => stessoNome(a.nome, s.nome)) || AZIENDE.find((a) => a.re.test(s.nome));
    return {
      nome: d?.nome || s.nome,
      settore: d?.settore || s.settore,
      fa: d?.fa || s.fa,
      // Dove il dizionario dice esplicitamente che un titolo non è leggibile
      // (OpenAI, DeepSeek) la sua parola vale più di quella dell'agente.
      candidati: d ? (d.cnbc ? [d.cnbc] : []) : (s.simboli || []),
      daControllare: !d,
      dominio: d?.dominio || s.dominio || null,
      perche: s.perche,
      titoli: s.titoli,
      conosciuta: !!d,
    };
  });

  let prezzi = new Map();
  const simboli = [...new Set(risolte.flatMap((r) => r.candidati))];
  if (simboli.length) {
    try { prezzi = await quotazioniCnbc(simboli); }
    catch (e) { console.error(`  ! quotazioni delle aziende non disponibili: ${e.message}`); }
  }

  const out = [];
  for (const r of risolte) {
    // Fra i codici proposti si tiene il primo a cui la borsa risponde col nome
    // di questa azienda. Senza quel controllo un codice sbagliato darebbe il
    // prezzo di un'altra società, che è molto peggio di nessun prezzo.
    let sim = null, q = null;
    for (const c of r.candidati) {
      const v = prezzi.get(c);
      if (!v) continue;
      if (r.daControllare && !stessoNome(v.nome || '', r.nome)) {
        console.log(`  · [aziende] ${r.nome}: il codice ${c} risponde «${v.nome}», non è lei`);
        continue;
      }
      sim = c; q = v; break;
    }

    // Il logo: dal dizionario se c'è già, altrimenti dal sito che l'agente
    // indica — ma solo se quel sito porta il nome dell'azienda, perché il logo
    // sbagliato accanto al nome giusto è un errore che si vede.
    let logo = null;
    const nomeFile = slug(r.nome);
    if (await esisteLogo(nomeFile)) logo = nomeFile;
    else if (r.dominio) {
      const radiceDominio = r.dominio.replace(/\.[a-z.]{2,8}$/, '');
      if (r.conosciuta || stessoNome(radiceDominio, r.nome)) {
        if (await scaricaLogo(nomeFile, r.dominio)) { logo = nomeFile; console.log(`  · [aziende] logo di ${r.nome} scaricato da ${r.dominio}`); }
      } else {
        console.log(`  · [aziende] ${r.nome}: il sito ${r.dominio} non porta il suo nome, niente logo`);
      }
    }

    out.push({
      nome: r.nome, settore: r.settore, simbolo: sim, fa: r.fa, logo,
      prezzo: q?.prezzo ?? null, giorno: q?.giorno ?? null,
      perche: r.perche,
      motivo: '', scritto: 'nessuno',
      titoli: r.titoli.map((n) => ({ fonte: n.fonte, titolo: taglia(n.titolo, 130), link: n.link })),
    });
  }

  const senzaPrezzo = out.filter((a) => a.prezzo == null).length;
  console.log(`  aziende: ${out.length} (${out.map((x) => x.nome).join(', ')})${senzaPrezzo ? ` — ${senzaPrezzo} senza quotazione` : ''}`);
  const nuove = risolte.filter((r) => !r.conosciuta).map((r) => r.nome);
  if (nuove.length) console.log(`  · [aziende] fuori dal dizionario: ${nuove.join(', ')}`);
  const senzaLogo = out.filter((a) => !a.logo).map((a) => a.nome);
  if (senzaLogo.length) console.log(`  · [aziende] mostrano l'iniziale al posto del logo: ${senzaLogo.join(', ')}`);
  return out;
}

// Gli indici che l'agente ha segnalato, riportati agli strumenti veri.
export function componiIndici(indici, mercati) {
  const visti = new Set();
  const out = [];
  for (const x of indici || []) {
    const m = mercati.find((y) => normalizza(y.nome) === normalizza(x.nome)) || mercati.find((y) => stessoNome(y.nome, x.nome));
    if (!m || m.prezzo == null || visti.has(m.sym)) continue;
    visti.add(m.sym);
    out.push({ sym: m.sym, nome: m.nome, perche: x.perche });
  }
  if (out.length) console.log(`  da guardare: ${out.map((x) => x.nome).join(', ')}`);
  return out;
}

// ────────────────────────  le aziende che si possono seguire  ────────────────
//
// L'app lascia scegliere quali aziende tenere d'occhio ogni giorno, e la scelta
// resta sul dispositivo: il motore non sa quali siano. Quindi prepara la lista
// intera, con la quotazione di oggi e — per quelle di cui l'agente ha trovato
// qualcosa — la notizia. Per tutte le altre il campo resta vuoto, e l'app
// scrive da sé che oggi non c'era niente. Non sapere non è sapere il contrario,
// ma qui l'assenza di una riga è una risposta vera: i titoli sono stati letti.

export const NOMI_CONOSCIUTI = AZIENDE.map((a) => a.nome);

export async function componiRadar(note = []) {
  const perNome = new Map();
  for (const n of note) {
    const trovata = AZIENDE.find((a) => stessoNome(a.nome, n.nome));
    if (trovata) perNome.set(trovata.nome, n.notizia);
  }

  let prezzi = new Map();
  const simboli = AZIENDE.map((a) => a.cnbc).filter(Boolean);
  // CNBC accetta i simboli in una richiesta sola, ma a gruppi si resta
  // prudenti: un elenco lungo ogni tanto torna incompleto.
  for (let i = 0; i < simboli.length; i += 20) {
    try {
      const parte = await quotazioniCnbc(simboli.slice(i, i + 20));
      for (const [k, v] of parte) prezzi.set(k, v);
    } catch (e) { console.error(`  ! quotazioni del radar non disponibili: ${e.message}`); }
  }

  const sbagliati = [];
  const out = AZIENDE.map((a) => {
    let q = a.cnbc ? prezzi.get(a.cnbc) : null;
    // Lo stesso controllo delle aziende del giorno, applicato anche qui: un
    // codice scritto male nel dizionario darebbe il prezzo di un'altra società
    // senza che nessuno se ne accorgesse, perché nessuno guarda quarantadue
    // quotazioni una per una.
    // Alcune aziende in borsa si chiamano altrimenti: AMD è «Advanced Micro
    // Devices», BMW è «Bayerische Motoren Werke». Il dizionario lo dice.
    const combacia = stessoNome(q?.nome || '', a.nome) || (a.nomeBorsa && stessoNome(q?.nome || '', a.nomeBorsa));
    if (q && !combacia) { sbagliati.push(`${a.nome} → ${a.cnbc} è «${q.nome}»`); q = null; }
    return {
      nome: a.nome, settore: a.settore, fa: a.fa,
      logo: null,   // riempito sotto, solo dove il file c'è davvero
      prezzo: q?.prezzo ?? null, giorno: q?.giorno ?? null,
      notizia: perNome.get(a.nome) || null,
    };
  });
  for (const v of out) {
    const nomeFile = slug(v.nome);
    if (await esisteLogo(nomeFile)) v.logo = nomeFile;
  }
  for (const x of sbagliati) console.log(`  · [radar] codice sbagliato nel dizionario: ${x} — resta senza prezzo`);

  // Qualche logo manca sempre: il servizio che li fornisce limita chi insiste,
  // e con quasi cento aziende non arrivano tutti in una volta. Se ne recuperano
  // tre per esecuzione, così nel giro di qualche giorno ci sono tutti senza che
  // nessuno debba ricordarsene.
  let recuperati = 0;
  for (const a of AZIENDE) {
    if (recuperati >= 3) break;
    if (!a.dominio) continue;
    const nomeFile = slug(a.nome);
    if (await esisteLogo(nomeFile)) continue;
    if (await scaricaLogo(nomeFile, a.dominio)) {
      recuperati++;
      const voce = out.find((x) => x.nome === a.nome);
      if (voce) voce.logo = nomeFile;
      console.log(`  · [radar] logo di ${a.nome} recuperato`);
    }
  }
  console.log(`  radar: ${out.length} aziende seguibili, ${out.filter((x) => x.notizia).length} con una notizia oggi, ${out.filter((x) => x.prezzo != null).length} con la quotazione`);
  return out;
}
