#!/bin/bash
# Lancio di riserva del bollettino.
#
# GitHub non ha mai fatto partire le esecuzioni programmate di questo progetto.
# Questo script, chiamato dal Mac alle 9:00 e alle 18:15, lancia il bollettino
# lui stesso. Non rischia doppioni: passa "riserva", e con quella il motore
# rispetta la finestra oraria e salta il bollettino se è già stato pubblicato.

set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="andreamario04040-ship-it/bollettino-borse"
LOG="$HOME/Library/Logs/borsa-riserva.log"
nota() { echo "$(date '+%d/%m %H:%M')  $*" >> "$LOG"; }

# Il log non deve crescere all'infinito.
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 500 ] && tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

ora=$(date '+%-H')
tipo=$([ "$ora" -lt 13 ] && echo mattina || echo sera)

if ! command -v gh >/dev/null; then nota "gh non trovato: non posso lanciare niente."; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then nota "gh non è collegato a GitHub: salto."; exit 1; fi

# Se GitHub ha già fatto il suo, non serve insistere: glielo chiedo.
oggi=$(date '+%Y-%m-%d')
if gh api "repos/$REPO/contents/docs/data/storico/$oggi-$tipo.json" >/dev/null 2>&1; then
  nota "bollettino $tipo di oggi già pubblicato: non lancio."
  exit 0
fi

if gh workflow run bollettino.yml --repo "$REPO" -f modo="bollettino $tipo" -f riserva=true >/dev/null 2>&1; then
  nota "lanciato il bollettino $tipo."
else
  nota "lancio del bollettino $tipo fallito."
  exit 1
fi
