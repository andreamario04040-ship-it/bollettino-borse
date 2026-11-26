#!/bin/bash
# Borsa — il lavoro quotidiano fatto dal Mac.
#
# Perché esiste: GitHub non ha mai fatto partire le esecuzioni programmate di
# questo progetto, e soprattutto in cloud l'agente che riassume gli articoli
# dovrebbe pagare la chiave API. Sul Mac no: c'è già l'abbonamento Claude.
#
# Quindi il Mac fa il bollettino in casa e lo carica; poi chiede a GitHub di
# fare partire solo l'invio della notifica, perché le iscrizioni dei dispositivi
# stanno nei segreti del repository e da qui non si possono leggere.
#
# Quando parte (lo decide il calendario di launchd, vedi installa-mac.sh):
#   • all'accensione e al risveglio del Mac, e ogni quarto d'ora dalle 7 alle 12:15
#   • la sera, dalle 17:30 alle 21
# e ogni volta è questo script a decidere se c'è qualcosa da fare.
#
# Le tre strade, dalla migliore alla sempre disponibile:
#   1. prima di mezzogiorno, Mac acceso  → l'agente legge gli articoli e scrive
#   2. da mezzogiorno in poi             → GitHub pubblica senza agente
#   3. niente di tutto questo            → non si pubblica niente, e si vede dal diario

set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="andreamario04040-ship-it/bollettino-borse"
BASE="$HOME/Library/Application Support/Borsa"
CLONE="$BASE/bollettino-borse"
SEGRETI="$BASE/segreti.env"
LOG="$HOME/Library/Logs/borsa.log"
LOCK="$BASE/in-corso.lock"

mkdir -p "$BASE" "$HOME/Library/Logs"
nota() { printf '%s  %s\n' "$(date '+%d/%m %H:%M')" "$*" >> "$LOG"; }

# Il diario non deve crescere all'infinito.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 1000 ]; then
  tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# Le chiavi locali: GH_TOKEN per parlare con GitHub senza chiedere il portachiavi,
# CLAUDE_CODE_OAUTH_TOKEN per far lavorare l'agente senza una finestra aperta.
if [ -f "$SEGRETI" ]; then set -a; . "$SEGRETI"; set +a; fi

# ───────────────────────────  c'è qualcosa da fare?  ──────────────────────────

# Le borse sono chiuse nel fine settimana.
[ "$(date '+%u')" -ge 6 ] && exit 0

MIN=$(( 10#$(date '+%H') * 60 + 10#$(date '+%M') ))
MATTINA_DA=360      # 06:00
SENZA_AGENTE=720    # 12:00 — da qui in poi si rinuncia all'agente
MATTINA_A=780       # 13:00
SERA_DA=1050        # 17:30
SERA_A=1290         # 21:30

if   [ "$MIN" -ge "$MATTINA_DA" ] && [ "$MIN" -le "$MATTINA_A" ]; then tipo=mattina
elif [ "$MIN" -ge "$SERA_DA" ]    && [ "$MIN" -le "$SERA_A" ];    then tipo=sera
else exit 0   # fuori orario: niente da dire, nemmeno nel diario
fi

usa_agente=1
if [ "$tipo" = mattina ] && [ "$MIN" -ge "$SENZA_AGENTE" ]; then usa_agente=0; fi

# Due partenze ravvicinate non devono lavorare insieme sullo stesso clone.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +40 2>/dev/null)" ]; then
    nota "trovato un blocco vecchio di oltre 40 minuti: lo rimuovo."
    rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0   # un'altra esecuzione è in corso
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

# All'accensione la rete non è ancora pronta: vale la pena aspettarla.
rete_pronta() {
  for _ in $(seq 1 36); do
    curl -sf -m 4 -o /dev/null https://api.github.com/ && return 0
    sleep 5
  done
  return 1
}
if ! rete_pronta; then nota "nessuna rete dopo tre minuti: riprovo al prossimo giro."; exit 1; fi

command -v gh >/dev/null || { nota "gh non è installato: non posso fare niente."; exit 1; }
if ! gh auth status >/dev/null 2>&1; then nota "gh non è collegato a GitHub: salto."; exit 1; fi

# Se il bollettino di oggi c'è già, qualunque strada l'abbia fatto, si finisce qui.
oggi=$(date '+%Y-%m-%d')
if gh api "repos/$REPO/contents/docs/data/storico/$oggi-$tipo.json" >/dev/null 2>&1; then
  exit 0
fi

# ──────────────────────  strada 1: l'agente, qui sul Mac  ─────────────────────

prepara_clone() {
  if [ ! -d "$CLONE/.git" ]; then
    nota "prima copia del progetto in $CLONE"
    rm -rf "$CLONE"
    git clone --quiet "https://github.com/$REPO.git" "$CLONE" || return 1
  fi
  # Le credenziali le dà gh, così launchd non deve aprire il portachiavi.
  git -C "$CLONE" config credential.helper '!gh auth git-credential'
  git -C "$CLONE" config user.name  "Borsa"
  git -C "$CLONE" config user.email "321818012+andreamario04040-ship-it@users.noreply.github.com"

  # Questo clone è del robot: quello che c'è di locale non conta mai.
  git -C "$CLONE" fetch --quiet origin main || return 1
  git -C "$CLONE" reset --hard --quiet origin/main || return 1
  git -C "$CLONE" clean -qfd docs/data || true

  if [ ! -d "$CLONE/node_modules" ] || [ "$CLONE/package-lock.json" -nt "$CLONE/node_modules" ]; then
    nota "installo le dipendenze"
    ( cd "$CLONE" && npm ci --omit=dev --silent ) || return 1
  fi
}

con_agente() {
  command -v node   >/dev/null || { nota "node non è installato."; return 1; }
  command -v claude >/dev/null || { nota "il programma claude non è installato: niente agente."; return 1; }
  prepara_clone || { nota "non riesco a preparare il clone."; return 1; }

  nota "l'agente si mette a lavorare sul bollettino $tipo."
  # caffeinate tiene sveglio il Mac finché l'agente non ha finito.
  ( cd "$CLONE" && AGENTE_CLI=1 DA_CALENDARIO=1 caffeinate -i \
      node engine/esegui.mjs bollettino "$tipo" >> "$LOG" 2>&1 ) || return 1

  [ -f "$CLONE/docs/data/storico/$oggi-$tipo.json" ] || { nota "l'agente non ha prodotto il bollettino."; return 1; }

  if [ -z "$( git -C "$CLONE" status --porcelain docs/data docs/loghi )" ]; then
    nota "niente di nuovo da caricare."; return 1
  fi
  # docs/loghi perché l'agente sceglie aziende nuove, e i loro loghi vengono
  # scaricati durante l'esecuzione: senza questa riga resterebbero sul Mac.
  git -C "$CLONE" add docs/data docs/loghi || return 1
  git -C "$CLONE" commit --quiet -m "Bollettino del $(date '+%d/%m/%Y alle %H:%M'), scritto dall'agente sul Mac" || return 1
  git -C "$CLONE" push --quiet origin main || { nota "il caricamento su GitHub è fallito."; return 1; }

  # Il bollettino è online. L'invio lo fa GitHub, che ha le iscrizioni.
  if gh workflow run bollettino.yml --repo "$REPO" -f modo='solo notifica' >/dev/null 2>&1; then
    nota "bollettino $tipo pubblicato dall'agente; notifica chiesta a GitHub."
  else
    nota "bollettino $tipo pubblicato dall'agente, ma la notifica non è partita."
  fi
}

if [ "$usa_agente" = 1 ] && con_agente; then exit 0; fi
[ "$usa_agente" = 1 ] && nota "l'agente non ce l'ha fatta: passo a GitHub, senza agente."

# ─────────────────  strada 2: GitHub pubblica senza agente  ───────────────────

# Per il mattino si chiede la finestra "mezzogiorno": è lo stesso bollettino,
# ma GitHub lo accetta solo dalle 11:55, cioè quando l'agente ha perso il suo turno.
chiesto="bollettino $tipo"
[ "$tipo" = mattina ] && [ "$usa_agente" = 0 ] && chiesto="bollettino mezzogiorno"

if gh workflow run bollettino.yml --repo "$REPO" -f modo="$chiesto" -f riserva=true >/dev/null 2>&1; then
  nota "chiesto a GitHub: $chiesto, senza agente."
else
  nota "non riesco nemmeno a chiedere a GitHub: $chiesto."
  exit 1
fi
