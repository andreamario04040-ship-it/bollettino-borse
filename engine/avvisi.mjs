// Decide se un movimento merita di interrompere la giornata.
// Regola guida: meglio tacere che mandare un avviso che non serve.

import { pct, num, taglia, minutiDaMezzanotteRoma, giornoRoma, oraItalia } from './lingua.mjs';
import { comunicatiRecenti } from './notizie.mjs';

const minuti = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export const statoVuoto = () => ({ giorno: null, avvisiOggi: 0, ultimoAvviso: null, motiviUsati: [], intensita: {} });

function eventiPossibili(mercati, notizie, s, adesso) {
  const m = new Map(mercati.map((x) => [x.sym, x]));
  const g = (k) => m.get(k);
  const ev = [];

  // 1. Una grande piazza che si muove tanto in un giorno solo.
  const azionari = ['^GSPC', '^IXIC', '^STOXX50E', 'FTSEMIB.MI', '^DJI', '^N225'];
  for (const sym of azionari) {
    const d = g(sym);
    if (d?.giorno != null && Math.abs(d.giorno) >= s.indice_azionario_percento) {
      ev.push({
        motivo: `azioni-${d.giorno < 0 ? 'giu' : 'su'}`, forza: Math.abs(d.giorno), sym,
        intensita: d.giorno,
        titolo: `${d.nome} ${d.giorno < 0 ? 'in forte calo' : 'in forte rialzo'}`,
        corpo: `${d.nome} ${pct(d.giorno)} in giornata, a ${num(d.prezzo)}. È un movimento ampio: di solito arriva da una notizia precisa, non dal normale saliscendi.`,
      });
    }
  }

  // 2. L'indice della paura che scatta.
  const vix = g('^VIX');
  if (vix?.prezzo != null) {
    const scatto = (vix.giorno ?? 0) >= s.vix_scatto_percento;
    const altoEinSalita = vix.prezzo >= s.vix_livello && (vix.giorno ?? 0) >= s.vix_variazione_percento;
    if (scatto || altoEinSalita) {
      ev.push({
        motivo: 'paura', forza: Math.abs(vix.giorno ?? 0) / 4, sym: '^VIX', intensita: vix.prezzo,
        titolo: 'La paura sta salendo in fretta',
        corpo: `L'indice della paura (VIX) è a ${num(vix.prezzo, 1)}, ${pct(vix.giorno)} in giornata. Sopra 30 significa che gli operatori si stanno coprendo dai cali con decisione.`,
      });
    }
  }

  // 3. Materie prime, criptovalute, tassi.
  const scosse = [
    ['CL=F', s.petrolio_percento, 'petrolio', 'Il petrolio si muove forte', (d) => `Petrolio ${pct(d.giorno)}, a ${num(d.prezzo, 2)} dollari. Conta perché finisce in benzina e bollette, con due o tre mesi di ritardo.`],
    ['GC=F', s.oro_percento, 'oro', "Scossa sull'oro", (d) => `Oro ${pct(d.giorno)}, a ${num(d.prezzo, 2)} dollari. L'oro si muove così quando cambia di colpo la paura o l'attesa sui tassi.`],
    ['BTC-USD', s.bitcoin_percento, 'crypto', 'Bitcoin in forte movimento', (d) => `Bitcoin ${pct(d.giorno)}, a ${num(d.prezzo)} dollari. È il termometro più estremo della voglia di rischiare.`],
    ['^TNX', s.tasso_10anni_percento, 'tassi', 'Si muove il costo del denaro', (d) => `Il tasso americano a 10 anni è al ${num(d.prezzo, 2)}% (${pct(d.giorno)}). Quando sale in fretta, le borse e soprattutto i titoli tecnologici soffrono.`],
  ];
  for (const [sym, soglia, motivo, titolo, testo] of scosse) {
    const d = g(sym);
    if (d?.giorno != null && Math.abs(d.giorno) >= soglia) {
      ev.push({ motivo, forza: Math.abs(d.giorno) / (soglia / 2), sym, intensita: d.giorno, titolo, corpo: testo(d) });
    }
  }

  // 4. Un comunicato ufficiale di BCE o Federal Reserve: l'unica notizia che da sola basta.
  for (const c of comunicatiRecenti(notizie, 2, adesso)) {
    ev.push({
      motivo: 'banca-centrale', forza: 99, sym: null, intensita: 1,
      titolo: `Comunicato ${c.fonte}`,
      corpo: `${taglia(c.titolo, 150)} — è un annuncio ufficiale della banca centrale, il tipo di notizia che muove i tassi e di conseguenza le borse.`,
      link: c.link,
    });
  }

  return ev;
}

export function valutaAvviso({ mercati, notizie, stato, config, adesso = new Date() }) {
  const a = config.avvisi;
  if (!a?.attivi) return { inviare: false, perche: 'avvisi disattivati', stato };

  const oggi = giornoRoma(adesso);
  // A inizio giornata il contatore riparte da zero.
  let s = stato?.giorno === oggi ? { ...stato } : { ...statoVuoto(), giorno: oggi };

  // Si restituisce sempre la copia aggiornata, anche quando non si manda niente:
  // altrimenti il cambio di giorno non verrebbe mai salvato sul file.
  const scarta = (perche) => ({ inviare: false, perche, stato: s });

  const ora = minutiDaMezzanotteRoma(adesso);
  if (ora < minuti(a.finestra.da) || ora > minuti(a.finestra.a)) return scarta(`fuori dalla finestra oraria (${oraItalia(adesso)})`);

  // Niente avvisi a ridosso dei bollettini fissi: sarebbe un doppione.
  for (const b of [config.orari.mattina_locale, config.orari.sera]) {
    if (b && Math.abs(ora - minuti(b)) <= a.minuti_di_silenzio_attorno_ai_bollettini) return scarta(`troppo vicino al bollettino delle ${b}`);
  }
  if (s.avvisiOggi >= a.massimo_al_giorno) return scarta(`già inviati ${s.avvisiOggi} avvisi oggi`);
  if (s.ultimoAvviso) {
    const passati = (adesso - new Date(s.ultimoAvviso)) / 60000;
    if (passati < a.minuti_tra_un_avviso_e_l_altro) return scarta(`ultimo avviso ${Math.round(passati)} minuti fa`);
  }

  const tutti = eventiPossibili(mercati, notizie, a.soglie, adesso);
  const candidati = tutti
    .filter((e) => !s.motiviUsati.includes(e.motivo))
    // Il movimento deve essere NUOVO: se era già così all'ultimo controllo, si tace.
    .filter((e) => {
      const prima = s.intensita[e.motivo];
      if (prima == null) return true;
      return Math.abs(e.intensita - prima) >= 0.6;
    })
    .sort((x, y) => y.forza - x.forza);

  if (!candidati.length) {
    return scarta(tutti.length
      ? `${tutti.length} movimento/i oltre soglia, ma già segnalati o non peggiorati`
      : 'nessun movimento oltre le soglie');
  }

  const e = candidati[0];
  s.avvisiOggi += 1;
  s.ultimoAvviso = adesso.toISOString();
  s.motiviUsati = [...s.motiviUsati, e.motivo];
  // Si segna quanto era forte il movimento adesso: il confronto servirà
  // a capire se più tardi è davvero peggiorato o se è semplicemente rimasto lì.
  s.intensita = { ...s.intensita, [e.motivo]: e.intensita };

  return { inviare: true, evento: e, stato: s,
    notifica: { titolo: e.titolo, corpo: e.corpo, tipo: 'avviso', link: e.link || null } };
}
