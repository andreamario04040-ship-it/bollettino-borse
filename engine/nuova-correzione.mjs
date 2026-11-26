// Registra una correzione:
//   node engine/nuova-correzione.mjs "Titolo breve" "Cosa avevo sbagliato" "Com'è adesso"
import { aggiungiCorrezione } from './correzioni.mjs';

const [titolo, sbagliato, corretto] = process.argv.slice(2);
if (!titolo || !sbagliato || !corretto) {
  console.error('\n  Servono tre testi: titolo, cosa era sbagliato, qual è la correzione.\n');
  process.exit(1);
}
const id = await aggiungiCorrezione({ titolo, sbagliato, corretto });
console.log(`\n  Registrata: ${id}`);
console.log('  Verrà notificata al prossimo bollettino, una volta sola.\n');
