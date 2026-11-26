// Spedisce la notifica ai dispositivi iscritti.
import webpush from 'web-push';

function leggiIscrizioni(grezzo) {
  if (!grezzo) return [];
  let v;
  try { v = JSON.parse(grezzo); } catch { throw new Error('ISCRIZIONE_PUSH non è un JSON valido: ricopia il codice dall’app.'); }
  const lista = Array.isArray(v) ? v : [v];
  return lista.filter((x) => x && x.endpoint);
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
  const iscrizioni = leggiIscrizioni(env.ISCRIZIONE_PUSH);

  if (!pubblica || !privata) { console.log('  push: chiavi assenti, non invio niente'); return { inviate: 0, saltata: 'chiavi' }; }
  if (!iscrizioni.length) { console.log('  push: nessun dispositivo iscritto (apri l’app e attiva le notifiche)'); return { inviate: 0, saltata: 'iscrizioni' }; }

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
