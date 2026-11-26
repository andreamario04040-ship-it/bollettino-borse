// Trasforma numeri e titoli di giornale in cinque frasi che si capiscono.

import { num, pct, verbo, elenco, taglia, oraItalia, dataItalia, MENO } from './lingua.mjs';
import { temiDelGiorno } from './temi.mjs';

const AREE = {
  europa: ['^STOXX50E', 'FTSEMIB.MI', '^GDAXI', '^FCHI', '^FTSE'],
  usa: ['^GSPC', '^IXIC', '^DJI'],
  asia: ['^N225', '^HSI', '000001.SS'],
};
const PIAZZA = { 'FTSEMIB.MI': 'Milano', '^GDAXI': 'Francoforte', '^FCHI': 'Parigi', '^FTSE': 'Londra', '^N225': 'Tokyo', '^HSI': 'Hong Kong', '000001.SS': 'Shanghai' };

const fra = (x, a, b) => Math.max(a, Math.min(b, x));

function interpola(x, punti) {
  if (x == null) return 50;
  if (x <= punti[0][0]) return punti[0][1];
  for (let i = 1; i < punti.length; i++) {
    if (x <= punti[i][0]) {
      const [x0, y0] = punti[i - 1], [x1, y1] = punti[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return punti[punti.length - 1][1];
}

export function creaContesto(mercati, notizie, tipo, adesso = new Date()) {
  const mappa = new Map(mercati.map((m) => [m.sym, m]));
  const g = (s) => mappa.get(s);
  const media = (syms, campo = 'giorno') => {
    const v = syms.map((s) => g(s)?.[campo]).filter((x) => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const medie = {
    europa: media(AREE.europa), usa: media(AREE.usa), asia: media(AREE.asia),
    europaMese: media(AREE.europa, 'mese'), usaMese: media(AREE.usa, 'mese'),
  };

  // Clima: 0 = sereno, 100 = panico. Pesa di più l'indice della paura,
  // poi quanto sono scese le borse oggi.
  const vix = g('^VIX')?.prezzo;
  const pauraVix = interpola(vix, [[11, 5], [14, 18], [17, 35], [20, 48], [25, 62], [30, 75], [36, 87], [45, 100]]);
  const azioni = [medie.europa, medie.usa, medie.asia].filter((x) => x != null);
  const medioAzioni = azioni.length ? azioni.reduce((a, b) => a + b, 0) / azioni.length : 0;
  const pauraMovimento = fra(50 - medioAzioni * 16, 0, 100);
  const punteggio = Math.round(fra(pauraVix * 0.58 + pauraMovimento * 0.42, 0, 100));
  const parola = punteggio < 24 ? 'sereno' : punteggio < 40 ? 'tranquillo' : punteggio < 56 ? 'incerto' : punteggio < 72 ? 'nervoso' : punteggio < 86 ? 'teso' : 'in allarme';

  return { mappa, g, media, medie, tipo, adesso, temi: temiDelGiorno(notizie, 3), notizie,
           clima: { punteggio, parola, vix: vix ?? null } };
}

// ———————————————————————————————— le cinque sezioni

function frasePiazze(ctx, syms, soglia = 0.1) {
  return elenco(syms.map((s) => {
    const d = ctx.g(s);
    if (!d || d.giorno == null) return null;
    return `${PIAZZA[s] || d.nome} ${pct(d.giorno)}`;
  }).filter(Boolean));
}

function sezCosaSuccesso(ctx) {
  const { medie, tipo } = ctx;
  const eu = medie.europa, us = medie.usa, as = medie.asia;
  const p = [];

  if (tipo === 'sera') {
    const mib = ctx.g('FTSEMIB.MI');
    if (mib?.giorno != null) p.push(`La Borsa di Milano ${verbo(mib.giorno)} ${pct(mib.giorno).replace('+', '').replace(MENO, '')} e ha chiuso a ${num(mib.prezzo)} punti.`);
    p.push(`Nel resto d'Europa: ${frasePiazze(ctx, ['^GDAXI', '^FCHI', '^FTSE'])}.`);
    if (us != null) p.push(`A New York, dove si continua a scambiare, l'andamento è ${us > 0.15 ? 'positivo' : us < -0.15 ? 'negativo' : 'piatto'}: ${frasePiazze(ctx, ['^GSPC', '^IXIC'])}.`);
  } else if (tipo === 'mattina') {
    if (as != null) p.push(`Stanotte l'Asia ha chiuso ${as > 0.15 ? 'in rialzo' : as < -0.15 ? 'in calo' : 'poco mossa'}: ${frasePiazze(ctx, ['^N225', '^HSI', '000001.SS'])}.`);
    if (us != null) p.push(`Ieri sera Wall Street ${verbo(us)} in media ${pct(Math.abs(us)).replace('+', '')}: ${frasePiazze(ctx, ['^GSPC', '^IXIC', '^DJI'])}.`);
    if (eu != null) p.push(`Le borse europee partono dalla chiusura di ieri, quando avevano segnato in media ${pct(eu)}.`);
  } else {
    p.push(`Europa ${pct(eu)}, Stati Uniti ${pct(us)}, Asia ${pct(as)}.`);
  }
  return { id: 'successo', titolo: "Cos'è successo", testo: p.join(' ') };
}

function sezPerche(ctx) {
  const t = ctx.temi;
  if (!t.length) return { id: 'perche', titolo: 'Perché', testo: 'Oggi non emerge un tema dominante dalle testate finanziarie: i movimenti sembrano ordinaria amministrazione.' };

  const p = [`Sui giornali finanziari oggi domina un tema: ${t[0].nome}. In pratica, ${t[0].spiega}.`];
  if (t[1]) p.push(`Il secondo filone riguarda ${t[1].nome}. Qui ${t[1].spiega}.`);

  // Una citazione per tema e, dove si può, due testate diverse: due titoli
  // della stessa firma sullo stesso fatto non aggiungono niente.
  // I comunicati ufficiali si saltano: spesso sono atti procedurali che non
  // spiegano la giornata, e quando contano davvero arrivano già come avviso.
  const tuttiITitoli = [...(t[0].titoli || []), ...(t[1]?.titoli || [])];
  const giornalistici = tuttiITitoli.filter((n) => !n.ufficiale);
  const pescaDa = giornalistici.length >= 2 ? giornalistici : tuttiITitoli;

  const esempi = [];
  for (const candidato of pescaDa) {
    if (esempi.length >= 2) break;
    if (esempi.some((e) => e.fonte === candidato.fonte || e.titolo === candidato.titolo)) continue;
    esempi.push(candidato);
  }
  if (esempi.length < 2) {
    for (const c of pescaDa) {
      if (esempi.length >= 2) break;
      if (!esempi.some((e) => e.titolo === c.titolo)) esempi.push(c);
    }
  }
  if (esempi.length) p.push('Due titoli di oggi: ' + esempi.map((n) => `«${taglia(n.titolo, 95)}» (${n.fonte})`).join('; ') + '.');
  return { id: 'perche', titolo: 'Perché', testo: p.join(' '), riferimenti: esempi };
}

function sezDato(ctx) {
  const vix = ctx.g('^VIX');
  const t10 = ctx.g('^TNX');

  // Si sceglie il numero che racconta di più, non quello più grande.
  if (vix?.prezzo != null && (vix.prezzo >= 25 || vix.prezzo <= 13 || Math.abs(vix.giorno ?? 0) >= 10)) {
    const l = vix.prezzo;
    const commento = l >= 35 ? "siamo nella zona in cui gli operatori si coprono dai cali con decisione"
      : l >= 25 ? "sopra 25 significa che gli operatori si stanno proteggendo dai ribassi"
      : l <= 13 ? "sotto 13 il mercato è molto tranquillo, a volte troppo"
      : "sotto 15 vuol dire mercato calmo";
    const mese = vix.mese != null ? ` Un mese fa era a ${num(l / (1 + vix.mese / 100), 1)}: in quattro settimane è cambiato del ${pct(vix.mese, 0)}.` : '';
    return { id: 'dato', titolo: 'Il dato da non perdere',
      testo: `L'indice della paura (VIX) è a ${num(l, 2)}, ${pct(vix.giorno)} oggi: ${commento}.${mese}`,
      sym: '^VIX' };
  }

  const candidati = ctx.mappa && [...ctx.mappa.values()].filter((d) => d.mese != null && d.sym !== '^VIX');
  const forte = candidati?.sort((a, b) => Math.abs(b.mese) - Math.abs(a.mese))[0];
  if (forte) {
    return { id: 'dato', titolo: 'Il dato da non perdere',
      testo: `Il movimento più grosso del mese è ${forte.nome}: ${pct(forte.mese, 1)} in quattro settimane, oggi ${pct(forte.giorno)}. ${forte.perche || ''}`.trim(),
      sym: forte.sym };
  }
  return { id: 'dato', titolo: 'Il dato da non perdere',
    testo: `Il tasso americano a 10 anni è al ${num(t10?.prezzo, 2)}%: è il riferimento per il costo del denaro nel mondo.`, sym: '^TNX' };
}

function sezGuardare(ctx) {
  const { tipo } = ctx;
  const t10 = ctx.g('^TNX'), eur = ctx.g('EURUSD=X'), pet = ctx.g('CL=F');
  const p = [];

  if (tipo === 'mattina') {
    const as = ctx.medie.asia;
    p.push(as > 0.15 ? "L'Asia arriva in positivo e di solito aiuta l'apertura europea."
      : as < -0.15 ? "L'Asia arriva in negativo: l'apertura europea parte senza spinta."
      : "L'Asia arriva piatta e non dà indicazioni forti all'apertura europea.");
  } else if (tipo === 'sera') {
    p.push('Wall Street chiude alle 22 ora italiana: quello che succede dopo la chiusura di Milano si scarica sull’apertura di domani.');
  }
  if (t10?.prezzo != null) p.push(`Il tasso americano a 10 anni è al ${num(t10.prezzo, 2)}% (${pct(t10.giorno)}): sopra il 4,5% le borse fanno più fatica.`);
  if (eur?.prezzo != null) p.push(`L'euro vale ${num(eur.prezzo, 4)} dollari.`);
  if (pet?.prezzo != null && Math.abs(pet.giorno ?? 0) > 1.5) p.push(`Il petrolio si muove parecchio oggi (${pct(pet.giorno)}, ${num(pet.prezzo, 2)} dollari).`);
  return { id: 'guardare', titolo: 'Cosa guardare adesso', testo: p.join(' ') };
}

function sezContesto(ctx) {
  const voci = ['GC=F', 'CL=F', 'BTC-USD', '^IXIC'].map((s) => ctx.g(s)).filter((d) => d?.mese != null);
  if (!voci.length) return null;

  const giu = voci.filter((d) => d.mese < -3), su = voci.filter((d) => d.mese > 3);
  const lista = voci.map((d) => `${d.nome.toLowerCase()} ${pct(d.mese, 1)}`).join(', ');
  let lettura;
  if (giu.length >= 3) lettura = "Quando scendono insieme borse, oro e materie prime, di solito non c'è un problema in un singolo settore: gli investitori stanno riducendo il rischio in generale.";
  else if (su.length >= 3) lettura = 'Quando sale quasi tutto insieme, di solito c’è molto denaro che cerca di essere investito.';
  else lettura = 'I movimenti vanno in direzioni diverse: è il segno di un mercato che sta scegliendo dove stare, non di una fuga generale.';
  return { id: 'contesto', titolo: 'Il contesto che manca nei titoli', testo: `Negli ultimi trenta giorni: ${lista}. ${lettura}` };
}

// ———————————————————————————————— la notifica

function creaNotifica(ctx) {
  const { medie, clima, tipo } = ctx;
  const eu = medie.europa, us = medie.usa, as = medie.asia;
  const mib = ctx.g('FTSEMIB.MI');
  const tema = ctx.temi[0];
  // Alle 9 le borse europee non hanno ancora aperto: il titolo deve parlare
  // di quello che si e' gia' mosso, cioe' Asia stanotte e Wall Street ieri sera.
  const voci = tipo === 'mattina'
    ? [['Asia', as, 1.2], ['Wall Street', us, 1.2], ['Europa', eu, 1.8]]
    : [['Europa', eu, 1.2], ['Wall Street', us, 1.2], ['Asia', as, 1.8]];

  let titolo = null;
  for (const [dove, valore, soglia] of voci) {
    if (valore == null || Math.abs(valore) < soglia) continue;
    const quanto = pct(Math.abs(valore), 1).replace('+', '');
    titolo = dove === 'Europa' ? `L'Europa ${valore > 0 ? 'guadagna' : 'perde'} ${quanto}`
      : dove === 'Wall Street' ? `Wall Street ${valore > 0 ? 'in rialzo' : 'in calo'} del ${quanto}`
      : `Asia ${valore > 0 ? 'in rialzo' : 'in calo'}, ${pct(valore, 1)}`;
    break;
  }
  if (!titolo) {
    titolo = (clima.vix ?? 0) >= 28 ? 'La paura resta alta sui mercati'
      : clima.punteggio < 40 ? 'Giornata tranquilla sui mercati'
      : `Mercati ${clima.parola}`;
  }

  const pezzi = [];
  if (tipo === 'sera' && mib?.giorno != null) pezzi.push(`Milano ${pct(mib.giorno)}`);
  else if (tipo === 'mattina' && as != null) pezzi.push(`Asia ${pct(as, 1)}`);
  if (us != null) pezzi.push(`Wall Street ${pct(us, 1)}`);
  if (clima.vix != null) pezzi.push(`paura a ${num(clima.vix, 0)}`);

  let corpo = pezzi.join(', ') + '.';
  if (tema) corpo += ` Si parla soprattutto di ${tema.nome}.`;
  return { titolo, corpo: taglia(corpo, 175) };
}

// ———————————————————————————————— assemblaggio

export function costruisciReport(mercati, notizie, tipo = 'mattina', adesso = new Date()) {
  const ctx = creaContesto(mercati, notizie, tipo, adesso);
  const sezioni = [sezCosaSuccesso(ctx), sezPerche(ctx), sezDato(ctx), sezGuardare(ctx), sezContesto(ctx)].filter(Boolean);

  return {
    tipo,
    generatoIl: adesso.toISOString(),
    ora: oraItalia(adesso),
    data: dataItalia(adesso),
    notifica: creaNotifica(ctx),
    clima: ctx.clima,
    sezioni,
    temi: ctx.temi,
    fonti: [...new Set(notizie.map((n) => n.fonte))],
  };
}
