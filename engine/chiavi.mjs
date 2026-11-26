// Genera la coppia di chiavi VAPID: servono a dimostrare ad Apple e Google
// che le notifiche arrivano davvero dal tuo server e non da uno sconosciuto.
import webpush from 'web-push';
const c = webpush.generateVAPIDKeys();
console.log(`\n  Chiave PUBBLICA (va dentro public/app.js)\n  ${c.publicKey}\n`);
console.log(`  Chiave PRIVATA (va nel segreto VAPID_PRIVATA su GitHub, non condividerla)\n  ${c.privateKey}\n`);
