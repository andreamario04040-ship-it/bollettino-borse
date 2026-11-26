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
e GitHub Actions è un data center.

Il *perché* arriva da dieci testate, e la regola è una sola: **l'articolo si deve poter leggere
per intero senza abbonamento.** Un titolo che entra nel bollettino e poi non si può aprire è
peggio di un titolo che non entra, perché la scheda deve ammettere «l'articolo non si è potuto
leggere» e chi legge non sa se la notizia fosse povera o il giornale chiuso.

| Fonte | Lingua | Peso |
|---|---|---|
| Il Sole 24 Ore | it | 3 |
| ANSA Economia | it | 2 |
| Il Post Economia | it | 2 |
| Repubblica Economia | it | 1 |
| CNBC Markets · Technology · Finance | en | 2 |
| BBC Business | en | 2 |
| BCE *(ufficiale)* | en | 3 |
| Federal Reserve *(ufficiale)* | en | 3 |

Non è una lista scelta a occhio: è misurata, e si rimisura quando si vuole.

```bash
npm run fonti
```

Scarica quattro articoli per fonte e dice quanti si sono aperti davvero. Il 26/11/2026 ne sono
uscite tre su otto con **zero articoli leggibili su quattro** — Financial Times, Investing.com e
MarketWatch — e portavano 29 titoli su 105. Scartate alla prova anche Corriere Economia (muro),
The Guardian e AP (403), Reuters, Yahoo Finance, Teleborsa, Sky TG24 e Rai News (feed morti).
Con le dieci di adesso: 40 articoli su 40.

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

### Chi fa il lavoro, e dove

Le partenze programmate di GitHub sono "al meglio delle possibilità": vengono ritardate quando il
servizio è carico e a volte saltate del tutto. Su questo progetto, finora, non ne è partita
**nessuna**. E comunque in cloud l'agente che legge gli articoli dovrebbe pagare la chiave API.

Quindi il turno di punta lo fa il Mac, dove l'abbonamento Claude c'è già:

```bash
./installa-mac.sh
```

| Quando | Chi lavora | Le schede delle aziende |
|---|---|---|
| Accensione o risveglio del Mac, dalle 6 alle 12 | l'agente, qui in casa | riassunto scritto leggendo gli articoli |
| Da mezzogiorno alle 13, se non è ancora uscito | GitHub | estratto: le frasi vere degli articoli |
| Dalle 17:30 alle 21:30 | l'agente, se il Mac è acceso | riassunto, altrimenti estratto |

L'installazione mette tre cose a posto: una copia dello script in `~/Library/Application Support/Borsa/`
(macOS impedisce ai programmi avviati automaticamente di leggere dalla Scrivania, e da lì fallirebbero
con "Operation not permitted"), un clone del progetto nella stessa cartella — l'agente lavora là, non
nella tua — e un file `segreti.env` leggibile solo da te con i due gettoni che servono a lavorare
senza nessuno davanti allo schermo: `GH_TOKEN` (preso da `gh`) e `CLAUDE_CODE_OAUTH_TOKEN`.

Il secondo lo generi tu, una volta:

```bash
claude setup-token
```

Si apre il browser, accedi col tuo account Claude, e ti stampa un gettone. **Selezionalo con il
mouse e premi Cmd+C**, anche se va a capo in mezzo: l'installatore se lo prende dagli appunti e
rimette assieme le due metà. Copiarlo a mano dentro una richiesta non funzionerebbe, perché il
ritorno a capo chiuderebbe la riga a metà gettone.

Per aggiungerlo dopo, senza rifare tutto il resto:

```bash
./installa-mac.sh --solo-chiavi
```

Appena salvato viene provato con una domanda da niente: se Claude lo rifiuta — una copia
incompleta, per esempio — lo script lo **toglie** invece di tenerlo, perché un gettone sbagliato
che resta nel file è peggio di nessun gettone: l'agente fallirebbe ogni mattina in silenzio.

Senza gettone l'agente non parte e le schede restano all'estratto: l'app funziona comunque.

**Perché la notifica la manda GitHub.** Il Mac scrive il bollettino e lo carica, ma le iscrizioni
dei dispositivi stanno nei segreti del repository, e i segreti non si possono rileggere da casa.
Così appena l'agente ha finito il Mac chiede a GitHub di fare partire solo l'invio
(`modo: solo notifica`): ci passa circa un minuto.

**Non può produrre doppioni**, e per tre motivi indipendenti: prima di muoversi chiede a GitHub se
il bollettino di oggi esiste già; il motore rispetta finestra oraria e archivio quando riceve
`DA_CALENDARIO`; e lo stesso bollettino non viene annunciato due volte, perché `notificato.json`
ricorda qual era l'ultimo.

Il diario è in `~/Library/Logs/borsa.log`:

```bash
tail -f ~/Library/Logs/borsa.log
```

Per provarlo subito, per vederlo e per toglierlo:

```bash
launchctl kickstart -k gui/$(id -u)/com.andrea.borsa
```

```bash
launchctl print gui/$(id -u)/com.andrea.borsa | head -20
```

```bash
launchctl bootout gui/$(id -u)/com.andrea.borsa && rm ~/Library/LaunchAgents/com.andrea.borsa.plist
```

Dopo aver modificato `borsa-mac.sh` nel progetto, rilancia `./installa-mac.sh` per aggiornare la copia.

Resta un limite che nessuna riga di codice può togliere: **se il Mac è spento e GitHub non fa
partire niente, quel giorno il bollettino non esce.** Lo vedi dal diario, che in quel caso non ha
nessuna riga per quella mattina.

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

## Chi sceglie cosa conta oggi

Prima la scelta era meccanica: un dizionario di quaranta aziende, un'espressione
regolare per ciascuna, un punteggio per quante volte il nome compariva nei titoli,
massimo due per settore. Prevedibile in tutti i sensi — tornavano sempre gli stessi
nomi, e bastava una citazione di passaggio («Intesa saliva del 2,78%» dentro un
riepilogo di Piazza Affari) per guadagnarsi una scheda in cui non c'era niente da dire.

Adesso ogni bollettino fa **due giri**.

**Primo giro: decidere.** L'agente legge tutti i titoli del giorno, numerati, e i dati
di mercato. Sceglie da tre a sei aziende e da due a quattro indici, in ordine di
importanza, e per ognuno scrive **una riga che dice il fatto di oggi** — quella che
nell'app compare come «perché oggi». Il prompt dice soprattutto cosa *non* basta per
entrare: essere famosa, essere nominata di passaggio in un riepilogo, essere salita o
scesa senza che nessuno spieghi perché, esserci anche ieri.

**Secondo giro: raccontare.** Solo per le aziende scelte si scarica il testo degli
articoli, e l'agente scrive la scheda.

Il dizionario in `engine/aziende.mjs` resta, ma cambia mestiere: non è più il cancello
che decide chi entra, è l'anagrafica di chi è entrato — ticker, settore, logo. Un'azienda
che non conosce entra comunque:

- **il prezzo** solo se uno dei codici di borsa che l'agente propone risponde col nome
  giusto. Un prezzo sbagliato è molto peggio di nessun prezzo, quindi il nome che
  restituisce la borsa viene confrontato con quello dell'azienda, e se non combacia si
  scrive «quotazione non disponibile».
- **il logo** scaricato al volo dal sito che l'agente indica, ma solo se quel sito porta
  il nome dell'azienda: `sanofi.com` sì, `db.com` per Deutsche Bank no. Altrimenti resta
  l'iniziale. Un logo sbagliato accanto al nome giusto è un errore che si vede.

Anche la riga «perché oggi» passa dal verificatore, con una soglia più severa del resto:
è una frase breve, quindi **due** cifre che non stanno né nei titoli né nei dati bloccano
la pubblicazione. È la ragione per cui una scheda esiste: se è inventata quella, è
inventata la scheda intera.

Se l'agente non c'è — niente gettone, niente chiave — si torna al conteggio delle
citazioni. Meno sveglio, sempre disponibile.

## Cosa c'è scritto nelle schede delle aziende

Tre livelli, dal migliore al sempre disponibile. Il primo che riesce vince.

| Livello | Come | Costo |
|---|---|---|
| **Riassunto scritto** | Un modello legge gli articoli e racconta cosa è successo | **zero** col tuo abbonamento sul Mac; a consumo con `ANTHROPIC_API_KEY` |
| **Estratto dagli articoli** | Si scelgono le frasi dell'articolo che parlano davvero dell'azienda | **zero** |
| **Frase di base** | Nessun articolo leggibile: la scheda lo dichiara | zero |

L'estratto non scrive niente di nuovo: **sceglie**. Dalle frasi dell'articolo tiene quelle
che nominano l'azienda e portano un fatto — un verbo d'azione, una cifra — e scarta il
contorno. Non può inventare, perché ogni parola viene dall'articolo, che resta citato con
il suo nome e il suo link sotto la scheda.

Due regole imparate provandolo: una frase che **non nomina** l'azienda non la racconta
(senza questa regola il riepilogo di Piazza Affari finiva nella scheda di Stellantis
parlando dello spread dei BTP), e oltre i 420 caratteri si smette, perché tre frasi di
linguaggio legale non sono un riassunto.

## L'agente che legge gli articoli

Le schede delle aziende non contengono più frasi scelte da espressioni regolari. A ogni
bollettino un agente scarica il **testo vero** degli articoli del giorno su quelle aziende
e scrive cosa è successo, con i fatti concreti: cifre, decisioni, prodotti, conti, mosse
delle autorità.

Due motori, provati in quest'ordine.

**1. L'abbonamento Claude, sul Mac.** Usa il programma `claude` da riga di comando, che non è
l'applicazione con la finestra: non deve essere aperta, non deve girare in background. Viene
lanciato, lavora, finisce. Non costa niente in più perché consuma l'abbonamento già pagato, ma
gira solo in casa e solo se il Mac è acceso. Il modello si sceglie in `config.json`, voce
`agente.modello_cli`; il predefinito è `sonnet`, che per riassumere testo già fornito basta e
lascia margine nella giornata.

**2. La chiave API, su GitHub.** È l'unica strada in cloud, e si paga a consumo:

```bash
gh secret set ANTHROPIC_API_KEY
```

Il modello è in `config.json`, voce `agente.modello`.

| Modello | Costo indicativo al mese (due bollettini al giorno) |
|---|---|
| `claude-opus-5-5` | circa 8 $ |
| `claude-haiku-5-5` | circa 0,20 $ |

Le stime valgono per una decina di articoli a giro; nelle giornate fitte salgono un po'.

**Senza nessuno dei due l'app funziona lo stesso**: le schede tornano all'estratto — le frasi vere
degli articoli — e sotto ognuna c'è scritto da dove vengono, così non si scambia un riempitivo per
un riassunto.

L'agente non vede altro che il materiale della giornata: gli strumenti sono disattivati
(`--disallowed-tools`), gira fuori dalla cartella del progetto e non ha accesso a internet.
Non può andarsi a cercare niente, e quindi non può raccontare niente che non abbia letto oggi.

### Come ci si difende dalle invenzioni

Un modello che riassume può inventare una cifra, ed è l'errore peggiore in un bollettino
finanziario. Tre difese, in ordine:

1. **Nel prompt**: scrivi solo fatti presenti nel materiale, copia i numeri esatti, e se il
   materiale non basta dillo apertamente invece di riempire.
2. **Nella verifica**: ogni cifra del riassunto viene cercata nel testo degli articoli che
   l'agente ha letto. Una cifra che non c'è diventa un avviso; tre cifre **bloccano la
   pubblicazione**.
3. **Nell'app**: sotto ogni scheda restano i titoli con il link, per risalire sempre
   all'origine.

Quando l'agente stesso dichiara che il materiale era scarso, la scheda lo scrive.

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
