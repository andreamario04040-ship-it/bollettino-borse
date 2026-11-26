import { valutaAvviso, statoVuoto } from './avvisi.mjs';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url),'utf8'));

const M = (o={}) => [
  { sym:'^GSPC', nome:'S&P 500', prezzo:7000, giorno:o.gspc ?? -0.3 },
  { sym:'FTSEMIB.MI', nome:'FTSE MIB', prezzo:47000, giorno:o.mib ?? -0.4 },
  { sym:'^VIX', nome:'VIX', prezzo:o.vixL ?? 20, giorno:o.vix ?? 1 },
  { sym:'CL=F', nome:'Petrolio WTI', prezzo:84, giorno:o.oil ?? 0.5 },
  { sym:'GC=F', nome:'Oro', prezzo:3600, giorno:o.gold ?? 0.2 },
  { sym:'BTC-USD', nome:'Bitcoin', prezzo:60000, giorno:o.btc ?? 1 },
  { sym:'^TNX', nome:'Tasso USA 10 anni', prezzo:4.85, giorno:o.tnx ?? 0.3 },
];
const ora = (hhmm) => { const d=new Date('2026-11-26T12:00:00Z'); const [h,m]=hhmm.split(':').map(Number);
  d.setUTCHours(h-1,m,0,0); return d; };  // novembre: Italia = UTC+1

let passati=0, falliti=0;
const prova = (nome, atteso, esito) => {
  const ok = esito.inviare === atteso;
  console.log(`${ok?'  ✓':'  ✗'} ${nome}${ok?'':`  (atteso ${atteso}, ottenuto ${esito.inviare}: ${esito.perche||esito.evento?.motivo})`}`);
  ok?passati++:falliti++;
  return esito;
};

const base = { notizie:[], config };

console.log('\nQUANDO DEVE SUONARE');
prova('calo del 2,4% su Milano', true, valutaAvviso({...base, mercati:M({mib:-2.4}), stato:statoVuoto(), adesso:ora('14:30')}));
prova('scatto del VIX del 25%', true, valutaAvviso({...base, mercati:M({vix:25}), stato:statoVuoto(), adesso:ora('14:30')}));
prova('petrolio +5%', true, valutaAvviso({...base, mercati:M({oil:5.2}), stato:statoVuoto(), adesso:ora('14:30')}));

console.log('\nQUANDO DEVE TACERE');
prova('giornata normale', false, valutaAvviso({...base, mercati:M(), stato:statoVuoto(), adesso:ora('14:30')}));
prova('movimento grosso ma di notte', false, valutaAvviso({...base, mercati:M({mib:-3}), stato:statoVuoto(), adesso:ora('23:40')}));
prova('troppo vicino al bollettino delle 9', false, valutaAvviso({...base, mercati:M({mib:-3}), stato:statoVuoto(), adesso:ora('09:20')}));
prova('troppo vicino al bollettino delle 18:15', false, valutaAvviso({...base, mercati:M({mib:-3}), stato:statoVuoto(), adesso:ora('18:00')}));
prova('già due avvisi oggi', false, valutaAvviso({...base, mercati:M({mib:-3}), adesso:ora('15:00'),
  stato:{...statoVuoto(), giorno:'2026-11-26', avvisiOggi:2, ultimoAvviso:ora('11:00').toISOString()}}));
prova('ultimo avviso 40 minuti fa', false, valutaAvviso({...base, mercati:M({mib:-3}), adesso:ora('15:00'),
  stato:{...statoVuoto(), giorno:'2026-11-26', avvisiOggi:1, ultimoAvviso:ora('14:20').toISOString()}}));
prova('stesso motivo già usato oggi', false, valutaAvviso({...base, mercati:M({mib:-3}), adesso:ora('16:00'),
  stato:{...statoVuoto(), giorno:'2026-11-26', avvisiOggi:1, ultimoAvviso:ora('11:00').toISOString(), motiviUsati:['azioni-giu']}}));

console.log('\nIL CASO CHE CONTA: restare oltre soglia non è una notizia nuova');
const s1 = valutaAvviso({...base, mercati:M({mib:-2.4}), stato:statoVuoto(), adesso:ora('11:00')});
const s2 = prova('stesso calo quattro ore dopo', false,
  valutaAvviso({...base, mercati:M({mib:-2.5}), stato:{...s1.stato, motiviUsati:[]}, adesso:ora('15:10')}));
prova('ma se peggiora davvero, suona', true,
  valutaAvviso({...base, mercati:M({mib:-4.1}), stato:{...s1.stato, motiviUsati:[]}, adesso:ora('15:10')}));

console.log('\nIL CONTATORE RIPARTE A MEZZANOTTE');
const ieri = { giorno:'2026-11-25', avvisiOggi:2, ultimoAvviso:'2026-11-25T16:00:00.000Z', motiviUsati:['azioni-giu','paura'], intensita:{} };
const nuovoGiorno = prova('due avvisi ieri non bloccano oggi', true,
  valutaAvviso({...base, mercati:M({mib:-2.6}), stato:ieri, adesso:ora('14:30')}));
const quieto = valutaAvviso({...base, mercati:M(), stato:ieri, adesso:ora('14:30')});
const okData = quieto.stato.giorno === '2026-11-26' && quieto.stato.avvisiOggi === 0;
console.log(`${okData?'  ✓':'  ✗'} anche senza avvisi, lo stato salvato passa al giorno nuovo`);
okData?passati++:falliti++;

console.log('\nUN COMUNICATO UFFICIALE BASTA DA SOLO');
prova('comunicato BCE di un\'ora fa', true, valutaAvviso({...base, adesso:ora('14:30'), mercati:M(), stato:statoVuoto(),
  notizie:[{fonte:'BCE', ufficiale:true, titolo:'La BCE lascia i tassi invariati', sommario:'', peso:3, data:ora('13:30').toISOString()}]}));

console.log(`\n  ${passati} passati, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
