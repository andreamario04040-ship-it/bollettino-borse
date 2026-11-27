// Genera i tracciati della mappa del mondo (docs/mappa.js) a partire da
// Natural Earth, nella versione TopoJSON "world-atlas" 110m.
//
// Natural Earth è di pubblico dominio, quindi i tracciati possono stare nel
// repository senza vincoli. Questo script si lancia a mano (`npm run mappa`)
// quando serve rifare il disegno: l'app non scarica niente da fuori, legge il
// file già pronto.
//
// Il mondo è diviso nelle zone per cui seguo almeno un indice. Tutto il resto
// finisce in "fuori": disegnato in grigio, perché colorare di verde o di rosso
// una terra di cui non so niente sarebbe una bugia.

import { writeFile } from 'node:fs/promises';

const ATLANTE = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

const ZONE = {
  nordamerica: ['United States of America', 'Canada', 'Greenland'],
  latam: [
    'Mexico', 'Guatemala', 'Belize', 'El Salvador', 'Honduras', 'Nicaragua', 'Costa Rica', 'Panama',
    'Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Bahamas', 'Puerto Rico', 'Trinidad and Tobago',
    'Colombia', 'Venezuela', 'Guyana', 'Suriname', 'Ecuador', 'Peru', 'Brazil', 'Bolivia',
    'Paraguay', 'Chile', 'Argentina', 'Uruguay', 'Falkland Is.',
  ],
  europa: [
    'Albania', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herz.', 'Bulgaria', 'Croatia', 'Cyprus',
    'N. Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
    'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Lithuania', 'Luxembourg', 'Macedonia',
    'Moldova', 'Montenegro', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia',
    'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom',
  ],
  asia: [
    'China', 'Japan', 'South Korea', 'North Korea', 'Taiwan', 'India', 'Pakistan', 'Bangladesh',
    'Nepal', 'Bhutan', 'Sri Lanka', 'Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia',
    'Brunei', 'Indonesia', 'Philippines', 'Timor-Leste', 'Mongolia', 'Kazakhstan', 'Kyrgyzstan',
    'Tajikistan', 'Turkmenistan', 'Uzbekistan', 'Afghanistan',
  ],
  oceania: ['Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Solomon Is.', 'Vanuatu', 'New Caledonia'],
};

// L'Antartide non serve a nessuno qui e si porterebbe via un quarto dell'altezza.
const SALTA = ['Antarctica', 'Fr. S. Antarctic Lands'];

// Pezzi d'oltremare che nell'atlante stanno dentro il paese madre, ma sulla
// mappa cadono dall'altra parte del mondo. Restano nel grigio: la Guyana
// francese è Francia, però colorarla d'Europa farebbe arrivare il riquadro
// dello zoom europeo fino all'equatore.
const OLTREMARE = { France: (b) => b[0] < 400 };

const LARGHEZZA = 1000;
const NORD = 84, SUD = -58;                       // taglio in latitudine
const ALTEZZA = Math.round((LARGHEZZA * (NORD - SUD)) / 360 * 10) / 10;

// Quanto si può snellire un contorno, in pixel della mappa da 1000 di largo.
// Le zone si ingrandiscono col clic, quindi tengono più dettaglio del grigio.
const TOLLERANZA_ZONA = 0.35, TOLLERANZA_FUORI = 0.9;
const MINIMA_ZONA = 0.004, MINIMA_FUORI = 0.05;   // area sotto cui un'isola non si disegna

const ascissa = (lon) => ((lon + 180) / 360) * LARGHEZZA;
const ordinata = (lat) => ((NORD - lat) / (NORD - SUD)) * ALTEZZA;
const arrotonda = (v) => Math.round(v * 10) / 10;

function archiAssoluti(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  return topo.arcs.map((arco) => {
    let x = 0, y = 0;
    return arco.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
}

function anello(indici, archi) {
  const punti = [];
  for (const i of indici) {
    const a = i < 0 ? [...archi[~i]].reverse() : archi[i];
    for (const p of (punti.length ? a.slice(1) : a)) punti.push(p);
  }
  return punti;
}

function areaDi(punti) {
  let a = 0;
  for (let i = 0, n = punti.length; i < n; i++) {
    const [x1, y1] = punti[i], [x2, y2] = punti[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

// Douglas-Peucker: butta i punti che stanno a meno di `tolleranza` pixel dalla
// retta fra i loro vicini. A 1000 px di largo, i dati di Natural Earth hanno
// decine di punti che cadono tutti dentro lo stesso pixel.
function snellisci(p, tolleranza) {
  if (p.length < 4) return p;
  const tengo = new Uint8Array(p.length);
  tengo[0] = tengo[p.length - 1] = 1;
  const pile = [[0, p.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const [xa, ya] = p[a], [xb, yb] = p[b];
    const dx = xb - xa, dy = yb - ya;
    const lung = Math.hypot(dx, dy);
    let peggiore = -1, distanza = 0;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = p[i];
      const d = lung === 0 ? Math.hypot(x - xa, y - ya) : Math.abs(dy * (x - xa) - dx * (y - ya)) / lung;
      if (d > distanza) { distanza = d; peggiore = i; }
    }
    if (distanza > tolleranza && peggiore > 0) { tengo[peggiore] = 1; pile.push([a, peggiore], [peggiore, b]); }
  }
  return p.filter((_, i) => tengo[i]);
}

function proietta(punti) {
  const fuori = [];
  for (const [lon, lat] of punti) {
    const x = ascissa(lon), y = ordinata(Math.max(SUD, Math.min(NORD, lat)));
    const ultimo = fuori[fuori.length - 1];
    if (!ultimo || Math.abs(ultimo[0] - x) > 0.01 || Math.abs(ultimo[1] - y) > 0.01) fuori.push([x, y]);
  }
  return fuori;
}

const disegna = (p) => 'M' + p.map(([x, y]) => `${arrotonda(x)} ${arrotonda(y)}`).join('L') + 'Z';
const scorri = (p, dx) => p.map(([x, y]) => [x + dx, y]);

function misura(p, extra = {}) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  return {
    d: disegna(p), area: areaDi(p), punti: p.length,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(arrotonda),
    ...extra,
  };
}

// Un anello può stare a cavallo del meridiano 180: le Fiji e la Chukotka russa
// hanno punti a −179° e a +179°. Preso alla lettera, un anello così diventa una
// striscia che attraversa tutta la mappa. Si rimettono in fila le longitudini e
// si disegna due volte, una per bordo: la cornice taglia da sé quello che esce.
function tracciato(crudi, areaMinima, tolleranza) {
  const longitudini = crudi.map(([lon]) => lon);
  const scavalca = Math.max(...longitudini) - Math.min(...longitudini) > 180;
  const punti = scavalca ? crudi.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : crudi;

  const p = proietta(punti);
  if (p.length < 3 || areaDi(p) < areaMinima) return [];
  const s = snellisci(p, tolleranza);
  if (s.length < 3) return [];
  if (!scavalca) return [misura(s)];
  return [misura(s, { scavalca: true }), misura(scorri(s, -LARGHEZZA), { scavalca: true })];
}

function perPaese(geo, archi, areaMinima, tolleranza) {
  const poligoni = geo.type === 'Polygon' ? [geo.arcs] : geo.arcs;
  const anelli = [];
  for (const poligono of poligoni) {
    for (const indici of poligono) anelli.push(...tracciato(anello(indici, archi), areaMinima, tolleranza));
  }
  return anelli;
}

// Le terre che contano: le più grandi, fino a coprire il 97% della superficie
// della zona. Il resto sono isole, e prese alla lettera sposterebbero il
// riquadro dall'altra parte del mondo — le Fiji stanno a cavallo del meridiano
// 180, e il riquadro dell'Oceania andrebbe da un bordo all'altro della mappa.
function principali(tutti) {
  const ordinati = tutti.filter((a) => !a.scavalca).sort((a, b) => b.area - a.area);
  const totale = ordinati.reduce((s, a) => s + a.area, 0);
  const contano = [];
  let somma = 0;
  for (const a of ordinati) {
    contano.push(a); somma += a.area;
    if (somma >= totale * 0.97) break;
  }
  return contano;
}

function riquadro(contano) {
  return [
    Math.min(...contano.map((a) => a.bbox[0])), Math.min(...contano.map((a) => a.bbox[1])),
    Math.max(...contano.map((a) => a.bbox[2])), Math.max(...contano.map((a) => a.bbox[3])),
  ].map(arrotonda);
}

// Dove scrivere la percentuale della zona. Il centro del riquadro non va bene:
// quello del Nord America, tirato a ovest dalle Aleutine, cade in mezzo al
// Pacifico. Il baricentro delle terre grandi sta invece sulla terra.
function centro(contano) {
  const peso = contano.reduce((s, a) => s + a.area, 0);
  const media = (i) => contano.reduce((s, a) => s + a.area * (a.bbox[i] + a.bbox[i + 2]) / 2, 0) / peso;
  return [arrotonda(media(0)), arrotonda(media(1))];
}

const r = await fetch(ATLANTE, { signal: AbortSignal.timeout(30000) });
if (!r.ok) throw new Error(`l'atlante non arriva: HTTP ${r.status}`);
const topo = await r.json();
const archi = archiAssoluti(topo);
const paesi = topo.objects.countries.geometries;

// Un nome scritto male resterebbe muto: il paese finirebbe nel grigio e nessuno
// se ne accorgerebbe. Meglio fermarsi qui.
const nomiAtlante = new Set(paesi.map((g) => g.properties?.name).filter(Boolean));
const sbagliati = Object.values(ZONE).flat().filter((n) => !nomiAtlante.has(n));
if (sbagliati.length) throw new Error(`nomi che l'atlante non conosce: ${sbagliati.join(', ')}`);

const diZona = new Map();
for (const [zona, nomi] of Object.entries(ZONE)) for (const n of nomi) diZona.set(n, zona);

const anelliZona = Object.fromEntries(Object.keys(ZONE).map((z) => [z, []]));
const anelliFuori = [];
const senzaZona = [], scartati = [], oltremare = [];

for (const geo of paesi) {
  const nome = geo.properties?.name;
  if (!nome || SALTA.includes(nome)) continue;
  const zona = diZona.get(nome);
  let anelli = perPaese(geo, archi, zona ? MINIMA_ZONA : MINIMA_FUORI, zona ? TOLLERANZA_ZONA : TOLLERANZA_FUORI);
  if (!anelli.length) { scartati.push(nome); continue; }

  const lontano = OLTREMARE[nome];
  if (lontano) {
    const via = anelli.filter((a) => lontano(a.bbox));
    anelli = anelli.filter((a) => !lontano(a.bbox));
    if (via.length) { anelliFuori.push(...via); oltremare.push(`${nome} (${via.length})`); }
  }
  if (zona) anelliZona[zona].push(...anelli); else { anelliFuori.push(...anelli); senzaZona.push(nome); }
}

const vuote = Object.entries(anelliZona).filter(([, a]) => !a.length).map(([z]) => z);
if (vuote.length) throw new Error(`zone senza tracciato: ${vuote.join(', ')}`);

const zone = Object.fromEntries(Object.entries(anelliZona).map(([z, anelli]) => {
  const contano = principali(anelli);
  return [z, { d: anelli.map((a) => a.d).join(''), bbox: riquadro(contano), centro: centro(contano) }];
}));
const fuori = anelliFuori.map((a) => a.d).join('');

const testo = `/* Mappa del mondo — generata da engine/mappa.mjs: non scrivere qui a mano.
   Dati: Natural Earth via world-atlas 110m, pubblico dominio.
   Proiezione piana (plate carrée), latitudini tagliate a ${NORD}° e ${SUD}°. */
const MAPPA = ${JSON.stringify({ larghezza: LARGHEZZA, altezza: ALTEZZA, zone, fuori })};
`;
await writeFile(new URL('../docs/mappa.js', import.meta.url), testo);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
const punti = (a) => a.reduce((s, x) => s + x.punti, 0);
console.log(`mappa: ${LARGHEZZA}×${ALTEZZA}`);
for (const [z, v] of Object.entries(zone)) {
  console.log(`  ${z.padEnd(12)} ${kb(v.d).padStart(8)}  ${String(punti(anelliZona[z])).padStart(5)} punti  riquadro ${v.bbox.join(' ')}  centro ${v.centro.join(' ')}`);
}
console.log(`  ${'fuori'.padEnd(12)} ${kb(fuori).padStart(8)}  ${String(punti(anelliFuori)).padStart(5)} punti  ${senzaZona.length} paesi senza indici`);
console.log(`  totale file ${kb(testo)}`);
console.log(`  pezzi d'oltremare lasciati nel grigio: ${oltremare.length ? oltremare.join(', ') : 'nessuno'}`);
console.log(`  isole troppo piccole per il disegno: ${scartati.length ? scartati.join(', ') : 'nessuna'}`);
console.log(`  nel grigio: ${senzaZona.join(', ')}`);
