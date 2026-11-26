#!/bin/bash
# Installa (o aggiorna) il lavoro quotidiano di Borsa sul Mac.
#
# Lo script non può restare sulla Scrivania: macOS impedisce ai programmi
# avviati automaticamente di leggere lì dentro senza un permesso esplicito, e
# partirebbero con "Operation not permitted". Quindi qui se ne installa una
# copia nella Libreria, dove la lettura è sempre consentita, insieme a un clone
# del progetto su cui l'agente lavora senza toccare la tua cartella.

set -euo pipefail
cd "$(dirname "$0")"

ETICHETTA="com.andrea.borsa"
VECCHIA="com.andrea.borsa.riserva"
BASE="$HOME/Library/Application Support/Borsa"
PLIST="$HOME/Library/LaunchAgents/$ETICHETTA.plist"
SEGRETI="$BASE/segreti.env"
LOG="$HOME/Library/Logs/borsa.log"
REPO="andreamario04040-ship-it/bollettino-borse"

mkdir -p "$BASE" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp borsa-mac.sh "$BASE/borsa-mac.sh"
chmod +x "$BASE/borsa-mac.sh"

echo "▸ Controlli"
for p in gh node npm git; do
  command -v "$p" >/dev/null && echo "  ✓ $p" || { echo "  ✗ $p non è installato: serve."; exit 1; }
done
command -v claude >/dev/null && echo "  ✓ claude" || echo "  ⚠ claude non è installato (npm i -g @anthropic-ai/claude-code): senza di lui niente agente."

# ── le chiavi locali ──────────────────────────────────────────────────────────
# Il lavoro parte da solo, quando nessuno è davanti allo schermo: non può
# fermarsi a chiedere il portachiavi né aprire un browser. Quindi i due gettoni
# che gli servono stanno in un file leggibile solo da te.

echo
echo "▸ Chiavi locali ($SEGRETI)"
touch "$SEGRETI"; chmod 600 "$SEGRETI"
scrivi_chiave() {   # scrivi_chiave NOME VALORE
  local nome="$1" valore="$2" tmp
  tmp=$(mktemp)
  grep -v "^$nome=" "$SEGRETI" > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$nome" "$valore" >> "$tmp"
  mv "$tmp" "$SEGRETI"; chmod 600 "$SEGRETI"
}

if gh auth token >/dev/null 2>&1; then
  scrivi_chiave GH_TOKEN "$(gh auth token)"
  echo "  ✓ GH_TOKEN preso da gh (serve a caricare il bollettino senza aprire il portachiavi)"
else
  echo "  ✗ gh non è collegato a GitHub: esegui 'gh auth login' e rilancia."
  exit 1
fi

if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' "$SEGRETI" 2>/dev/null; then
  echo "  ✓ CLAUDE_CODE_OAUTH_TOKEN già presente"
else
  echo
  echo "  L'agente ha bisogno di un gettone del tuo abbonamento Claude."
  echo "  In un'altra finestra del Terminale esegui:"
  echo
  echo "      claude setup-token"
  echo
  echo "  Si apre il browser, accedi col tuo account, e ti stampa un gettone."
  # Serve un terminale vero per incollare. Dove non c'è — perché lo script è
  # stato lanciato da qualcos'altro — `read` fallisce subito, e lo stesso
  # fallimento con set -e fermerebbe l'installazione a metà: meglio dirlo.
  GETTONE=""
  if [ -t 0 ]; then
    read -r -p "  Incollalo qui (o premi Invio per saltare): " GETTONE || true
  else
    echo "  (qui non c'è un terminale interattivo: la richiesta del gettone la salto)"
  fi
  if [ -n "${GETTONE:-}" ]; then
    scrivi_chiave CLAUDE_CODE_OAUTH_TOKEN "$GETTONE"
    echo "  ✓ gettone salvato"
  else
    echo "  ⚠ saltato: per ora le schede delle aziende resteranno all'estratto."
    echo "    Quando vuoi, rilancia questo script e incollalo."
  fi
fi

# ── il clone su cui lavora l'agente ───────────────────────────────────────────
echo
echo "▸ Copia di lavoro"
if [ -d "$BASE/bollettino-borse/.git" ]; then
  echo "  ✓ già presente in $BASE/bollettino-borse"
else
  echo "  la scarico (una volta sola)…"
  git clone --quiet "https://github.com/$REPO.git" "$BASE/bollettino-borse"
  ( cd "$BASE/bollettino-borse" && npm ci --omit=dev --silent )
  echo "  ✓ pronta"
fi

# ── gli appuntamenti ──────────────────────────────────────────────────────────
# RunAtLoad fa partire il controllo all'accensione del Mac e a ogni accesso.
# Gli orari fitti del mattino servono al risveglio dal sonno: launchd recupera
# gli appuntamenti mancati appena il Mac si sveglia, quindi al massimo passa un
# quarto d'ora. Lo script esce in un attimo quando non c'è niente da fare.

intervalli=""
aggiungi() { intervalli="$intervalli    <dict><key>Hour</key><integer>$1</integer><key>Minute</key><integer>$2</integer></dict>
"; }
for h in 7 8 9 10 11; do for m in 0 15 30 45; do aggiungi $h $m; done; done
aggiungi 12 0; aggiungi 12 15
for hm in "17 30" "18 0" "18 15" "18 45" "19 15" "20 0" "21 0"; do aggiungi ${hm% *} ${hm#* }; done

cat > "$PLIST" <<PLISTFINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETICHETTA</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BASE/borsa-mac.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StartCalendarInterval</key>
  <array>
$intervalli  </array>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTFINE

plutil -lint "$PLIST" >/dev/null

# Il vecchio appuntamento, che chiedeva tutto a GitHub, non serve più.
if launchctl print "gui/$(id -u)/$VECCHIA" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/$VECCHIA" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$VECCHIA.plist"
  echo
  echo "▸ Rimosso il vecchio appuntamento ($VECCHIA)"
fi

launchctl bootout "gui/$(id -u)/$ETICHETTA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "▸ Fatto."
echo "  All'accensione e al risveglio del Mac, dalle 6 alle 12, l'agente scrive il"
echo "  bollettino usando il tuo abbonamento, e la notifica arriva appena ha finito."
echo "  Da mezzogiorno in poi, se non è ancora uscito, lo pubblica GitHub senza agente."
echo "  La sera, dalle 17:30, l'agente riprova."
echo
echo "  Copia di lavoro:  $BASE/bollettino-borse"
echo "  Chiavi:           $SEGRETI"
echo "  Diario:           $LOG"
echo
echo "  Per provarlo subito:  launchctl kickstart -k gui/$(id -u)/$ETICHETTA"
echo "  Per vedere il diario: tail -f '$LOG'"
echo "  Per toglierlo:        launchctl bootout gui/$(id -u)/$ETICHETTA && rm '$PLIST'"
