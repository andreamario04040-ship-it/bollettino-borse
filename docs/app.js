/* Bollettino Borse — app web. Nessuna libreria: legge due file JSON e disegna la pagina. */

const CHIAVE_PUBBLICA = 'BEX2Ep7AZJPgrIF_cHwKOWk9VSiE8OLd1WLxSJDANLNEbox4xiHYb5pgRslEapXEXZs35jhSmHRhrLcfFhyPwVk';
const MENO = '−', SOTTILE = ' ';
const $ = (id) => document.getElementById(id);

let MERCATI = [], REPORT = null, periodo = 'giorno', aperto = null;

/* ---------- numeri all'italiana ---------- */
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
  if (n == null) return '';
  const buono = inverso ? n < 0 : n >= 0;
  return buono ? 'su' : 'giu';
};

/* ---------- grafico in miniatura ---------- */
function spark(valori, largo = 300, alto = 34, inverso = false) {
  if (!valori || valori.length < 2) return '';
  const lo = Math.min(...valori), hi = Math.max(...valori), r = (hi - lo) || 1, pad = 3;
  const punti = valori.map((v, i) => [
    pad + i * (largo - 2 * pad) / (valori.length - 1),
    alto - pad - (v - lo) / r * (alto - 2 * pad),
  ]);
  const d = 'M' + punti.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const salito = valori[valori.length - 1] >= valori[0];
  const col = (inverso ? !salito : salito) ? 'var(--su)' : 'var(--giu)';
  const [ux, uy] = punti[punti.length - 1];
  return `<svg class="spark" viewBox="0 0 ${largo} ${alto}" width="100%" height="${alto}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L${ux.toFixed(1)} ${alto} L${punti[0][0].toFixed(1)} ${alto} Z" fill="${col}" opacity=".10"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

const fuga = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- disegno ---------- */
function disegnaNastro() {
  const scelti = ['FTSEMIB.MI', '^STOXX50E', '^GSPC', '^IXIC', '^N225', '^VIX', 'GC=F', 'BTC-USD'];
  $('nastro-int').innerHTML = scelti.map((s) => {
    const d = MERCATI.find((m) => m.sym === s);
    if (!d || d.giorno == null) return '';
    return `<span class="tk"><b>${fuga(d.nome)}</b> <i class="${classe(d.giorno, d.inverso)}">${pct(d.giorno)}</i></span>`;
  }).join('');
}

function disegnaReport() {
  if (!REPORT) { $('report').innerHTML = '<div class="caricamento">Il bollettino di oggi non è ancora stato pubblicato.</div>'; return; }
  const n = REPORT.notifica || {};
  const sezioni = (REPORT.sezioni || []).map((s) => {
    const rif = (s.riferimenti || []).map((r) =>
      `<a href="${fuga(r.link || '#')}" target="_blank" rel="noopener"><span class="f">${fuga(r.fonte)}</span> ${fuga(r.titolo)}</a>`).join('');
    return `<div class="sezione"><h3>${fuga(s.titolo)}</h3><p>${fuga(s.testo)}</p>${rif ? `<div class="riferimenti">${rif}</div>` : ''}</div>`;
  }).join('');

  $('report').innerHTML = `<h2 class="titolo-notifica">${fuga(n.titolo || '')}</h2>
    <p class="corpo-notifica">${fuga(n.corpo || '')}</p>${sezioni}`;

  $('tipo-report').textContent = REPORT.tipo === 'sera' ? 'Bollettino della sera'
    : REPORT.tipo === 'avviso' ? 'Avviso' : 'Bollettino del mattino';
  $('data-report').textContent = `${REPORT.data || ''}${REPORT.ora ? ', ore ' + REPORT.ora : ''}`;

  if (REPORT.clima) {
    $('clima').hidden = false;
    $('clima-spillo').style.left = `calc(${Math.max(1, Math.min(99, REPORT.clima.punteggio))}% - 1.5px)`;
    $('clima-parola').textContent = REPORT.clima.parola;
  }
  $('fonti').textContent = 'Fonti: ' + (REPORT.fonti || []).join(' · ');
}

function disegnaIndici() {
  const gruppi = [];
  for (const m of MERCATI) {
    if (m.errore) continue;
    let g = gruppi.find((x) => x.nome === m.gruppo);
    if (!g) gruppi.push(g = { nome: m.gruppo, voci: [] });
    g.voci.push(m);
  }
  $('lista-indici').innerHTML = gruppi.map((g) => `<div class="gruppo">${fuga(g.nome)}</div>` + g.voci.map((m) => {
    const v = m[periodo];
    const apertoQui = aperto === m.sym;
    return `<button class="riga" data-sym="${fuga(m.sym)}" aria-expanded="${apertoQui}">
      <span><span class="n1">${fuga(m.nome)}</span><span class="n2">${fuga(m.breve || '')}</span></span>
      <span class="val">${num(m.prezzo, m.decimali)}${m.obsoleto ? '<span class="fermo" title="valore dell\'ultimo aggiornamento riuscito">·</span>' : ''}</span>
      <span class="var ${classe(v, m.inverso)}">${pct(v)}</span>
      ${apertoQui ? `<span class="spark">${spark(m.spark, 300, 34, m.inverso)}</span>
        <span class="dettaglio">${m.obsoleto ? '<b>Questo valore non si è aggiornato all’ultimo controllo.</b> ' : ''}${fuga(m.perche || '')}
          <dl>
            <div><dt>Oggi</dt><dd class="${classe(m.giorno, m.inverso)}">${pct(m.giorno)}</dd></div>
            <div><dt>7 giorni</dt><dd class="${classe(m.settimana, m.inverso)}">${pct(m.settimana, 1)}</dd></div>
            <div><dt>1 mese</dt><dd class="${classe(m.mese, m.inverso)}">${pct(m.mese, 1)}</dd></div>
            <div><dt>1 anno</dt><dd class="${classe(m.anno, m.inverso)}">${pct(m.anno, 1)}</dd></div>
            <div><dt>Min 1 anno</dt><dd>${num(m.min52, m.decimali)}</dd></div>
            <div><dt>Max 1 anno</dt><dd>${num(m.max52, m.decimali)}</dd></div>
          </dl></span>` : ''}
    </button>`;
  }).join('')).join('');
}

/* ---------- dati ---------- */
async function carica() {
  const v = Date.now();
  try {
    const [r, m] = await Promise.all([
      fetch(`data/report.json?v=${v}`, { cache: 'no-store' }).then((x) => x.ok ? x.json() : null).catch(() => null),
      fetch(`data/mercati.json?v=${v}`, { cache: 'no-store' }).then((x) => x.ok ? x.json() : []).catch(() => []),
    ]);
    REPORT = r; MERCATI = m || [];
    disegnaNastro(); disegnaReport(); disegnaIndici();
    $('aggiornato').textContent = REPORT?.ora ? `alle ${REPORT.ora}` : 'poco fa';
  } catch (e) {
    $('report').innerHTML = `<div class="caricamento">Non riesco a leggere i dati. ${fuga(e.message)}</div>`;
  }
}

/* ---------- notifiche ---------- */
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const iOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function chiaveBinaria(base64) {
  const p = '='.repeat((4 - base64.length % 4) % 4);
  const b = atob((base64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}

function statoNotifiche(testo, tipo) {
  const el = $('stato-notifiche');
  el.textContent = testo;
  el.className = 'stato-pill' + (tipo ? ' ' + tipo : '');
}

async function preparaNotifiche() {
  const supporto = 'serviceWorker' in navigator && 'PushManager' in window;
  if (iOS() && !standalone()) { $('avviso-ios').hidden = false; return; }
  if (!supporto) { $('blocco-notifiche').hidden = false; statoNotifiche('non supportate', 'no'); $('attiva').disabled = true; return; }

  $('blocco-notifiche').hidden = false;
  const reg = await navigator.serviceWorker.register('sw.js');
  const esistente = await reg.pushManager.getSubscription();
  if (esistente && Notification.permission === 'granted') {
    statoNotifiche('attive', 'ok');
    $('attiva').textContent = 'Mostra di nuovo il codice';
  }

  $('attiva').addEventListener('click', async () => {
    $('attiva').disabled = true;
    try {
      const permesso = await Notification.requestPermission();
      if (permesso !== 'granted') { statoNotifiche('permesso negato', 'no'); $('attiva').disabled = false; return; }
      const isc = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveBinaria(CHIAVE_PUBBLICA) });
      statoNotifiche('attive', 'ok');
      $('iscrizione').hidden = false;
      $('iscrizione-testo').value = JSON.stringify(isc.toJSON());
      $('attiva').textContent = 'Mostra di nuovo il codice';
    } catch (e) {
      statoNotifiche('errore', 'no');
      $('bn-nota').textContent = 'Non sono riuscito ad attivarle: ' + e.message;
    }
    $('attiva').disabled = false;
  });

  $('copia').addEventListener('click', async () => {
    const t = $('iscrizione-testo');
    try { await navigator.clipboard.writeText(t.value); $('esito-copia').textContent = 'copiato'; }
    catch { t.select(); $('esito-copia').textContent = 'selezionato: copia a mano'; }
  });
}

/* ---------- avvio ---------- */
document.addEventListener('click', (e) => {
  const riga = e.target.closest('.riga');
  if (riga) { aperto = aperto === riga.dataset.sym ? null : riga.dataset.sym; disegnaIndici(); return; }
  const p = e.target.closest('.periodo button');
  if (p) {
    periodo = p.dataset.periodo;
    document.querySelectorAll('.periodo button').forEach((b) => b.classList.toggle('attivo', b === p));
    disegnaIndici();
  }
});
$('ricarica').addEventListener('click', carica);
document.addEventListener('visibilitychange', () => { if (!document.hidden) carica(); });

carica();
preparaNotifiche().catch((e) => console.warn('notifiche:', e));
