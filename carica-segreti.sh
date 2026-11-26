#!/bin/bash
# Carica le chiavi delle notifiche nei segreti del repository su GitHub.
# Le legge da CHIAVI-SEGRETE.txt, che resta sul Mac e non viene mai caricato.
set -euo pipefail
cd "$(dirname "$0")"

F=CHIAVI-SEGRETE.txt
[ -f "$F" ] || { echo "Non trovo $F. Rigenera le chiavi con: npm run chiavi"; exit 1; }

leggi() { grep -A1 "^$1" "$F" | tail -1 | tr -d ' \t\r'; }

PUB=$(leggi VAPID_PUBBLICA)
PRIV=$(leggi VAPID_PRIVATA)
[ -n "$PUB" ] && [ -n "$PRIV" ] || { echo "Le chiavi dentro $F non sembrano complete."; exit 1; }

CONTATTO="${1:-}"
if [ -z "$CONTATTO" ]; then
  read -r -p "Un tuo indirizzo email (lo standard delle notifiche lo richiede): " EMAIL
  CONTATTO="mailto:${EMAIL}"
fi

printf '%s' "$PUB"      | gh secret set VAPID_PUBBLICA
printf '%s' "$PRIV"     | gh secret set VAPID_PRIVATA
printf '%s' "$CONTATTO" | gh secret set VAPID_CONTATTO

echo
echo "Fatto. Segreti presenti ora:"
gh secret list
echo
echo "Manca solo ISCRIZIONE_PUSH: lo ottieni dall'app sull'iPhone,"
echo "dopo averla aggiunta alla schermata Home e attivato le notifiche."
