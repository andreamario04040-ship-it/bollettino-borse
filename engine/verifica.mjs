// Controlla il bollettino prima che esca.
//
// Cosa può verificare: che i numeri scritti nelle frasi esistano davvero nei dati,
// che il clima corrisponda all'indice della paura, che la data sia quella di oggi,
// che le quotazioni siano plausibili e fresche, che ogni notizia citata esista.
//
// Cosa NON può verificare: se un giornale ha scritto il vero. Per quello l'unica
// difesa è citare la fonte e il titolo, come si fa, così si risale sempre all'origine.

import { pct, num, giornoRoma, oraItalia, minutiDaMezzanotteRoma } from './lingua.mjs';
import { materialePerAzienda } from './agente.mjs';

const AREE = {
  europa: ['^STOXX50E', 'FTSEMIB.MI', '^GDAXI', '^FCHI', '^FTSE'],
  usa: ['^GSPC', '^IXIC', '^DJI'],
  asia: ['^N225', '^HSI', '000001.SS'],
};

// I campi di uno strumento che contengono un numero che può finire in una frase.
const CAMPI_NUMERICI = ['prezzo', 'giorno', 'settimana', 'mese', 'trimestre', 'anno', 'max52', 'min52'];

// Tutti i modi in cui un valore può comparire scritto in una frase.
function formeDi(v) {
  const f = [];
  for (const d of [0, 1, 2]) { f.push(pct(v, d)); f.push(pct(Math.abs(v), d)); }
  return f;
}

// I numeri che un riassunto scritto dall'agente può legittimamente contenere:
// quelli che stanno nel materiale che ha letto, più la sua quotazione.
function numeriDi(testo) {
  return new Set((String(testo).match(/\d[\d.,]*/g) || [])
    // La punteggiatura della frase si attacca al numero: "vale 149,30, in calo"
    // dava il valore «149.30,», che non somiglia a nessun dato. Va tolta prima
    // di tutto il resto, altrimenti una cifra giusta sembra inventata.
    .map((x) => x.replace(/[.,]+$/, ''))
    .map((x) => x.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.').replace(/\.0+$/, ''))
    .filter((x) => x.replace('.', '').length >= 2));
}

export function verifica({ report, mercati, notizie = [], adesso = new Date() }) {
  const problemi = [];
  const segnala = (gravita, dove, cosa) => problemi.push({ gravita, dove, cosa });
  const g = (sym) => mercati.find((m) => m.sym === sym);

  // ——— 1. La data e l'ora sono quelle di adesso?
  if (report.data !== undefined) {
    const oggi = giornoRoma(adesso);
    if (report.generatoIl && giornoRoma(new Date(report.generatoIl)) !== oggi) {
      segnala('blocco', 'data', `il bollettino dice di essere del ${giornoRoma(new Date(report.generatoIl))}, ma oggi è ${oggi}`);
    }
    if (report.ora && Math.abs(minutiDaMezzanotteRoma(adesso) - minutiDaMezzanotteRoma(new Date(report.generatoIl))) > 90) {
      segnala('avviso', 'ora', `l'ora scritta (${report.ora}) è lontana da adesso (${oraItalia(adesso)})`);
    }
  }

  // ——— 2. Il clima deve venire dall'indice della paura, non da altro.
  const vix = g('^VIX');
  if (report.clima?.vix != null && vix?.prezzo != null && Math.abs(report.clima.vix - vix.prezzo) > 0.01) {
    segnala('blocco', 'clima', `il clima usa un indice della paura a ${report.clima.vix}, ma il dato è ${vix.prezzo}`);
  }

  // ——— 3. Le quotazioni: mancanti, ferme o inverosimili.
  const senzaPrezzo = mercati.filter((m) => m.prezzo == null);
  if (senzaPrezzo.length > mercati.length / 2) {
    segnala('blocco', 'mercati', `${senzaPrezzo.length} strumenti su ${mercati.length} non hanno un prezzo`);
  } else for (const m of senzaPrezzo) segnala('avviso', 'mercati', `${m.nome} non ha un prezzo`);

  for (const m of mercati) {
    if (m.obsoleto) segnala('avviso', 'mercati', `${m.nome} usa il valore dell'ultimo aggiornamento riuscito`);
    if (m.giorno != null && Math.abs(m.giorno) > 25) segnala('avviso', 'mercati', `${m.nome} segna ${pct(m.giorno)} in un giorno: inverosimile, controllare la fonte`);
    if (m.prezzo != null && m.prezzo <= 0) segnala('blocco', 'mercati', `${m.nome} ha prezzo ${m.prezzo}`);
    if (m.max52 != null && m.min52 != null && m.max52 < m.min52) segnala('blocco', 'mercati', `${m.nome} ha massimo minore del minimo`);
    if (m.spark && m.spark.length < 5 && !m.storicoScarso) segnala('avviso', 'mercati', `${m.nome} ha solo ${m.spark.length} punti di storico`);
  }

  // ——— 4. Ogni percentuale scritta nelle frasi deve esistere nei dati.
  const ammessi = new Set();
  for (const m of mercati) for (const k of ['giorno', 'settimana', 'mese', 'trimestre', 'anno']) {
    if (m[k] != null && isFinite(m[k])) formeDi(m[k]).forEach((x) => ammessi.add(x));
  }
  for (const a of report.aziende || []) if (a.giorno != null) formeDi(a.giorno).forEach((x) => ammessi.add(x));
  // Le medie per area: così si controlla anche che siano calcolate sugli stessi indici.
  for (const syms of Object.values(AREE)) {
    const v = syms.map((s) => g(s)?.giorno).filter((x) => x != null);
    if (v.length) formeDi(v.reduce((a, b) => a + b, 0) / v.length).forEach((x) => ammessi.add(x));
  }

  const testo = [
    ...(report.sezioni || []).map((s) => s.testo),
    report.notifica?.corpo, report.notifica?.titolo,
  ].filter(Boolean).join(' ');

  // Solo i numeri col segno: quelli senza sono soglie di lettura ("sopra il 4,5%"),
  // non dati, e non vanno cercati nei valori.
  for (const trovato of new Set(testo.match(/[+−]\d+(?:,\d+)?%/g) || [])) {
    if (!ammessi.has(trovato)) segnala('blocco', 'testo', `la frase cita ${trovato}, che non corrisponde a nessun dato scaricato`);
  }

  // ——— 5. Le aziende.
  for (const a of report.aziende || []) {
    if (a.simbolo && a.prezzo == null) segnala('avviso', 'aziende', `${a.nome}: simbolo ${a.simbolo} noto ma quotazione non arrivata`);
    if (!a.simbolo) segnala('nota', 'aziende', `${a.nome}: nessun simbolo in archivio, l'app dirà "quotazione non disponibile"`);
    if (!a.titoli?.length) segnala('avviso', 'aziende', `${a.nome} compare senza nessuna notizia che lo giustifichi`);
    for (const t of a.titoli || []) if (!t.link) segnala('avviso', 'aziende', `${a.nome}: notizia senza link, non verificabile`);
  }

  // ——— 5b. I riassunti dell'agente: ogni cifra deve stare nel materiale letto.
  //      È la difesa contro l'invenzione: un modello che scrive un numero
  //      che non ha letto da nessuna parte se l'è inventato.
  const materiale = report.materialeAgente || [];

  // Due domande diverse, che all'inizio avevo confuso in una.
  //
  // «Se l'è inventata?» si risponde guardando TUTTO il materiale del giorno:
  // le aziende arrivano all'agente in un'unica richiesta, quindi una cifra
  // dell'articolo di un'altra l'ha letta davvero, e inventata non è.
  //
  // «L'ha presa in prestito?» si risponde guardando il materiale di quella
  // azienda: una cifra che viene da un'altra scheda è vera ma fuori posto —
  // come lo spread dei BTP raccontato sotto il nome di Stellantis.
  //
  // La prima blocca la pubblicazione, la seconda la segnala. Tenerle insieme
  // significava bloccare per cifre giuste e non vedere le schede sporche.
  const cifreDelGiorno = new Set();
  const suoCifre = new Map();
  for (const a of report.aziende || []) {
    const sue = numeriDi(materialePerAzienda(a, materiale));
    // I sommari, quando l'articolo non si è potuto leggere, non entrano nel
    // materiale ma sono comunque roba di oggi: valgono.
    for (const t of a.titoli || []) {
      const fonte = materiale.find((m) => m.titolo === t.titolo || m.link === t.link);
      if (fonte?.sommario) for (const n of numeriDi(fonte.sommario)) sue.add(n);
    }
    suoCifre.set(a.nome, sue);
    for (const n of sue) cifreDelGiorno.add(n);
  }

  for (const a of report.aziende || []) {
    if (!['agente', 'estratto'].includes(a.scritto) || !a.motivo) continue;
    const sue = suoCifre.get(a.nome) || new Set();
    const scritte = [...numeriDi(a.motivo)];

    const inventate = scritte.filter((x) => !cifreDelGiorno.has(x));
    if (inventate.length >= 3) segnala('blocco', 'agente', `${a.nome}: il riassunto contiene ${inventate.length} cifre che non stanno in nessun articolo di oggi (${inventate.slice(0, 4).join(', ')})`);
    else for (const x of inventate) segnala('avviso', 'agente', `${a.nome}: la cifra ${x} non sta in nessun articolo di oggi`);

    const prestate = scritte.filter((x) => !sue.has(x) && cifreDelGiorno.has(x));
    if (prestate.length) segnala('avviso', 'agente', `${a.nome}: ${prestate.length} cifr${prestate.length === 1 ? 'a viene' : 'e vengono'} dal materiale di un'altra azienda (${prestate.slice(0, 4).join(', ')}): la scheda esce dal suo argomento`);

    if (a.materialeScarso) segnala('nota', 'agente', `${a.nome}: l'agente dice che il materiale di oggi non bastava`);
  }

  // ——— 5c. La scelta del giorno: la riga "perché oggi" e gli indici segnalati.
  //      Il primo giro dell'agente vede soltanto i titoli e i dati di mercato,
  //      non il testo degli articoli: quindi le sue cifre si controllano lì.
  //      Ed è il controllo che conta più di tutti, perché quella riga è la
  //      ragione per cui una scheda esiste: se è inventata, è inventata la
  //      scheda intera.
  const cifreDelMercato = new Set();
  for (const m of mercati) {
    for (const k of CAMPI_NUMERICI) {
      if (m[k] == null || !isFinite(m[k])) continue;
      numeriDi(num(m[k], m.decimali ?? 2)).forEach((x) => cifreDelMercato.add(x));
      formeDi(m[k]).forEach((x) => cifreDelMercato.add(x));
    }
  }
  const cifreDeiTitoli = new Set();
  for (const n of notizie) for (const x of numeriDi(`${n.titolo} ${n.sommario || ''}`)) cifreDeiTitoli.add(x);
  const ammesseNellaScelta = new Set([...cifreDeiTitoli, ...cifreDelMercato]);

  const controllaScelta = (dove, chi, frase) => {
    const fuori = [...numeriDi(frase)].filter((x) => !ammesseNellaScelta.has(x));
    // Una frase sola, breve: due cifre inventate lì dentro non sono una sbavatura.
    if (fuori.length >= 2) segnala('blocco', dove, `${chi}: la riga «perché oggi» cita ${fuori.length} cifre che non stanno né nei titoli né nei dati (${fuori.slice(0, 3).join(', ')})`);
    else for (const x of fuori) segnala('avviso', dove, `${chi}: la cifra ${x} della riga «perché oggi» non sta né nei titoli né nei dati`);
  };

  for (const a of report.aziende || []) if (a.perche) controllaScelta('scelta', a.nome, a.perche);

  for (const d of report.daGuardare || []) {
    const m = mercati.find((x) => x.sym === d.sym);
    if (!m) { segnala('blocco', 'scelta', `«${d.nome}» è segnalato fra i dati da guardare, ma non è fra gli strumenti scaricati`); continue; }
    if (m.prezzo == null) { segnala('avviso', 'scelta', `«${d.nome}» è segnalato da guardare ma oggi non ha un valore`); continue; }
    if (d.perche) controllaScelta('scelta', d.nome, d.perche);
  }

  // ——— 6. Le notizie citate devono essere fra quelle lette oggi.
  if (notizie.length) {
    const titoliVeri = new Set(notizie.map((n) => n.titolo));
    const citate = [
      ...(report.sezioni || []).flatMap((s) => s.riferimenti || []),
      ...(report.aziende || []).flatMap((a) => a.titoli || []),
    ];
    for (const c of citate) {
      const esiste = titoliVeri.has(c.titolo) || [...titoliVeri].some((t) => t.startsWith(c.titolo.replace(/…$/, '')));
      if (!esiste) segnala('blocco', 'notizie', `citata una notizia che non è fra quelle lette: «${c.titolo.slice(0, 60)}»`);
    }
  }

  return problemi;
}

export function stampaVerifica(problemi) {
  if (!problemi.length) { console.log('  verifica: tutto coerente'); return { blocchi: 0 }; }
  const ordine = { blocco: 0, avviso: 1, nota: 2 };
  const simbolo = { blocco: '✗', avviso: '⚠', nota: '·' };
  for (const p of [...problemi].sort((a, b) => ordine[a.gravita] - ordine[b.gravita])) {
    console.log(`  ${simbolo[p.gravita]} [${p.dove}] ${p.cosa}`);
  }
  const blocchi = problemi.filter((p) => p.gravita === 'blocco').length;
  console.log(`  verifica: ${blocchi} da bloccare, ${problemi.filter((p) => p.gravita === 'avviso').length} da guardare, ${problemi.filter((p) => p.gravita === 'nota').length} note`);
  return { blocchi };
}
