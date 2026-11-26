// Legge i flussi RSS delle testate verificate. Nessuna libreria: i feed sono XML semplice.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'", '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—' };

function pulisci(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITA[e.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function campo(blocco, tag) {
  const m = blocco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? pulisci(m[1]) : '';
}

async function unFeed(f) {
  try {
    const r = await fetch(f.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const blocchi = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map((m) => m[0]);

    return blocchi.slice(0, 25).map((b) => {
      const dataTesto = campo(b, 'pubDate') || campo(b, 'updated') || campo(b, 'published') || campo(b, 'dc:date');
      const d = dataTesto ? new Date(dataTesto) : null;
      const link = (b.match(/<link[^>]*href="([^"]+)"/i)?.[1]) || campo(b, 'link');
      return {
        fonte: f.fonte,
        lingua: f.lingua,
        peso: f.peso ?? 1,
        ufficiale: !!f.ufficiale,
        titolo: campo(b, 'title'),
        sommario: campo(b, 'description').slice(0, 320),
        link,
        data: d && !isNaN(d) ? d.toISOString() : null,
      };
    }).filter((n) => n.titolo);
  } catch (e) {
    console.error(`  ! feed ${f.fonte}: ${e.message}`);
    return [];
  }
}

// Parole che segnalano una notizia di mercato, e rumore da scartare
// (le rubriche di consigli personali di MarketWatch sporcherebbero il report).
const RILEVANTI = /borsa|borse|mercat|indice|indici|azion|titol|wall street|piazza affari|nasdaq|s&p|dow|ftse|dax|cac|nikkei|hang seng|listino|quotazion|rally|seduta|chiusura|inflazion|inflation|tass[oi]\b|rate[sd]?\b|fed\b|federal reserve|bce|ecb|powell|lagarde|bond|treasur|spread|btp|dollar|euro\b|valut|petrolio|oil|opec|gas\b|oro\b|gold|bitcoin|crypto|dazi|tariff|commercio|trade|pil\b|gdp|recession|crescita|occupazion|jobs|payroll|disoccupaz|unemploy|banc|bank|utili|earnings|trimestrale|guidance|ipo\b|fusion|acquisizion|merger|nvidia|intelligenza artificiale|\bai\b|chip|semicondutt|cina|china|economia|economy|stocks?\b|shares|futures|yield|debito|deficit|manovra/i;
const RUMORE = /^(i'm|i've|i |my |we are|we're|should i|can i|how (much|do|can)|ask |dear )|401\(k\)|my (wife|husband|son|daughter|mother|father|sister|brother)|retirement.*(saved|nest egg)|\bprenup|inheritance|oroscopo|ricette|meteo/i;

function rilevante(n) {
  if (n.ufficiale) return true;
  // Gli apostrofi tipografici vanno normalizzati, altrimenti "I've" sfugge al filtro.
  const t = n.titolo.replace(/[\u2018\u2019]/g, "'");
  if (RUMORE.test(t)) return false;
  return RILEVANTI.test(t) || RILEVANTI.test(n.sommario);
}

export async function scaricaNotizie(feed) {
  const gruppi = await Promise.all(feed.map(unFeed));
  const tutte = gruppi.flat();

  // Via i doppioni: due testate che raccontano lo stesso fatto con lo stesso titolo.
  const viste = new Set();
  const uniche = tutte.filter((n) => {
    const chiave = n.titolo.toLowerCase().replace(/[^a-z0-9àèéìòù ]/g, '').slice(0, 60);
    if (viste.has(chiave)) return false;
    viste.add(chiave);
    return true;
  });

  const utili = uniche.filter(rilevante);
  utili.sort((a, b) => (new Date(b.data || 0)) - (new Date(a.data || 0)));
  const ok = gruppi.filter((g) => g.length).length;
  console.log(`  notizie: ${utili.length} titoli utili (su ${uniche.length}) da ${ok}/${feed.length} fonti`);
  return utili;
}

// I comunicati ufficiali di BCE e Federal Reserve usciti nelle ultime ore:
// sono l'unico tipo di notizia che da solo giustifica un avviso fuori orario.
export function comunicatiRecenti(notizie, ore = 3) {
  const limite = Date.now() - ore * 3600 * 1000;
  return notizie.filter((n) => n.ufficiale && n.data && new Date(n.data).getTime() > limite);
}
