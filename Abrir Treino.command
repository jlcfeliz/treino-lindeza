#!/bin/bash
cd "$(dirname "$0")"

PORT=8765
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "SEU-IP")

# Mata servidor antigo nesta porta, se existir
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null

python3 -m http.server "$PORT" --bind 0.0.0.0 >/tmp/treino-lindeza-server.log 2>&1 &
sleep 1

URL="http://$IP:$PORT/index.html"
open "$URL"

osascript <<EOF
display dialog "Site ligado!

No iPhone (mesma Wi‑Fi do Mac), abra o Safari e digite:

$URL

Depois: Compartilhar → Adicionar à Tela de Início

Deixe esta janela/terminal aberta enquanto usar." buttons {"OK"} default button "OK" with title "Treino da Lindeza"
EOF

echo ""
echo "Treino da Lindeza está no ar."
echo "No Mac:     http://127.0.0.1:$PORT/index.html"
echo "No iPhone:  $URL"
echo ""
echo "Deixe esta janela aberta. Para fechar o site, feche esta janela ou pressione Ctrl+C."
echo ""

# Mantém o script “vivo” mostrando o log
tail -f /tmp/treino-lindeza-server.log
