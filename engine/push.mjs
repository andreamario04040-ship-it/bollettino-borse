// Spedisce la notifica ai dispositivi iscritti.
import webpush from 'web-push';

// Un dispositivo per segreto: ISCRIZIONE_PUSH per il primo, poi _2, _3, _4.
// Così si aggiunge il Mac senza dover rincollare quella dell'iPhone, che
// una volta salvata nei segreti non è più leggibile da nessuno.
const NOMI_ISCRIZIONE = ['ISCRIZIONE_PUSH', 'ISCRIZIONE_PUSH_2', 'ISCRIZIONE_PUSH_3', 'ISCRIZIONE_PUSH_4'];

function leggiIscrizioni(env) {
  const trovate = [];
  for (const nome of NOMI_ISCRIZIONE) {
    const grezzo = (env[nome] || '').trim();
    if (!grezzo) continue;
    let v;
    try { v = JSON.parse(grezzo); }
    catch { console.error(`  ! ${nome} non è un JSON valido: lo salto. Ricopia il codice dall’app.`); continue; }
    for (const x of (Array.isArray(v) ? v : [v])) if (x && x.endpoint) trovate.push(x);
  }
  // Lo stesso dispositivo iscritto due volte riceverebbe due notifiche uguali.
  // Lo si dice a voce alta: senza, chi aggiunge un dispositivo e ne vede
  // sempre uno solo non ha modo di capire perché.
  const viste = new Set();
  const uniche = trovate.filter((x) => !viste.has(x.endpoint) && viste.add(x.endpoint));
  const scartate = trovate.length - uniche.length;
  if (scartate) {
    console.warn(`  ⚠ ${scartate} iscrizion${scartate === 1 ? 'e' : 'i'} identic${scartate === 1 ? 'a' : 'he'} a un'altra: la salto.`);
    console.warn('    Succede incollando due volte lo stesso codice: vale quello copiato');
    console.warn('    DAL dispositivo che vuoi aggiungere, non quello di un altro.');
  }
  return uniche;
}

export async function inviaNotifica(notifica, env = process.env) {
  const pubblica = env.VAPID_PUBBLICA, privata = env.VAPID_PRIVATA;
  // Lo standard vuole un recapito vero: il servizio di Apple può rifiutare
  // un indirizzo inventato, e il messaggio di errore non lo spiega.
  const contatto = env.VAPID_CONTATTO || 'mailto:bollettino@example.com';
  if (!env.VAPID_CONTATTO) {
    console.warn('  ⚠ VAPID_CONTATTO non impostato: uso un indirizzo di riserva.');
    console.warn('    Se Apple rifiuta l’invio, imposta il segreto con un tuo indirizzo vero.');
  }
  const iscrizioni = leggiIscrizioni(env);

  if (!pubblica || !privata) { console.log('  push: chiavi assenti, non invio niente'); return { inviate: 0, saltata: 'chiavi' }; }
  if (!iscrizioni.length) { console.log('  push: nessun dispositivo iscritto (apri l’app e attiva le notifiche)'); return { inviate: 0, saltata: 'iscrizioni' }; }
  console.log(`  push: ${iscrizioni.length} dispositiv${iscrizioni.length === 1 ? 'o' : 'i'} iscritt${iscrizioni.length === 1 ? 'o' : 'i'}`);

  webpush.setVapidDetails(contatto, pubblica, privata);
  const carico = JSON.stringify({ titolo: notifica.titolo, corpo: notifica.corpo, tipo: notifica.tipo || 'bollettino', url: notifica.url || './' });

  let inviate = 0; const scadute = [];
  for (const i of iscrizioni) {
    try {
      await webpush.sendNotification(i, carico, { TTL: 6 * 3600, urgency: notifica.tipo === 'avviso' ? 'high' : 'normal' });
      inviate++;
    } catch (e) {
      const c = e.statusCode;
      if (c === 404 || c === 410) { scadute.push(i.endpoint.slice(0, 60)); console.error(`  ! iscrizione scaduta: riattiva le notifiche dall’app`); }
      else console.error(`  ! invio fallito (HTTP ${c || '?'}): ${e.message}`);
    }
  }
  console.log(`  push: ${inviate}/${iscrizioni.length} inviate`);
  return { inviate, scadute };
}
