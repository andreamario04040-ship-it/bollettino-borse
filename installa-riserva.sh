#!/bin/bash
# Installa (o aggiorna) il lancio di riserva sul Mac.
#
# Lo script non può restare sulla Scrivania: macOS impedisce agli agenti di
# sistema di leggere lì dentro senza un permesso esplicito, e il lancio
# fallirebbe con "Operation not permitted". Quindi se ne installa una copia
# dentro la Libreria, dove l'utente può sempre leggere.

set -euo pipefail
cd "$(dirname "$0")"

DEST="$HOME/Library/Application Support/Borsa"
ETICHETTA="com.andrea.borsa.riserva"
PLIST="$HOME/Library/LaunchAgents/$ETICHETTA.plist"
LOG="$HOME/Library/Logs/borsa-riserva.log"

mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp riserva-mac.sh "$DEST/riserva-mac.sh"
chmod +x "$DEST/riserva-mac.sh"

cat > "$PLIST" <<PLISTFINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETICHETTA</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEST/riserva-mac.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>15</integer></dict>
  </array>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTFINE

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$ETICHETTA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installato. Parte alle 9:00 e alle 18:15, e se il Mac dorme appena si sveglia."
echo "Copia eseguita: $DEST/riserva-mac.sh"
echo "Diario:         $LOG"
echo
echo "Per provarlo subito:  launchctl kickstart gui/$(id -u)/$ETICHETTA"
echo "Per toglierlo:        launchctl bootout gui/$(id -u)/$ETICHETTA && rm '$PLIST'"
