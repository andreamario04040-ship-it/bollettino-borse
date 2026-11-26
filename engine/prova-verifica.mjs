// Casi costruiti per il controllo delle cifre nei riassunti dell'agente.
// Non serve l'agente vero: serve sapere che una cifra giusta non venga
// chiamata inventata, e che una inventata non passi.
import { verifica } from './verifica.mjs';
import { giornoRoma, oraItalia } from './lingua.mjs';

const adesso = new Date();
const mercati = [{ sym: '^VIX', nome: 'Paura', prezzo: 27, giorno: -1 }];

function caso(nome, motivo, { prezzo = 149.3, giorno = -3.91, testo = 'Nvidia ha spedito 500 server e investito 2,4 miliardi.' } = {}) {
  const azienda = {
    nome: 'Nvidia', settore: 'Semiconduttori', prezzo, giorno,
    motivo, scritto: 'agente',
    titoli: [{ fonte: 'Prova', titolo: 'Titolo di prova', link: 'l1' }],
  };
  const report = {
    data: undefined, generatoIl: adesso.toISOString(), ora: oraItalia(adesso),
    clima: { punteggio: 50, parola: 'incerto', vix: 27 },
    sezioni: [], aziende: [azienda],
    materialeAgente: [{ titolo: 'Titolo di prova', link: 'l1', testo }],
  };
  const p = verifica({ report, mercati, notizie: [], adesso })
    .filter((x) => x.dove === 'agente');
  const b = p.filter((x) => x.gravita === 'blocco').length;
  const a = p.filter((x) => x.gravita === 'avviso').length;
  console.log(`  ${b ? '✗' : a ? '⚠' : '✓'} ${nome}`);
  console.log(`      ${b} da bloccare, ${a} da guardare${p.length ? ' — ' + p.map((x) => x.cosa).join(' | ') : ''}`);
  return { b, a };
}

console.log('\n▸ cifre vere, scritte come le scrive una persona');
caso('prezzo con la virgola della frase attaccata: "vale 149,30, in calo"',
  'Il titolo vale 149,30, in calo del 3,91%. Ha spedito 500 server.');
caso('prezzo a fine frase: "vale 149,30."',
  'Il titolo vale 149,30. Ha investito 2,4 miliardi.');
caso('migliaia col punto: "48.476 punti"',
  'Ha spedito 500 server; l’indice segnava 48.476 punti.',
  { testo: 'L’indice segnava 48.476 punti e Nvidia ha spedito 500 server.' });

console.log('\n▸ cifre inventate: devono emergere');
caso('una cifra sola inventata → avviso',
  'Nvidia ha spedito 500 server e assunto 7.312 persone.');
caso('tre cifre inventate → blocco',
  'Nvidia ha fatturato 88,4 miliardi, assunto 7.312 persone e aperto 19 stabilimenti.');

console.log('\n▸ cifre prese da un’altra scheda: avviso, non blocco');
{
  const report = {
    generatoIl: adesso.toISOString(), ora: oraItalia(adesso),
    clima: { punteggio: 50, parola: 'incerto', vix: 27 }, sezioni: [],
    aziende: [
      { nome: 'Nvidia', settore: 'S', prezzo: 149.3, giorno: -3.91, scritto: 'agente',
        motivo: 'Nvidia ha spedito 500 server. Lo spread era a 1,88.',
        titoli: [{ fonte: 'P', titolo: 'T1', link: 'l1' }] },
      { nome: 'Intesa', settore: 'B', prezzo: 5.66, giorno: 2.97, scritto: 'agente',
        motivo: 'Intesa è salita del 2,97%.',
        titoli: [{ fonte: 'P', titolo: 'T2', link: 'l2' }] },
    ],
    materialeAgente: [
      { titolo: 'T1', link: 'l1', testo: 'Nvidia ha spedito 500 server.' },
      { titolo: 'T2', link: 'l2', testo: 'Lo spread era a 1,88 e Intesa saliva.' },
    ],
  };
  const p = verifica({ report, mercati, notizie: [], adesso }).filter((x) => x.dove === 'agente');
  const b = p.filter((x) => x.gravita === 'blocco').length, a = p.filter((x) => x.gravita === 'avviso').length;
  console.log(`  ${b ? '✗' : a === 1 ? '⚠' : '?'} lo spread di Intesa citato nella scheda Nvidia`);
  console.log(`      ${b} da bloccare, ${a} da guardare — ${p.map((x) => x.cosa).join(' | ')}`);
}
console.log('');
