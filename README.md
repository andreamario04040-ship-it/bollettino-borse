# Borsa

Un'app per iPhone che ogni giorno ti racconta, in parole semplici, cosa è successo sulle borse
mondiali — e che puoi aprire per vedere i numeri degli indici che contano.

- **9:00** — bollettino del mattino: com'è andata l'Asia stanotte e Wall Street ieri sera.
- **18:15** — bollettino della sera: come ha chiuso Milano e cosa sta facendo New York.
- **Durante il giorno** — un avviso solo se succede qualcosa di grosso. Al massimo due al giorno,
  mai a meno di tre ore l'uno dall'altro, mai vicino ai bollettini fissi.

Non costa niente: il motore gira su GitHub Actions, l'app è una pagina pubblicata su GitHub Pages.

---

Il nome del repository e l'indirizzo restano `bollettino-borse`: cambiarli spezzerebbe
l'app già installata sulla schermata Home e l'iscrizione alle notifiche.

## Com'è fatto

| Cartella | Cosa c'è dentro |
|---|---|
| `engine/` | Il motore: scarica dati e notizie, scrive il report, manda le notifiche |
| `docs/` | L'app vera e propria, quella che GitHub Pages pubblica |
| `docs/data/` | I dati aggiornati, riscritti a ogni esecuzione |
| `docs/data/serie.json` | L'archivio delle chiusure, da cui nascono grafici e variazioni lunghe |
| `config.json` | Indici, fonti, orari e soglie degli avvisi: si cambia tutto da qui |
| `.github/workflows/` | Gli appuntamenti automatici |

**Le fonti.** Le quotazioni arrivano da **Yahoo Finance** quando il motore gira da casa, e da
**CNBC** quando gira su GitHub — perché Yahoo rifiuta le richieste che arrivano dai data center,
e GitHub Actions è un data center. Il *perché* arriva da Il Sole 24 Ore, Financial Times, CNBC,
ANSA Economia, MarketWatch, Investing.com e dai comunicati ufficiali di BCE e Federal Reserve.
Sono state tutte verificate una per una.

**Lo storico.** CNBC dà il prezzo di adesso ma non il passato, quindi le variazioni su settimana,
mese e anno e i grafici vengono da `docs/data/serie.json`, un archivio di chiusure conservato nel
repository. Si semina una volta da casa con `npm run storico` (un anno di dati da Yahoo) e poi si
allunga da solo di un punto al giorno a ogni bollettino.

---

## Installazione, una volta sola

### 1. Metti il progetto su GitHub

Il repository dev'essere **pubblico**: GitHub Pages gratuito funziona solo così, e in cambio
le esecuzioni automatiche diventano illimitate. Nel repository non finisce niente di personale —
le chiavi stanno nei segreti, che restano privati anche in un repository pubblico.

```bash
git init -b main
git add .
git commit -m "Borsa"
gh repo create bollettino-borse --public --source . --push
```

### 2. Accendi GitHub Pages

Nel repository: **Settings → Pages**. Alla voce *Source* scegli **Deploy from a branch**,
poi branch `main` e cartella **`/docs`**. Dopo un minuto l'indirizzo è
`https://TUONOME.github.io/bollettino-borse/`.

### 3. Metti le tre chiavi nei segreti

Un comando solo, dalla cartella del progetto:

```bash
./carica-segreti.sh
```

Legge le chiavi da `CHIAVI-SEGRETE.txt` (che resta sul tuo Mac e non viene mai caricato),
chiede il tuo indirizzo email e carica i tre segreti su GitHub.

A mano si fa da **Settings → Secrets and variables → Actions → New repository secret**:

| Nome del segreto | Cosa ci va |
|---|---|
| `VAPID_PUBBLICA` | La chiave pubblica |
| `VAPID_PRIVATA` | La chiave privata — non condividerla |
| `VAPID_CONTATTO` | `mailto:` seguito da un tuo indirizzo (lo standard lo richiede) |

### 4. Aggiungi l'app alla schermata Home dell'iPhone

Apri l'indirizzo con **Safari** (non Chrome: su iPhone non funzionerebbe), tocca **Condividi**,
poi **Aggiungi alla schermata Home**. Questo passaggio non è facoltativo: senza l'icona, Apple
non consegna nessuna notifica.

### 5. Attiva le notifiche e copia il codice

Apri l'app **dall'icona**, tocca *Attiva le notifiche*, concedi il permesso. Comparirà un codice:
copialo e crea l'ultimo segreto su GitHub, chiamato **`ISCRIZIONE_PUSH`**. Dal Mac, con il codice
negli appunti, basta:

```bash
pbpaste | gh secret set ISCRIZIONE_PUSH
```

> Se un domani cancelli l'icona e la riaggiungi, il codice cambia: ripeti questo passaggio.
> Per ricevere le notifiche anche su un secondo dispositivo, metti i due codici in un elenco:
> `[{...}, {...}]`.

### 6. Prova subito

**Actions → Bollettino Borse → Run workflow**, scegli `bollettino mattina` e lancia.
Entro un minuto la notifica arriva sull'iPhone.

---

## Gli appuntamenti

| Quando | Cosa fa |
|---|---|
| 9:00, da lunedì a venerdì | Bollettino del mattino |
| 18:15, da lunedì a venerdì | Bollettino della sera |
| Ogni ora, dalle 8:20 alle 21:20 | Controlla, e manda solo se serve |

Ogni appuntamento ha una **finestra larga** (mattina 08:00–12:30, sera 17:30–21:30), non un orario
esatto: GitHub fa partire le esecuzioni programmate con ritardi anche di mezz'ora, e un controllo
stretto farebbe saltare il bollettino proprio nei giorni di maggior carico. A evitare il doppione
fra i due appuntamenti pensa il controllo sull'archivio.

GitHub ragiona in UTC e l'Italia cambia ora due volte l'anno: ogni appuntamento parte a due orari
diversi e il programma chiude subito quello sbagliato. Non devi toccare niente quando cambia l'ora.

### Se GitHub non fa partire niente

Le partenze programmate di GitHub sono "al meglio delle possibilità": vengono ritardate quando il
servizio è carico e a volte saltate del tutto. Su questo progetto, finora, non ne è partita
**nessuna**. Per questo c'è una rete di sicurezza sul Mac:

```bash
./installa-riserva.sh
```

Installa un promemoria di sistema che alle 9:00 e alle 18:15 lancia il bollettino al posto di
GitHub. Se il Mac dorme, parte appena si sveglia; se è spento, quel turno salta.

**Non può produrre doppioni**, e per due motivi indipendenti: prima di lanciare chiede a GitHub se
il bollettino di oggi esiste già, e comunque passa l'ingresso `riserva`, che attiva nel motore le
stesse regole delle partenze programmate — finestra oraria e controllo sull'archivio.

Il diario è in `~/Library/Logs/borsa-riserva.log`. Per toglierlo:

```bash
launchctl bootout gui/$(id -u)/com.andrea.borsa.riserva && rm ~/Library/LaunchAgents/com.andrea.borsa.riserva.plist
```

Lo script installato vive in `~/Library/Application Support/Borsa/`, non nella cartella del
progetto: macOS impedisce agli agenti di sistema di leggere dalla Scrivania, e da lì fallirebbe
con "Operation not permitted". Dopo averlo modificato nel progetto, rilancia `./installa-riserva.sh`
per aggiornare la copia.

### Quando scatta un avviso

Serve un movimento **nuovo** che superi una di queste soglie:

| | Soglia |
|---|---|
| Un grande indice azionario | 2% in giornata |
| Indice della paura (VIX) | sopra 30 e in salita del 12%, oppure uno scatto del 20% |
| Petrolio | 4,5% |
| Oro | 3% |
| Bitcoin | 7% |
| Tasso USA a 10 anni | 4% |
| BCE o Federal Reserve | un comunicato ufficiale nelle ultime 2 ore |

E poi devono valere tutte queste regole: non più di due avvisi al giorno, almeno tre ore tra uno
e l'altro, mai lo stesso motivo due volte nella stessa giornata, mai nei 45 minuti attorno a un
bollettino, mai fuori dalla fascia 8:00–22:30. Soprattutto: **restare** oltre la soglia non fa
suonare di nuovo il telefono, solo *arrivarci* lo fa.

Per cambiare le soglie o spegnere gli avvisi, apri `config.json` alla voce `avvisi`.

---

## Quando l'app sbaglia

Nessun controllo automatico può sapere se un giornale ha scritto il vero. Può però
accorgersi se l'app contraddice i propri dati, ed è quello che fa `engine/verifica.mjs`
prima di ogni pubblicazione: controlla che ogni percentuale scritta nelle frasi esista
davvero fra i dati scaricati, che il clima corrisponda all'indice della paura, che la
data sia quella di oggi, che le quotazioni siano plausibili e fresche, e che ogni notizia
citata sia fra quelle lette. **Se qualcosa non torna il bollettino non esce**: meglio
nessun bollettino che uno falso.

```bash
npm run verifica      # controlla il bollettino già pubblicato
```

Quando l'errore sfugge comunque, va detto. Si registra così:

```bash
node engine/nuova-correzione.mjs "Titolo breve" "Cosa avevo sbagliato" "Com'è adesso"
```

Al bollettino successivo parte una notifica dedicata, **«Ho fatto un errore»**, e nella
home compare un banner con le due versioni affiancate. Resta visibile due settimane o
finché non si tocca *Ho capito*. La notifica parte una volta sola, e solo se l'invio
riesce davvero.

Una regola imparata sbagliando: **nell'archivio delle aziende non si scrivono fatti che
invecchiano** — primati, classifiche, se un'azienda è quotata. Quelli si leggono dai dati.
L'app aveva scritto che Anthropic non era quotata perché la frase era stata messa a mano
e non è più stata rivista.

## Spiegazioni e glossario

Ogni indice ha una scheda (`guida` dentro `config.json`): cos'è, come si legge, cosa
vuol dire se sale o se scende, perché conta. Si apre dal punto interrogativo sulle
tessere e dal dettaglio di ogni riga in Mercati.

`docs/glossario.json` contiene una trentina di termini di economia. L'app sottolinea la
**prima** comparsa di ciascuno nei testi — solo la prima, altrimenti la pagina diventa
illeggibile — e toccandola si apre la spiegazione. Per aggiungerne uno basta una voce con
le forme in cui la parola compare e la spiegazione.

## I loghi delle aziende

```bash
npm run loghi         # scarica quelli mancanti
npm run loghi -- --tutti
```

Si scaricano una volta e si servono da `docs/loghi/`, invece di collegarli a ogni
apertura: il servizio che li fornisce limita le richieste, l'app è più veloce, e nessuno
impara quali aziende guardi. Nove aziende non hanno un logo disponibile e mostrano
l'iniziale: l'app funziona lo stesso.

## Modifiche frequenti

**Cambiare orari** → `.github/workflows/bollettino.yml`, le righe `cron` (in UTC),
e `config.json` alla voce `orari`.

**Aggiungere un indice o un titolo** → `config.json`, elenco `strumenti`. Serve il simbolo di
Yahoo Finance (per esempio `ENI.MI` per Eni, `ISP.MI` per Intesa). Il campo `perche` è la frase
che leggi toccando la riga nell'app.

**Aggiungere una fonte** → `config.json`, elenco `feed`. Il `peso` dice quanto conta quella
testata nel decidere il tema del giorno.

**Provare sul Mac** → `npm run locale`, poi `http://localhost:4173`.
I numeri si vedono; le notifiche no, perché servono HTTPS e l'icona sulla Home.

**Controllare le regole anti-spam** → `npm run prova`. Sono quindici casi costruiti a tavolino
(il crollo che deve suonare, quello che non deve suonare perché è già suonato, il contatore che
riparte a mezzanotte, il comunicato della BCE, l'orario notturno) che girano senza rete.

---

## Limiti, detti chiaramente

- **Yahoo blocca i data center.** Da GitHub risponde sempre "troppe richieste": è il motivo per
  cui esiste la seconda fonte. Il motore prova Yahoo, si arrende in fretta e passa a CNBC con
  l'archivio delle chiusure. Se anche CNBC tacesse, l'app tiene gli ultimi valori buoni
  segnandoli con un puntino, e se mancasse più di metà degli strumenti il bollettino non verrebbe
  pubblicato affatto.
- **Lo storico va seminato una volta.** Senza `docs/data/serie.json` l'app mostra il prezzo di
  oggi e la variazione giornaliera, ma non mese e anno, e lo dice apertamente nel dettaglio di
  ogni indice. `npm run storico` da casa risolve.
- **Le notifiche web su iPhone funzionano solo dall'icona sulla Home.** È una regola di Apple.
- **I dati sono in ritardo di qualche minuto** rispetto al mercato: vanno bene per capire, non per
  comprare e vendere al secondo.
- **Non è una consulenza finanziaria.** L'app racconta cosa è successo e perché; non dice mai cosa
  fare con i tuoi soldi.
