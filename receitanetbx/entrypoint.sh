#!/bin/sh
# ReceitanetBX-Serviço no container:
# - tela remota (noVNC na porta 6080, publicada só em 127.0.0.1 do servidor: acesso por túnel SSH) para a configuração inicial,
#   em que o usuário escolhe o certificado e digita a senha no configurador oficial (o programa guarda a senha cifrada);
# - ponte interna 2444 → 127.0.0.1:2443, porque a API do serviço só aceita chamadas da própria máquina (ws.properties);
# - o serviço em primeiro plano assim que a configuração tiver a senha.
set -u
BX=/opt/bx
CONF="$BX/recnetbx-service.properties"
JAVA="$BX/java/bin/java"
JAR="$(ls "$BX"/receitanetbx-service-*.jar | head -1)"

grep -q "[[:space:]]$(hostname)\$" /etc/hosts 2>/dev/null || echo "127.0.0.1 $(hostname)" >> /etc/hosts
mkdir -p /dados/downloads
[ -f "$CONF" ] || cp "$BX/recnetbx-service.properties.modelo" "$CONF"
rm -f "$BX/recnetbx.pid"

export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 >/dev/null 2>&1 &
sleep 1
fluxbox >/dev/null 2>&1 &
x11vnc -display :99 -localhost -forever -shared -nopw -rfbport 5900 -quiet >/dev/null 2>&1 &
websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
socat TCP-LISTEN:2444,fork,reuseaddr TCP:127.0.0.1:2443 &

configurado() { grep -q '^senhaCertificadoDigital=.\+' "$CONF"; }

if ! configurado; then
  # Sem a senha o serviço sobe assim mesmo (a API responde e o InTAX mostra "aguardando configuração").
  (cd "$BX" && exec "$JAVA" -jar "$JAR") &
  PROVISORIO=$!
  while ! configurado; do
    echo "ReceitanetBX: aguardando a configuração inicial (abra a tela remota pelo túnel SSH, porta 6080)."
    (cd "$BX" && "$JAVA" -cp "$JAR" br.gov.serpro.receitanetbx.service.DialogoConfiguracaoServico) || true
    sleep 5
  done
  kill "$PROVISORIO" 2>/dev/null; sleep 5; kill -9 "$PROVISORIO" 2>/dev/null
  rm -f "$BX/recnetbx.pid"
fi

echo "ReceitanetBX: configuração encontrada; iniciando o serviço."
cd "$BX"
exec "$JAVA" -jar "$JAR"
