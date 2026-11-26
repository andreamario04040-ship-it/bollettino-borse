/* Borsa — nessuna libreria: legge due file JSON e disegna l'app. */

// Si alza a ogni modifica dell'app, insieme a docs/versione.json.
// Serve perché un'app aggiunta alla schermata Home resta viva in memoria:
// riaprendola dal selettore non ricarica, e resterebbe vecchia per giorni.
const VERSIONE_APP = 19;

const CHIAVE_PUBBLICA = 'BEX2Ep7AZJPgrIF_cHwKOWk9VSiE8OLd1WLxSJDANLNEbox4xiHYb5pgRslEapXEXZs35jhSmHRhrLcfFhyPwVk';
const MENO = '−', SOTTILE = ' ';
const $ = (id) => document.getElementById(id);

let MERCATI = [], REPORT = null, CORREZIONI = [], GLOSSARIO = [], periodo = 'giorno', aperto = null;

/* ——————————————— numeri all'italiana ——————————————— */
const num = (n, dec) => {
  if (n == null || !isFinite(n)) return '—';
  const d = dec ?? (Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 2 : 4);
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? MENO : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, SOTTILE) + (f ? ',' + f : '');
};
const pct = (n, dec = 2) => n == null || !isFinite(n) ? '—'
  : (n > 0 ? '+' : n < 0 ? MENO : '') + Math.abs(n).toFixed(dec).replace('.', ',') + '%';

// Per il VIX e per i tassi salire è una cattiva notizia: il colore va rovesciato.
const classe = (n, inverso = false) => {
  if (n == null || !isFinite(n)) return '';
  return (inverso ? n < 0 : n >= 0) ? 'su' : 'giu';
};
const fuga = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ——————————————— grafici ——————————————— */
function linea(valori, largo, alto, inverso, pieno) {
  if (!valori || valori.length < 2) return '';
  const lo = Math.min(...valori), hi = Math.max(...valori), r = (hi - lo) || 1, pad = 3;
  const p = valori.map((v, i) => [
    pad + i * (largo - 2 * pad) / (valori.length - 1),
    alto - pad - (v - lo) / r * (alto - 2 * pad),
  ]);
  const d = 'M' + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const salito = valori[valori.length - 1] >= valori[0];
  const col = (inverso ? !salito : salito) ? 'var(--su)' : 'var(--giu)';
  // La classe serve al CSS per dare alla linea un bagliore del suo stesso colore.
  const cls = (inverso ? !salito : salito) ? 'su' : 'giu';
  const ultimo = p[p.length - 1];
  const area = pieno ? `<path d="${d} L${ultimo[0].toFixed(1)} ${alto} L${p[0][0].toFixed(1)} ${alto} Z" fill="${col}" opacity=".12" stroke="none"/>` : '';
  const punto = pieno ? `<circle cx="${ultimo[0].toFixed(1)}" cy="${ultimo[1].toFixed(1)}" r="3" fill="${col}" stroke="none"/>` : '';
  return `<svg class="${cls}" viewBox="0 0 ${largo} ${alto}" preserveAspectRatio="none" aria-hidden="true">
    ${area}<path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"
      stroke-linecap="round" vector-effect="non-scaling-stroke"/>${punto}</svg>`;
}

// L'arco del clima: da sereno (sinistra) a allarme (destra).
function arcoClima(punteggio) {
  const p = Math.max(0, Math.min(100, punteggio));
  const cx = 90, cy = 90, r = 70;
  const ang = Math.PI * (1 - p / 100);
  const mx = cx + r * Math.cos(ang), my = cy - r * Math.sin(ang);
  return `<svg viewBox="0 0 180 104" role="img" aria-label="Clima ${p} su 100">
    <defs><linearGradient id="arco" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="var(--su)"/><stop offset="52%" stop-color="var(--attenzione)"/>
      <stop offset="100%" stop-color="var(--giu)"/></linearGradient></defs>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="url(#arco)"
      stroke-width="13" stroke-linecap="round" opacity=".92"/>
    <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="8.5" fill="var(--superficie)" stroke="var(--testo)" stroke-width="3.2"/>
    <text x="${cx}" y="74" text-anchor="middle" fill="var(--testo)" stroke="none"
      style="font:700 25px var(--fd);font-variant-numeric:tabular-nums">${p}</text>
    <text x="${cx}" y="88" text-anchor="middle" fill="var(--testo3)" stroke="none" style="font:500 9.5px var(--fb)">su 100</text>
  </svg>`;
}

function notaClima(p, vix) {
  const base = p < 24 ? 'Gli operatori sono tranquilli: pochi scossoni in vista.'
    : p < 40 ? 'Mercato ordinato, senza tensioni particolari.'
    : p < 56 ? 'Qualche incertezza, ma niente di fuori dal comune.'
    : p < 72 ? 'Gli operatori sono nervosi e si muovono con cautela.'
    : p < 86 ? 'Tensione alta: in giornate così i movimenti sono ampi.'
    : 'Paura forte sul mercato: oscillazioni molto ampie.';
  return vix != null ? `${base} Indice della paura a ${num(vix, 1)}.` : base;
}

/* ——————————————— glossario ——————————————— */
// Sottolinea la prima comparsa di ogni termine economico, e non di più:
// una pagina tutta sottolineata non si legge.
function evidenziaTermini(sicuro) {
  if (!GLOSSARIO.length || !sicuro) return sicuro;

  // Si lavora a pezzi: quelli già trasformati in pulsanti non si toccano più.
  let pezzi = [{ testo: true, v: sicuro }];
  for (const t of GLOSSARIO) {
    let fatto = false;
    pezzi = pezzi.flatMap((p) => {
      if (fatto || !p.testo) return [p];
      for (const forma of t.forme) {
        const re = new RegExp(`(^|[^\\p{L}])(${forma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'iu');
        const m = p.v.match(re);
        if (!m) continue;
        fatto = true;
        const i = m.index + m[1].length;
        return [
          { testo: true, v: p.v.slice(0, i) },
          { testo: false, v: `<button class="termine" data-termine="${t.id}">${p.v.slice(i, i + m[2].length)}</button>` },
          { testo: true, v: p.v.slice(i + m[2].length) },
        ];
      }
      return [p];
    });
  }
  return pezzi.map((p) => p.v).join('');
}

const testo = (t) => evidenziaTermini(fuga(t));

/* ——————————————— pannello delle spiegazioni ——————————————— */
function apriPannello({ tipo, titolo, corpo }) {
  $('pan-tipo').textContent = tipo;
  $('pan-titolo').textContent = titolo;
  $('pan-corpo').innerHTML = corpo;
  const d = $('pannello');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

function spiegaTermine(id) {
  const t = GLOSSARIO.find((x) => x.id === id);
  if (!t) return;
  apriPannello({ tipo: 'Parola di economia', titolo: t.forme[0], corpo: `<p class="pan-testo">${fuga(t.spiega)}</p>` });
}

function spiegaIndice(sym) {
  const m = MERCATI.find((x) => x.sym === sym);
  if (!m?.guida) return;
  const g = m.guida;
  const scala = (g.scala || []).length
    ? `<dl class="pan-scala">${g.scala.map(([q, c]) => `<div><dt>${fuga(q)}</dt><dd>${fuga(c)}</dd></div>`).join('')}</dl>`
    : '';
  const riga = (et, v) => v ? `<p class="pan-voce"><span>${et}</span>${testo(v)}</p>` : '';
  apriPannello({
    tipo: m.breve || 'Indice',
    titolo: m.nome,
    corpo: `<p class="pan-testo">${testo(g.cosa)}</p>${scala}
      ${riga('Se sale', g.sesale)}${riga('Se scende', g.sescende)}${riga('Perché conta', g.conta)}
      <p class="pan-ora">Adesso: <b>${num(m.prezzo, m.decimali)}</b> <span class="varia ${classe(m.giorno, m.inverso)}">${pct(m.giorno)}</span></p>`,
  });
}

/* ——————————————— correzioni ——————————————— */
const GIORNI_CORREZIONE = 14;

function letteSalvate() {
  try { return new Set(JSON.parse(localStorage.getItem('correzioniLette') || '[]')); }
  catch { return new Set(); }
}

function disegnaCorrezioni() {
  const lette = letteSalvate();
  const limite = Date.now() - GIORNI_CORREZIONE * 86400000;
  const da = CORREZIONI
    .filter((c) => !lette.has(c.id))
    .filter((c) => !c.data || new Date(c.data + 'T00:00:00').getTime() > limite);

  $('correzioni').innerHTML = da.map((c) => `<section class="correzione" data-id="${fuga(c.id)}">
    <div class="corr-testa">
      <span class="corr-etichetta">Ho fatto un errore</span>
      <button class="corr-chiudi" data-chiudi="${fuga(c.id)}">Ho capito</button>
    </div>
    <h2 class="corr-titolo">${fuga(c.titolo)}</h2>
    <p class="corr-voce"><span>Cosa avevo sbagliato</span>${fuga(c.sbagliato)}</p>
    <p class="corr-voce"><span>Com'è adesso</span>${fuga(c.corretto)}</p>
  </section>`).join('');
}

/* ——————————————— saluto ——————————————— */
const PAROLE = ['nessuna', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const maiuscola = (t = '') => t.charAt(0).toUpperCase() + t.slice(1);

// Il nome scritto nell'app vince su quello del motore: l'app è sua.
function nomeUtente() {
  try { const n = localStorage.getItem('nome'); if (n !== null) return n; } catch { /* finestra privata */ }
  return REPORT?.utente?.nome || '';
}

function disegnaSaluto() {
  const adesso = new Date();
  const o = adesso.getHours();
  const momento = o < 5 ? 'Buonanotte' : o < 13 ? 'Buongiorno' : o < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const nome = nomeUtente().trim();

  $('saluto-riga').textContent = nome ? `${momento} ${nome}` : momento;
  $('saluto-data').textContent = maiuscola(new Intl.DateTimeFormat('it-IT',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(adesso));

  const quante = (REPORT?.sezioni || []).length;
  $('saluto-invito').textContent = !REPORT
    ? 'Il bollettino di oggi non è ancora stato pubblicato.'
    : REPORT.tipo === 'avviso'
      ? 'Ti ho scritto perché sui mercati è successo qualcosa che vale la pena sapere subito.'
      : `Queste sono le ${PAROLE[quante] || quante} cose che devi sapere oggi, una per paragrafo.`;

  $('saluto').hidden = false;
}

/* ——————————————— disegno ——————————————— */
function disegnaNastro() {
  const scelti = ['FTSEMIB.MI', '^STOXX50E', '^GSPC', '^IXIC', '^N225', '^VIX', 'GC=F', 'BTC-USD'];
  $('nastro-int').innerHTML = scelti.map((s) => {
    const d = MERCATI.find((m) => m.sym === s);
    if (!d || d.giorno == null) return '';
    return `<span class="tk"><b>${fuga(d.nome)}</b> <i class="${classe(d.giorno, d.inverso)}">${pct(d.giorno)}</i></span>`;
  }).join('');
}

function disegnaOggi() {
  if (!REPORT) {
    $('titolone').innerHTML = '<div class="caricamento">Il bollettino di oggi non è ancora stato pubblicato.</div>';
    return;
  }
  const n = REPORT.notifica || {};
  $('quando').textContent = `Bollettino del ${REPORT.tipo === 'sera' ? 'pomeriggio' : REPORT.tipo === 'avviso' ? 'giorno' : 'mattino'}${REPORT.ora ? `, delle ${REPORT.ora}` : ''}`;

  if (REPORT.clima) {
    $('clima-scheda').hidden = false;
    $('clima-parola').textContent = REPORT.clima.parola;
    $('clima-nota').innerHTML = testo(notaClima(REPORT.clima.punteggio, REPORT.clima.vix));
    $('clima-arco').innerHTML = arcoClima(REPORT.clima.punteggio);
  }

  $('titolone').innerHTML = `<h2>${fuga(n.titolo || '')}</h2><p class="sommario">${fuga(n.corpo || '')}</p>`;

  $('sezioni').innerHTML = (REPORT.sezioni || []).map((s, i) => {
    const link = (s.riferimenti || []).map((r) => `<a class="fonte-link" href="${fuga(r.link || '#')}" target="_blank" rel="noopener">
      <span class="testata">${fuga(r.fonte)}</span>${fuga(r.titolo)}</a>`).join('');
    // La sezione che parla di un indice preciso se lo porta dietro disegnato.
    const m = s.sym ? MERCATI.find((x) => x.sym === s.sym) : null;
    const disegno = m?.spark?.length ? `<div class="sezione-grafico">
      <div class="sg-testa"><span class="sg-nome">${fuga(m.nome)}</span>
        <span class="sg-valore">${num(m.prezzo, m.decimali)}</span>
        <span class="varia ${classe(m.giorno, m.inverso)}">${pct(m.giorno)}</span></div>
      ${linea(m.spark, 300, 62, m.inverso, true)}
      <div class="sg-piede">ultimi tre mesi</div></div>` : '';
    return `<article class="sezione" data-sezione="${fuga(s.id || '')}">
      <div class="sezione-testa"><span class="gettone">${i + 1}</span><h3>${fuga(s.titolo)}</h3></div>
      <p>${testo(s.testo)}</p>${disegno}${link ? `<div class="fonti-link">${link}</div>` : ''}</article>`;
  }).join('');

  $('piede-oggi').textContent = REPORT.ora ? `Bollettino delle ${REPORT.ora}` : '';
}

// I numeri che altrimenti resterebbero sepolti nel testo, resi guardabili:
// valore, variazione e andamento dell'ultimo trimestre in un colpo d'occhio.
const TESSERE = [
  ['^VIX', 'Paura'], ['^TNX', 'Tasso USA 10 anni'], ['EURUSD=X', 'Euro / Dollaro'],
  ['GC=F', 'Oro'], ['CL=F', 'Petrolio'], ['BTC-USD', 'Bitcoin'],
];

function disegnaTessere() {
  const voci = TESSERE.map(([sym, et]) => [MERCATI.find((m) => m.sym === sym), et]).filter(([m]) => m?.prezzo != null);
  $('tessere').innerHTML = voci.map(([m, et]) => `<div class="tessera">
    <span class="t-nome">${fuga(et)}
      ${m.guida ? `<button class="chiedi" data-guida="${fuga(m.sym)}" aria-label="Cos'è ${fuga(m.nome)}">?</button>` : ''}</span>
    <span class="t-riga">
      <span class="t-valore">${num(m.prezzo, m.decimali)}</span>
      <span class="varia ${classe(m.giorno, m.inverso)}">${pct(m.giorno)}</span>
    </span>
    <span class="t-graf">${linea(m.spark, 120, 26, m.inverso, true)}</span>
    <span class="t-periodo">tre mesi</span>
  </div>`).join('');
}

// I dati che oggi dicono qualcosa, scelti e motivati dall'agente. Le tessere
// qui sotto mostrano sempre gli stessi sei numeri: questa invece cambia ogni
// giorno, ed è l'unica che spiega perché valga la pena guardarli.
function disegnaGuardare() {
  const g = (REPORT?.daGuardare || []).filter((d) => MERCATI.some((m) => m.sym === d.sym && m.prezzo != null));
  $('guardare-scheda').hidden = g.length === 0;
  $('capitolo-guardare').hidden = g.length === 0;
  if (!g.length) return;
  $('guardare-conteggio').textContent = `${g.length} segnalat${g.length === 1 ? 'o' : 'i'}`;

  $('guardare').innerHTML = g.map((d) => {
    const m = MERCATI.find((x) => x.sym === d.sym);
    return `<article class="guardare">
      <div class="gu-testa">
        <span class="gu-nome">${fuga(m.nome)}
          ${m.guida ? `<button class="chiedi" data-guida="${fuga(m.sym)}" aria-label="Cos'è ${fuga(m.nome)}">?</button>` : ''}</span>
        <span class="gu-numeri">
          <span class="gu-valore">${num(m.prezzo, m.decimali)}</span>
          <span class="varia ${classe(m.giorno, m.inverso)}">${pct(m.giorno)}</span>
        </span>
      </div>
      <p class="gu-perche">${testo(d.perche)}</p>
      ${m.spark?.length ? `<div class="gu-graf">${linea(m.spark, 320, 46, m.inverso, true)}</div>` : ''}
    </article>`;
  }).join('');
}

/* ——————————————— i preferiti ———————————————
   La scelta resta sul dispositivo: nessuno la carica da nessuna parte, e
   iPhone e Mac possono avere liste diverse. Il motore non sa quali siano, e fa
   una cosa più semplice: ogni giorno passa in rassegna tutte le aziende che
   conosce e dice quali hanno una notizia. Per quelle che aggiungi tu, che il
   motore non conosce, nessun agente è andato a cercare: l'app guarda da sé nei
   titoli del giorno e dice quali la nominano. È meno di un riassunto, ed è
   detto per quello che è. */

let TITOLI = [];
let filtro = '';

const leggiLista = (chiave) => { try { return JSON.parse(localStorage.getItem(chiave) || '[]'); } catch { return []; } };
// Un solo punto in cui le liste cambiano: così la sincronia se ne accorge
// sempre, invece di dipendere dal fatto che qualcuno si ricordi di avvisarla.
let applicandoRemoto = false;
const scriviLista = (chiave, v) => {
  try { localStorage.setItem(chiave, JSON.stringify(v)); } catch { /* finestra privata: pazienza */ }
  if (!applicandoRemoto && ['preferite', 'fissate', 'aggiunte'].includes(chiave)) segnaCambiamento();
};

const preferiteSalvate = () => leggiLista('preferite');
const fissateSalvate = () => leggiLista('fissate');
const aggiunteSalvate = () => leggiLista('aggiunte');

const senzaSegni = (t) => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Il catalogo: quello che conosce il motore, più quello che hai aggiunto tu.
function catalogo() {
  const dal = (REPORT?.radar || []).map((a) => ({ ...a, tua: false }));
  const noti = new Set(dal.map((a) => senzaSegni(a.nome)));
  const tue = aggiunteSalvate()
    .filter((n) => !noti.has(senzaSegni(n)))
    .map((n) => ({ nome: n, settore: 'Aggiunta da te', fa: '', logo: null, prezzo: null, giorno: null, notizia: null, tua: true }));
  return [...dal, ...tue];
}
const voceDi = (nome) => catalogo().find((a) => a.nome === nome);

// I titoli di oggi che nominano un'azienda. Serve per le aziende aggiunte da
// te, e come ripiego quando l'agente non ha trovato niente da raccontare.
function titoliChePerlano(nome) {
  const n = senzaSegni(nome);
  if (n.length < 3) return [];
  const re = new RegExp(`\\b${n.replace(/ +/g, '\\s+')}\\b`);
  return TITOLI.filter((t) => re.test(senzaSegni(t.t))).slice(0, 3);
}

// L'ordine: prima quelle fissate, nell'ordine in cui le hai fissate.
function preferiteOrdinate() {
  const scelte = preferiteSalvate().filter((n) => voceDi(n));
  const fisse = fissateSalvate().filter((n) => scelte.includes(n));
  return [...fisse, ...scelte.filter((n) => !fisse.includes(n))];
}

function schedaPreferita(nome) {
  const a = voceDi(nome);
  if (!a) return '';
  const fissa = fissateSalvate().includes(nome);
  const prezzo = a.prezzo != null
    ? `<span class="az-prezzo">${num(a.prezzo, 2)} <span class="varia ${classe(a.giorno)}">${pct(a.giorno)}</span></span>`
    : `<span class="az-prezzo az-nonquotata">${a.tua ? 'azienda aggiunta da te' : 'quotazione non disponibile'}</span>`;

  let corpo;
  if (a.notizia) {
    corpo = `<p class="az-motivo">${testo(a.notizia)}</p>`;
  } else {
    const t = titoliChePerlano(nome);
    corpo = t.length
      ? `<p class="az-quieta">${a.tua
          ? 'Questa azienda non la seguo ogni giorno, ma oggi la nominano:'
          : 'Niente di rilevante oggi, ma la nominano:'}</p>
         <div class="fonti-link">${t.map((x) => `<a class="fonte-link" href="${fuga(x.l || '#')}" target="_blank" rel="noopener">
           <span class="testata">${fuga(x.f)}</span>${fuga(x.t)}</a>`).join('')}</div>`
      : `<p class="az-quieta">Oggi i giornali non ne hanno parlato.</p>`;
  }

  return `<article class="azienda preferita${a.notizia ? '' : ' quieta'}" data-apri="${fuga(nome)}" role="button" tabindex="0">
    <div class="az-testa">
      <span class="az-identita">
        ${a.logo
          ? `<img class="az-logo" src="loghi/${fuga(a.logo)}.png" alt="" width="34" height="34" loading="lazy" decoding="async">`
          : `<span class="az-iniziale">${fuga(a.nome.slice(0, 1))}</span>`}
        <span><span class="az-nome">${fuga(a.nome)}</span><span class="az-settore">${fuga(a.settore)}</span></span>
      </span>
      ${prezzo}
    </div>
    ${a.fa ? `<p class="az-fa">${fuga(a.nome)} ${testo(a.fa)}.</p>` : ''}
    ${corpo}
    <div class="az-comandi">
      <button class="az-tasto${fissa ? ' attivo' : ''}" data-fissa="${fuga(nome)}">${fissa ? '📌 In cima' : 'Metti in cima'}</button>
      <button class="az-tasto" data-togli="${fuga(nome)}">Togli</button>
    </div>
  </article>`;
}

function disegnaPreferiti() {
  const lista = preferiteOrdinate();
  const tutte = catalogo();
  $('pref-conteggio').textContent = `${lista.length} segu${lista.length === 1 ? 'ita' : 'ite'}`;

  const conNotizia = lista.filter((n) => voceDi(n)?.notizia).length;
  $('pref-piede').textContent = !tutte.length
    ? 'Il bollettino di oggi non è ancora stato pubblicato.'
    : !lista.length
      ? ''
      : conNotizia
        ? `Oggi ho trovato qualcosa su ${conNotizia} delle ${lista.length} che segui.`
        : `Oggi sui giornali non c'era niente su nessuna delle ${lista.length} che segui. Succede: non tutti i giorni accade qualcosa.`;

  $('pref-lista').innerHTML = lista.length
    ? lista.map(schedaPreferita).join('')
    : `<div class="scheda vuoto"><p>Non segui ancora nessuna azienda. Cercala qui sopra e toccala per aggiungerla.</p></div>`;

  for (const img of $('pref-lista').querySelectorAll('.az-logo')) {
    img.addEventListener('error', () => {
      const i = document.createElement('span');
      i.className = 'az-iniziale';
      i.textContent = (img.closest('.azienda')?.querySelector('.az-nome')?.textContent || '?').slice(0, 1);
      img.replaceWith(i);
    }, { once: true });
  }
  disegnaRisultati();
}

function disegnaRisultati() {
  const q = senzaSegni(filtro);
  const box = $('pref-risultati');
  if (!q) { box.innerHTML = ''; return; }

  const scelte = new Set(preferiteSalvate());
  const trovate = catalogo()
    .filter((a) => senzaSegni(a.nome).includes(q) || senzaSegni(a.settore).includes(q))
    .sort((x, y) => senzaSegni(x.nome).indexOf(q) - senzaSegni(y.nome).indexOf(q))
    .slice(0, 12);

  const esatta = catalogo().some((a) => senzaSegni(a.nome) === q);
  const aggiungi = !esatta && filtro.trim().length >= 2
    ? `<button class="pref-voce pref-nuova" data-aggiungi="${fuga(filtro.trim())}">
         <span class="pref-stella" aria-hidden="true">+</span>
         <span class="pref-nome">Aggiungi «${fuga(filtro.trim())}»</span>
       </button>`
    : '';

  box.innerHTML = `<div class="pref-elenco">${trovate.map((a) => `
    <button class="pref-voce" data-preferita="${fuga(a.nome)}" aria-pressed="${scelte.has(a.nome)}">
      <span class="pref-stella" aria-hidden="true">${scelte.has(a.nome) ? '★' : '☆'}</span>
      <span class="pref-nome">${fuga(a.nome)}</span>
      <span class="pref-settore-r">${fuga(a.settore)}</span>
      ${a.notizia ? '<span class="pref-oggi">oggi</span>' : ''}
    </button>`).join('')}${aggiungi}</div>
    ${!trovate.length && !aggiungi ? '<p class="testo">Nessuna azienda con questo nome.</p>' : ''}`;
}

async function caricaTitoli() {
  if (TITOLI.length) return;
  try {
    const r = await fetch(`data/titoli.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) TITOLI = await r.json();
  } catch { /* senza titoli le aziende aggiunte da te restano senza nulla */ }
}

/* ——————————————— la scheda ingrandita ———————————————
   Le card stanno strette: nel carosello il testo è tagliato, e anche dove non
   lo è si legge in una colonna sottile. Toccandola si apre qui, grande, con il
   testo intero — che su uno schermo da Mac è la differenza fra scorrere e
   leggere davvero. */
function datiAzienda(nome) {
  return (REPORT?.aziende || []).find((a) => a.nome === nome)
    || (typeof catalogo === 'function' ? catalogo().find((a) => a.nome === nome) : null);
}

function apriAzienda(nome) {
  const a = datiAzienda(nome);
  if (!a) return;

  const prezzo = a.prezzo != null
    ? `<span class="fg-prezzo">${num(a.prezzo, 2)} <span class="varia ${classe(a.giorno)}">${pct(a.giorno)}</span></span>`
    : `<span class="fg-prezzo az-nonquotata">${a.tua ? 'azienda aggiunta da te' : 'quotazione non disponibile'}</span>`;

  const link = (a.titoli || []).map((t) => `<a class="fonte-link" href="${fuga(t.link || '#')}" target="_blank" rel="noopener">
    <span class="testata">${fuga(t.fonte)}</span>${fuga(t.titolo)}</a>`).join('');

  let corpo = '';
  if (a.motivo) corpo = `<p class="fg-testo">${testo(a.motivo)}</p>`;
  else if (a.notizia) corpo = `<p class="fg-testo">${testo(a.notizia)}</p>`;
  else {
    const t = typeof titoliChePerlano === 'function' ? titoliChePerlano(nome) : [];
    corpo = t.length
      ? `<p class="fg-quieta">Niente di rilevante oggi, ma la nominano:</p>
         <div class="fonti-link">${t.map((x) => `<a class="fonte-link" href="${fuga(x.l || '#')}" target="_blank" rel="noopener">
           <span class="testata">${fuga(x.f)}</span>${fuga(x.t)}</a>`).join('')}</div>`
      : '<p class="fg-quieta">Oggi i giornali non ne hanno parlato.</p>';
  }

  $('foglio-corpo').innerHTML = `
    <div class="fg-testa">
      ${a.logo
        ? `<img class="fg-logo" src="loghi/${fuga(a.logo)}.png" alt="" width="48" height="48" decoding="async">`
        : `<span class="fg-iniziale">${fuga(a.nome.slice(0, 1))}</span>`}
      <div class="fg-nomi">
        <h2>${fuga(a.nome)}</h2>
        <p>${fuga(a.settore)}</p>
      </div>
      ${prezzo}
    </div>
    ${a.fa ? `<p class="fg-fa">${fuga(a.nome)} ${testo(a.fa)}.</p>` : ''}
    ${a.perche ? `<p class="fg-perche"><span class="az-perche-et">Perché oggi</span>${testo(a.perche)}</p>` : ''}
    ${corpo}
    ${a.materialeScarso ? '<p class="az-nota">Oggi i giornali la citano senza spiegare bene cosa sia successo.</p>' : ''}
    ${a.scritto === 'agente' ? '<p class="az-firma">Riassunto dagli articoli di oggi</p>' : ''}
    ${link ? `<div class="fonti-link">${link}</div>` : ''}`;

  const d = $('foglio');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

/* ——————————————— carosello delle aziende del giorno ——————————————— */
function vetrineAziende() { return [...$('aziende').querySelectorAll('.azienda')]; }

function vetrinaCorrente() {
  const v = vetrineAziende();
  if (!v.length) return 0;
  const centro = $('aziende').scrollLeft + $('aziende').clientWidth / 2;
  let vicina = 0, distanza = Infinity;
  v.forEach((el, i) => {
    const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centro);
    if (d < distanza) { distanza = d; vicina = i; }
  });
  return vicina;
}

function vaiAVetrina(i) {
  const v = vetrineAziende();
  if (!v.length) return;
  const n = Math.max(0, Math.min(v.length - 1, i));
  $('aziende').scrollTo({ left: v[n].offsetLeft - ($('aziende').clientWidth - v[n].offsetWidth) / 2, behavior: 'smooth' });
}

function aggiornaPallini() {
  const corrente = vetrinaCorrente();
  const v = vetrineAziende();
  for (const [i, p] of [...$('az-pallini').children].entries()) p.classList.toggle('attivo', i === corrente);
  $('az-indietro').disabled = corrente === 0;
  $('az-avanti').disabled = corrente >= v.length - 1;
}

function disegnaAziende() {
  const az = REPORT?.aziende || [];
  $('aziende-scheda').hidden = az.length === 0;
  $('capitolo-aziende').hidden = az.length === 0;
  if (!az.length) return;
  $('aziende-conteggio').textContent = `${az.length} oggi`;

  $('aziende').innerHTML = az.map((a) => {
    const prezzo = a.prezzo != null
      ? `<span class="az-prezzo">${num(a.prezzo, 2)} <span class="varia ${classe(a.giorno)}">${pct(a.giorno)}</span></span>`
      : '<span class="az-prezzo az-nonquotata">quotazione non disponibile</span>';
    const link = (a.titoli || []).map((t) => `<a class="fonte-link" href="${fuga(t.link || '#')}" target="_blank" rel="noopener">
      <span class="testata">${fuga(t.fonte)}</span>${fuga(t.titolo)}</a>`).join('');
    return `<article class="azienda" data-apri="${fuga(a.nome)}" role="button" tabindex="0">
      <div class="az-testa">
        <span class="az-identita">
          ${a.logo
            ? `<img class="az-logo" src="loghi/${fuga(a.logo)}.png" alt="" width="34" height="34" loading="lazy" decoding="async">`
            : `<span class="az-iniziale">${fuga(a.nome.slice(0, 1))}</span>`}
          <span><span class="az-nome">${fuga(a.nome)}</span><span class="az-settore">${fuga(a.settore)}</span></span>
        </span>
        ${prezzo}
      </div>
      <p class="az-fa">${fuga(a.nome)} ${testo(a.fa)}.</p>
      ${a.perche ? `<p class="az-perche"><span class="az-perche-et">Perché oggi</span>${testo(a.perche)}</p>` : ''}
      ${a.motivo ? `<p class="az-motivo">${testo(a.motivo)}</p>` : ''}
      ${a.materialeScarso ? '<p class="az-nota">Oggi i giornali la citano senza spiegare bene cosa sia successo.</p>' : ''}
      <p class="az-firma">${a.scritto === 'agente'
        ? 'Riassunto dagli articoli di oggi'
        : a.scritto === 'estratto'
          ? `Parole di ${fuga((a.fontiEstratto || []).join(', '))}, dall'articolo di oggi`
          : 'Nessun articolo leggibile oggi su questa azienda'}</p>
      ${link ? `<div class="fonti-link">${link}</div>` : ''}
      <p class="az-apri">Tocca per leggere tutto</p>
    </article>`;
  }).join('');

  $('az-pallini').innerHTML = az.map((a, i) =>
    `<button class="pallino" data-vai="${i}" aria-label="Vai a ${fuga(a.nome)}"></button>`).join('');
  aggiornaPallini();

  // Se un logo non c'è o non si carica, al suo posto va l'iniziale.
  for (const img of $('aziende').querySelectorAll('.az-logo')) {
    img.addEventListener('error', () => {
      const iniziale = document.createElement('span');
      iniziale.className = 'az-iniziale';
      iniziale.textContent = (img.closest('.azienda')?.querySelector('.az-nome')?.textContent || '?').slice(0, 1);
      img.replaceWith(iniziale);
    }, { once: true });
  }
}

function disegnaMercati() {
  const gruppi = [];
  for (const m of MERCATI) {
    if (m.errore || m.prezzo == null) continue;
    let g = gruppi.find((x) => x.nome === m.gruppo);
    if (!g) gruppi.push(g = { nome: m.gruppo, voci: [] });
    g.voci.push(m);
  }

  $('lista-indici').innerHTML = gruppi.map((g) => `<section class="blocco-gruppo">
    <div class="gruppo"><span>${fuga(g.nome)}</span></div>
    <div class="gruppo-schede">${g.voci.map((m) => {
      const v = m[periodo];
      const apertoQui = aperto === m.sym;
      // Il dettaglio sta FUORI dal bottone: paragrafi ed elenchi dentro un <button>
      // non sono HTML valido e alcuni browser li impaginano male.
      return `<div class="riga-box">
        <button class="riga" data-sym="${fuga(m.sym)}" aria-expanded="${apertoQui}">
          <span><span class="nome">${fuga(m.nome)}</span><span class="breve">${fuga(m.breve || '')}</span></span>
          <span class="grafico">${linea(m.spark, 62, 26, m.inverso, false)}</span>
          <span class="valore">
            <span class="prezzo">${num(m.prezzo, m.decimali)}${m.obsoleto ? '<span class="fermo" title="valore fermo all’ultimo aggiornamento riuscito"> ·</span>' : ''}</span>
            <span class="varia ${classe(v, m.inverso)}">${pct(v, periodo === 'giorno' ? 2 : 1)}</span>
          </span>
        </button>
        ${apertoQui ? dettaglio(m) : ''}
      </div>`;
    }).join('')}</div></section>`).join('');
}

function dettaglio(m) {
  const avvisi = [
    m.obsoleto ? '<span class="nota">Questo valore non si è aggiornato all’ultimo controllo.</span> ' : '',
    m.storicoScarso ? '<span class="nota">Lo storico è ancora breve: mese e anno diventeranno attendibili col passare dei giorni.</span> ' : '',
  ].join('');
  const voce = (et, val, cls) => `<div><dt>${et}</dt><dd class="${cls || ''}">${val}</dd></div>`;
  return `<div class="dettaglio">
    <p>${avvisi}${testo(m.perche || '')}
      ${m.guida ? `<button class="chiedi in-riga" data-guida="${fuga(m.sym)}">Cos'è e come si legge</button>` : ''}</p>
    <div class="grafico-grande">${linea(m.spark, 300, 76, m.inverso, true)}</div>
    <dl class="dati">
      ${voce('Oggi', pct(m.giorno), classe(m.giorno, m.inverso))}
      ${voce('7 giorni', pct(m.settimana, 1), classe(m.settimana, m.inverso))}
      ${voce('1 mese', pct(m.mese, 1), classe(m.mese, m.inverso))}
      ${voce('1 anno', pct(m.anno, 1), classe(m.anno, m.inverso))}
      ${voce('Minimo', num(m.min52, m.decimali))}
      ${voce('Massimo', num(m.max52, m.decimali))}
    </dl></div>`;
}

function disegnaInfo() {
  if (document.activeElement !== campoNome) campoNome.value = nomeUtente();
  $('elenco-fonti').innerHTML = (REPORT?.fonti || []).map((f) => `<li>${fuga(f)}</li>`).join('')
    || '<li>in attesa del primo bollettino</li>';
  $('aggiornato').textContent = REPORT?.ora ? `alle ${REPORT.ora} del ${REPORT.data}` : 'mai';
}

/* ——————————————— dati ——————————————— */
async function carica() {
  const v = Date.now();
  const prendi = (f, vuoto) => fetch(`${f}?v=${v}`, { cache: 'no-store' })
    .then((r) => r.ok ? r.json() : vuoto).catch(() => vuoto);
  const [r, m, c, gl] = await Promise.all([
    prendi('data/report.json', null),
    prendi('data/mercati.json', []),
    prendi('data/correzioni.json', { correzioni: [] }),
    prendi('glossario.json', { termini: [] }),
  ]);
  REPORT = r; MERCATI = Array.isArray(m) ? m : [];
  CORREZIONI = Array.isArray(c?.correzioni) ? c.correzioni : [];
  // I termini più lunghi per primi: "titoli di Stato" prima di "titolo".
  GLOSSARIO = (Array.isArray(gl?.termini) ? gl.termini : [])
    .map((t) => ({ ...t, forme: [...t.forme].sort((a, b) => b.length - a.length) }))
    .sort((a, b) => Math.max(...b.forme.map((f) => f.length)) - Math.max(...a.forme.map((f) => f.length)));
  // Se una parte si rompe, le altre devono restare in piedi.
  for (const [nome, f] of [['correzioni', disegnaCorrezioni], ['saluto', disegnaSaluto], ['nastro', disegnaNastro], ['oggi', disegnaOggi], ['da guardare', disegnaGuardare], ['tessere', disegnaTessere], ['aziende', disegnaAziende], ['preferiti', disegnaPreferiti], ['mercati', disegnaMercati], ['info', disegnaInfo]]) {
    try { f(); } catch (e) { console.error('disegno ' + nome + ':', e); }
  }
}

/* ——————————————— aggiornamenti ——————————————— */
async function controllaAggiornamenti() {
  let pubblicata;
  try {
    const r = await fetch(`versione.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    pubblicata = (await r.json()).app;
  } catch { return; }                       // senza rete non c'è niente da fare
  if (!pubblicata || pubblicata <= VERSIONE_APP) return;

  // Un solo ricarico per versione: se non è bastato, il ricarico non serve,
  // e insistere lascerebbe l'app a sbattere contro la stessa copia in cache.
  let giaProvato = 0;
  try { giaProvato = Number(sessionStorage.getItem('ricaricatoPer') || 0); } catch { /* niente */ }
  if (giaProvato >= pubblicata) { $('aggiornamento').hidden = false; return; }
  try { sessionStorage.setItem('ricaricatoPer', String(pubblicata)); } catch { /* niente */ }
  location.reload();
}

/* ——————————————— tema ——————————————— */
function applicaTema(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
  document.querySelectorAll('.periodo.tema button').forEach((b) => b.classList.toggle('attivo', b.dataset.tema === t));
  try { localStorage.setItem('tema', t); } catch { /* finestra privata: pazienza */ }
}

/* ——————————————— notifiche ——————————————— */
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const iOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function chiaveBinaria(base64) {
  const p = '='.repeat((4 - base64.length % 4) % 4);
  const b = atob((base64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}
function stato(testo, tipo) {
  const el = $('stato-notifiche');
  el.textContent = testo;
  el.className = 'pillola' + (tipo ? ' ' + tipo : '');
}

async function preparaNotifiche() {
  if (iOS() && !standalone()) { $('scheda-ios').hidden = false; return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    $('scheda-notifiche').hidden = false; stato('non supportate', 'no'); $('attiva').disabled = true; return;
  }
  $('scheda-notifiche').hidden = false;
  const reg = await navigator.serviceWorker.register('sw.js');
  if (await reg.pushManager.getSubscription() && Notification.permission === 'granted') {
    stato('attive', 'ok'); $('attiva').textContent = 'Mostra di nuovo il codice';
  }

  $('attiva').addEventListener('click', async () => {
    $('attiva').disabled = true;
    try {
      if (await Notification.requestPermission() !== 'granted') { stato('permesso negato', 'no'); return; }
      const isc = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveBinaria(CHIAVE_PUBBLICA) });
      stato('attive', 'ok');
      $('iscrizione').hidden = false;
      $('iscrizione-testo').value = JSON.stringify(isc.toJSON());
      $('attiva').textContent = 'Mostra di nuovo il codice';
    } catch (e) {
      stato('errore', 'no');
      $('nota-notifiche').textContent = 'Non sono riuscito ad attivarle: ' + e.message;
    } finally { $('attiva').disabled = false; }
  });

  $('copia').addEventListener('click', async () => {
    const t = $('iscrizione-testo');
    try { await navigator.clipboard.writeText(t.value); $('esito-copia').textContent = 'copiato'; }
    catch { t.select(); $('esito-copia').textContent = 'selezionato: copia a mano'; }
  });
}

/* ——————————————— avvio ——————————————— */
function cambiaVista(nome) {
  for (const v of ['oggi', 'preferiti', 'mercati', 'info']) $('vista-' + v).hidden = v !== nome;
  if (nome === 'preferiti') {
    caricaTitoli().then(disegnaPreferiti);
    if (gettoneGist()) sincronizza('controllo').catch(() => {});
  }
  document.querySelectorAll('.schede button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nome)));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', (e) => {
  // I comandi dentro la card vengono prima: un link o un tasto non deve
  // aprire la scheda grande, e viceversa.
  const vai = e.target.closest('[data-vai]');
  if (vai) return vaiAVetrina(Number(vai.dataset.vai));

  const apri = e.target.closest('[data-apri]');
  if (apri && !e.target.closest('a, button')) return apriAzienda(apri.dataset.apri);

  const termine = e.target.closest('[data-termine]');
  if (termine) return spiegaTermine(termine.dataset.termine);

  const guida = e.target.closest('[data-guida]');
  if (guida) { e.stopPropagation(); return spiegaIndice(guida.dataset.guida); }

  const pref = e.target.closest('[data-preferita]');
  if (pref) {
    const nome = pref.dataset.preferita;
    const lista = preferiteSalvate();
    const i = lista.indexOf(nome);
    if (i >= 0) {
      lista.splice(i, 1);
      scriviLista('fissate', fissateSalvate().filter((x) => x !== nome));
    } else lista.push(nome);
    scriviLista('preferite', lista);
    return disegnaPreferiti();
  }

  const nuova = e.target.closest('[data-aggiungi]');
  if (nuova) {
    const nome = nuova.dataset.aggiungi;
    const agg = aggiunteSalvate();
    if (!agg.some((x) => senzaSegni(x) === senzaSegni(nome))) agg.push(nome);
    scriviLista('aggiunte', agg);
    const lista = preferiteSalvate();
    if (!lista.includes(nome)) lista.push(nome);
    scriviLista('preferite', lista);
    filtro = '';
    $('pref-cerca').value = '';
    return disegnaPreferiti();
  }

  const fissa = e.target.closest('[data-fissa]');
  if (fissa) {
    const nome = fissa.dataset.fissa;
    const fisse = fissateSalvate();
    const i = fisse.indexOf(nome);
    if (i >= 0) fisse.splice(i, 1); else fisse.unshift(nome);
    scriviLista('fissate', fisse);
    return disegnaPreferiti();
  }

  const togli = e.target.closest('[data-togli]');
  if (togli) {
    const nome = togli.dataset.togli;
    scriviLista('preferite', preferiteSalvate().filter((x) => x !== nome));
    scriviLista('fissate', fissateSalvate().filter((x) => x !== nome));
    scriviLista('aggiunte', aggiunteSalvate().filter((x) => x !== nome));
    return disegnaPreferiti();
  }

  const chiudi = e.target.closest('[data-chiudi]');
  if (chiudi) {
    const lette = letteSalvate();
    lette.add(chiudi.dataset.chiudi);
    try { localStorage.setItem('correzioniLette', JSON.stringify([...lette])); } catch { /* niente */ }
    return disegnaCorrezioni();
  }

  const scheda = e.target.closest('.schede button');
  if (scheda) return cambiaVista(scheda.dataset.vista);

  const riga = e.target.closest('.riga');
  if (riga) { aperto = aperto === riga.dataset.sym ? null : riga.dataset.sym; return disegnaMercati(); }

  const per = e.target.closest('.periodo:not(.tema) button');
  if (per) {
    periodo = per.dataset.periodo;
    per.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('attivo', b === per));
    return disegnaMercati();
  }
  const tema = e.target.closest('.periodo.tema button');
  if (tema) return applicaTema(tema.dataset.tema);
});

$('pref-cerca').addEventListener('input', (e) => { filtro = e.target.value; disegnaRisultati(); });

$('foglio-chiudi').addEventListener('click', () => $('foglio').close());
$('foglio').addEventListener('click', (e) => { if (e.target === $('foglio')) $('foglio').close(); });
$('az-indietro').addEventListener('click', () => vaiAVetrina(vetrinaCorrente() - 1));
$('az-avanti').addEventListener('click', () => vaiAVetrina(vetrinaCorrente() + 1));
$('aziende').addEventListener('scroll', () => {
  clearTimeout($('aziende').dataset.t);
  $('aziende').dataset.t = setTimeout(aggiornaPallini, 90);
});
// Con la tastiera una card si apre con Invio, come un tasto vero.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('[data-apri]');
  if (card) { e.preventDefault(); apriAzienda(card.dataset.apri); }
});
$('pan-chiudi').addEventListener('click', () => $('pannello').close());
$('pannello').addEventListener('click', (e) => { if (e.target === $('pannello')) $('pannello').close(); });

$('ricarica').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.classList.add('gira');
  await carica();
  setTimeout(() => b.classList.remove('gira'), 700);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  carica();
  controllaAggiornamenti();
});

$('chiudi-riapri').addEventListener('click', () => {
  $('aggiornamento').innerHTML = '<span>Chiudi del tutto l’app (scorri via dal selettore) e riaprila dall’icona.</span>';
});

// Quanto è alta l'intestazione: da questo dipendono la barra dei periodi e,
// su computer, la colonna di sinistra. Misurarla una volta sola non basta:
// all'avvio il nastro degli indici è ancora vuoto e l'intestazione è più bassa
// di quanto sarà fra un istante. Chi si fida di quella misura parte troppo in
// alto e finisce sopra il nastro.
const testa = document.querySelector('.testa');
function misuraTesta() {
  if (testa) document.documentElement.style.setProperty('--testa-h', testa.offsetHeight + 'px');
}
misuraTesta();
addEventListener('resize', misuraTesta);
if (document.fonts?.ready) document.fonts.ready.then(misuraTesta);
// Così la misura segue l'intestazione ogni volta che cambia, qualunque sia il motivo.
try { if (testa) new ResizeObserver(misuraTesta).observe(testa); } catch { addEventListener('load', misuraTesta); }

// Il campo del nome: si scrive e il saluto cambia subito.
const campoNome = $('nome-utente');
campoNome.addEventListener('input', () => {
  try { localStorage.setItem('nome', campoNome.value); } catch { /* pazienza */ }
  disegnaSaluto();
});

let temaSalvato = 'auto';
try { temaSalvato = localStorage.getItem('tema') || 'auto'; } catch { /* niente */ }
applicaTema(temaSalvato);

// Blocco in verticale: funziona su Android, su iPhone no — Safari non lo
// espone. Lì ci pensa la schermata "Gira il telefono" del foglio di stile.
try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch { /* non supportato */ }

carica();
controllaAggiornamenti();
preparaNotifiche().catch((e) => console.warn('notifiche:', e));

/* ——————————————— sincronia fra i dispositivi ———————————————
   I preferiti stanno sul dispositivo, e due dispositivi sono due liste. Per
   tenerle uguali serve un posto che entrambi possano leggere e scrivere: un
   gist segreto di GitHub, cioè un file fuori dal sito pubblico, raggiungibile
   solo da chi ha il gettone.

   Il gettone resta in questo browser e non va da nessuna parte se non ad
   api.github.com. Ha il solo permesso "gist": non può toccare i repository né
   altro. L'app non lo scrive mai nel diario e non lo mostra.

   Chi ha ragione quando le due liste differiscono? L'ultima modifica, segnata
   con l'ora. È un solo utente con due dispositivi: non serve altro. */

const GIST_NOME = 'Borsa — le aziende che segui';
const GIST_FILE = 'preferiti.json';
let sincroniaInCorso = null;

const gettoneGist = () => { try { return localStorage.getItem('gettoneGist') || ''; } catch { return ''; } };

function statoLocale() {
  return {
    preferite: preferiteSalvate(),
    fissate: fissateSalvate(),
    aggiunte: aggiunteSalvate(),
    quando: (() => { try { return localStorage.getItem('preferiteQuando') || ''; } catch { return ''; } })(),
  };
}

function segnaCambiamento() {
  try { localStorage.setItem('preferiteQuando', new Date().toISOString()); } catch { /* niente */ }
  if (gettoneGist()) programmaInvio();
}

async function chiamaGist(percorso, opzioni = {}) {
  const t = gettoneGist();
  if (!t) throw new Error('nessun gettone');
  const r = await fetch('https://api.github.com' + percorso, {
    ...opzioni,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${t}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opzioni.headers || {}),
    },
  });
  if (r.status === 401) throw new Error('gettone rifiutato');
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`);
  return r.json();
}

// Il secondo dispositivo non deve sapere nessun identificativo: cerca fra i
// gist quello con questo nome, e se non c'è lo crea.
async function trovaGist() {
  let id = '';
  try { id = localStorage.getItem('idGist') || ''; } catch { /* niente */ }
  if (id) return id;

  const lista = await chiamaGist('/gists?per_page=100');
  const trovato = (lista || []).find((g) => g.description === GIST_NOME || (g.files && g.files[GIST_FILE]));
  if (trovato) { try { localStorage.setItem('idGist', trovato.id); } catch { /* niente */ } return trovato.id; }

  const creato = await chiamaGist('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_NOME, public: false,
      files: { [GIST_FILE]: { content: JSON.stringify({ ...statoLocale(), quando: new Date().toISOString() }, null, 2) } },
    }),
  });
  try { localStorage.setItem('idGist', creato.id); } catch { /* niente */ }
  return creato.id;
}

async function inviaAlGist() {
  const id = await trovaGist();
  const stato = { ...statoLocale(), quando: statoLocale().quando || new Date().toISOString() };
  await chiamaGist(`/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(stato, null, 2) } } }),
  });
  return stato.quando;
}

let orologioInvio;
function programmaInvio() {
  clearTimeout(orologioInvio);
  orologioInvio = setTimeout(() => {
    sincronizza('invio').catch(() => {});
  }, 1500);   // non una scrittura per tocco: si aspetta che tu abbia finito
}

async function sincronizza(modo = 'controllo') {
  if (!gettoneGist()) return disegnaSincronia();
  if (sincroniaInCorso) return sincroniaInCorso;

  sincroniaInCorso = (async () => {
    disegnaSincronia('in corso');
    try {
      if (modo === 'invio') {
        await inviaAlGist();
      } else {
        const id = await trovaGist();
        const g = await chiamaGist(`/gists/${id}`);
        const grezzo = g?.files?.[GIST_FILE]?.content;
        const remoto = grezzo ? JSON.parse(grezzo) : null;
        const locale = statoLocale();

        if (remoto && (!locale.quando || (remoto.quando || '') > locale.quando)) {
          // Scrivere quello che arriva non è un cambiamento da rimandare
          // indietro: senza questa guardia i due dispositivi si rincorrerebbero.
          applicandoRemoto = true;
          scriviLista('preferite', remoto.preferite || []);
          scriviLista('fissate', remoto.fissate || []);
          scriviLista('aggiunte', remoto.aggiunte || []);
          applicandoRemoto = false;
          try { localStorage.setItem('preferiteQuando', remoto.quando || new Date().toISOString()); } catch { /* niente */ }
          disegnaPreferiti();
        } else if (locale.quando && (!remoto || locale.quando > (remoto.quando || ''))) {
          await inviaAlGist();
        }
      }
      try { localStorage.setItem('sincQuando', new Date().toISOString()); } catch { /* niente */ }
      disegnaSincronia();
    } catch (e) {
      disegnaSincronia('errore', e.message);
    } finally {
      sincroniaInCorso = null;
    }
  })();
  return sincroniaInCorso;
}

function disegnaSincronia(fase, dettaglio) {
  const stato = $('sinc-stato'), tasto = $('sinc-tasto');
  if (!stato) return;
  if (!gettoneGist()) {
    stato.textContent = 'Sincronia non attiva: questa lista vale solo su questo dispositivo.';
    stato.className = 'sinc-stato';
    tasto.textContent = 'Attiva';
    return;
  }
  tasto.textContent = 'Gestisci';
  if (fase === 'in corso') { stato.textContent = 'Sincronizzo…'; stato.className = 'sinc-stato'; return; }
  if (fase === 'errore') { stato.textContent = `Sincronia ferma: ${dettaglio}.`; stato.className = 'sinc-stato guasta'; return; }
  let quando = '';
  try { quando = localStorage.getItem('sincQuando') || ''; } catch { /* niente */ }
  const ora = quando ? new Date(quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  stato.textContent = ora ? `Sincronizzato alle ${ora}, su tutti i tuoi dispositivi.` : 'Sincronia attiva.';
  stato.className = 'sinc-stato attiva';
}

function apriSincronia() {
  const attiva = !!gettoneGist();
  apriPannello({
    tipo: 'Preferiti',
    titolo: attiva ? 'Sincronia fra i dispositivi' : 'Attiva la sincronia',
    corpo: `
      <p class="pan-testo">La lista delle aziende che segui sta su questo dispositivo. Per averla uguale su iPhone e su Mac serve un posto che entrambi possano leggere e scrivere: un <b>gist segreto</b> di GitHub, cioè un file fuori dal sito pubblico.</p>
      <ol class="sinc-passi">
        <li>Apri <a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=Borsa%20%E2%80%94%20preferiti" target="_blank" rel="noopener">questa pagina di GitHub</a>: il permesso <b>gist</b> è già segnato, non aggiungerne altri.</li>
        <li>In fondo tocca <b>Generate token</b> e copia il codice che compare.</li>
        <li>Incollalo qui sotto. Sull'altro dispositivo rifai lo stesso: troverà da solo la lista già salvata.</li>
      </ol>
      <input class="sinc-campo" id="sinc-gettone" type="password" placeholder="Incolla qui il gettone" autocomplete="off" spellcheck="false" aria-label="Gettone GitHub">
      <div class="sinc-tasti">
        <button class="tasto-pillola" id="sinc-salva">${attiva ? 'Sostituisci' : 'Attiva'}</button>
        ${attiva ? '<button class="az-tasto" id="sinc-spegni">Disattiva su questo dispositivo</button>' : ''}
      </div>
      <p class="pan-nota">Il gettone resta in questo browser e non viene mandato a nessuno tranne che a GitHub. Ha il solo permesso <b>gist</b>: non può toccare i tuoi repository. Se lo perdi o cambi idea, cancellalo da GitHub e la sincronia si ferma.</p>`,
  });

  $('sinc-salva').addEventListener('click', async () => {
    const campo = $('sinc-gettone');
    const t = campo.value.trim();
    if (!t) return;
    try { localStorage.setItem('gettoneGist', t); localStorage.removeItem('idGist'); } catch { /* niente */ }
    campo.value = '';
    $('pannello').close();
    await sincronizza('controllo');
  });
  const spegni = $('sinc-spegni');
  if (spegni) spegni.addEventListener('click', () => {
    try { localStorage.removeItem('gettoneGist'); localStorage.removeItem('idGist'); } catch { /* niente */ }
    $('pannello').close();
    disegnaSincronia();
  });
}

$('sinc-tasto').addEventListener('click', apriSincronia);
disegnaSincronia();
if (gettoneGist()) sincronizza('controllo').catch(() => {});
