/* Borsa — nessuna libreria: legge due file JSON e disegna l'app. */

const CHIAVE_PUBBLICA = 'BEX2Ep7AZJPgrIF_cHwKOWk9VSiE8OLd1WLxSJDANLNEbox4xiHYb5pgRslEapXEXZs35jhSmHRhrLcfFhyPwVk';
const MENO = '−', SOTTILE = ' ';
const $ = (id) => document.getElementById(id);

let MERCATI = [], REPORT = null, periodo = 'giorno', aperto = null;

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
  $('quando').textContent = `${REPORT.tipo === 'sera' ? 'Sera' : REPORT.tipo === 'avviso' ? 'Avviso' : 'Mattino'} · ${REPORT.data || ''}${REPORT.ora ? ', ' + REPORT.ora : ''}`;

  if (REPORT.clima) {
    $('clima-scheda').hidden = false;
    $('clima-parola').textContent = REPORT.clima.parola;
    $('clima-nota').textContent = notaClima(REPORT.clima.punteggio, REPORT.clima.vix);
    $('clima-arco').innerHTML = arcoClima(REPORT.clima.punteggio);
  }

  $('titolone').innerHTML = `<h2>${fuga(n.titolo || '')}</h2><p class="sommario">${fuga(n.corpo || '')}</p>`;

  $('sezioni').innerHTML = (REPORT.sezioni || []).map((s, i) => {
    const link = (s.riferimenti || []).map((r) => `<a class="fonte-link" href="${fuga(r.link || '#')}" target="_blank" rel="noopener">
      <span class="testata">${fuga(r.fonte)}</span>${fuga(r.titolo)}</a>`).join('');
    return `<article class="sezione">
      <div class="sezione-testa"><span class="gettone">${i + 1}</span><h3>${fuga(s.titolo)}</h3></div>
      <p>${fuga(s.testo)}</p>${link ? `<div class="fonti-link">${link}</div>` : ''}</article>`;
  }).join('');

  $('piede-oggi').textContent = REPORT.ora ? `Bollettino delle ${REPORT.ora}` : '';
}

function disegnaMercati() {
  const gruppi = [];
  for (const m of MERCATI) {
    if (m.errore || m.prezzo == null) continue;
    let g = gruppi.find((x) => x.nome === m.gruppo);
    if (!g) gruppi.push(g = { nome: m.gruppo, voci: [] });
    g.voci.push(m);
  }

  $('lista-indici').innerHTML = gruppi.map((g) => `<div class="gruppo"><span>${fuga(g.nome)}</span></div>
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
    }).join('')}</div>`).join('');
}

function dettaglio(m) {
  const avvisi = [
    m.obsoleto ? '<span class="nota">Questo valore non si è aggiornato all’ultimo controllo.</span> ' : '',
    m.storicoScarso ? '<span class="nota">Lo storico è ancora breve: mese e anno diventeranno attendibili col passare dei giorni.</span> ' : '',
  ].join('');
  const voce = (et, val, cls) => `<div><dt>${et}</dt><dd class="${cls || ''}">${val}</dd></div>`;
  return `<div class="dettaglio">
    <p>${avvisi}${fuga(m.perche || '')}</p>
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
  $('elenco-fonti').innerHTML = (REPORT?.fonti || []).map((f) => `<li>${fuga(f)}</li>`).join('')
    || '<li>in attesa del primo bollettino</li>';
  $('aggiornato').textContent = REPORT?.ora ? `alle ${REPORT.ora} del ${REPORT.data}` : 'mai';
}

/* ——————————————— dati ——————————————— */
async function carica() {
  const v = Date.now();
  const prendi = (f, vuoto) => fetch(`${f}?v=${v}`, { cache: 'no-store' })
    .then((r) => r.ok ? r.json() : vuoto).catch(() => vuoto);
  const [r, m] = await Promise.all([prendi('data/report.json', null), prendi('data/mercati.json', [])]);
  REPORT = r; MERCATI = Array.isArray(m) ? m : [];
  // Se una parte si rompe, le altre devono restare in piedi.
  for (const [nome, f] of [['nastro', disegnaNastro], ['oggi', disegnaOggi], ['mercati', disegnaMercati], ['info', disegnaInfo]]) {
    try { f(); } catch (e) { console.error('disegno ' + nome + ':', e); }
  }
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
  for (const v of ['oggi', 'mercati', 'info']) $('vista-' + v).hidden = v !== nome;
  document.querySelectorAll('.schede button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nome)));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', (e) => {
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

$('ricarica').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.classList.add('gira');
  await carica();
  setTimeout(() => b.classList.remove('gira'), 700);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) carica(); });

// L'intestazione è alta quanto è alta: la barra dei periodi deve fermarsi appena sotto.
function misuraTesta() {
  const t = document.querySelector('.testa');
  if (t) document.documentElement.style.setProperty('--testa-h', t.offsetHeight + 'px');
}
misuraTesta();
addEventListener('resize', misuraTesta);
if (document.fonts?.ready) document.fonts.ready.then(misuraTesta);

let temaSalvato = 'auto';
try { temaSalvato = localStorage.getItem('tema') || 'auto'; } catch { /* niente */ }
applicaTema(temaSalvato);

carica();
preparaNotifiche().catch((e) => console.warn('notifiche:', e));
