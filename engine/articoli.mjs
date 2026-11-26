// Scarica il testo vero degli articoli, non solo il titolo.
//
// Un titolo RSS dice "Nvidia interrompe le spedizioni di chip": per raccontare
// cosa è successo davvero serve l'articolo. Si prendono solo quelli che servono,
// uno alla volta, e si tiene solo il testo leggibile.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function soloTesto(html) {
  let t = html
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Se c'è un <article>, quasi sempre è lì che sta il pezzo.
  const art = t.match(/<article[\s\S]*?<\/article>/i);
  if (art) t = art[0];

  // I paragrafi: più affidabili del testo sparso della pagina.
  const p = [...t.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const grezzo = p.length >= 2 ? p.join('\n') : t;

  return grezzo
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITA[e.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function scaricaArticolo(url, massimo = 4500) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || '';
    if (!/text\/html/i.test(tipo)) return null;

    const testo = soloTesto(await r.text());
    // Sotto le 400 lettere non è un articolo: è un muro di cookie o un paywall.
    if (testo.length < 400) return null;
    return testo.slice(0, massimo);
  } catch {
    return null;
  }
}

// Scarica il testo di più notizie, con calma, e dice quante ne ha prese.
export async function arricchisci(notizie, massimoArticoli = 18) {
  const out = [];
  let presi = 0;
  for (const n of notizie.slice(0, massimoArticoli)) {
    const testo = await scaricaArticolo(n.link);
    if (testo) presi++;
    out.push({ ...n, testo });
    await pausa(350);
  }
  console.log(`  articoli: testo completo per ${presi} su ${out.length}`);
  return out;
}
