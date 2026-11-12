#!/bin/sh
# ReceitanetBX-Serviço no container:
# - o InTAX entrega o certificado em /entrada (volume compartilhado com o backend): certificado.pfx e senha. O próprio
#   configurador oficial do programa é aberto na tela virtual e preenchido sozinho (xdotool): caminho, senha e Salvar. É ele
#   que cifra a senha; o arquivo da senha é apagado logo depois;
# - tela remota (noVNC na porta 6080, só em 127.0.0.1 do servidor, por túnel SSH) continua como reserva para configurar à mão;
# - ponte interna 2444 → 127.0.0.1:2443, porque a API do serviço só aceita chamadas da própria máquina (ws.properties).
set -u
BX=/opt/bx
CONF="$BX/recnetbx-service.properties"
JAVA="$BX/java/bin/java"
JAR="$(ls "$BX"/receitanetbx-service-*.jar | head -1)"
ENTRADA=/entrada
CLASSE_CONFIG=br.gov.serpro.receitanetbx.service.DialogoConfiguracaoServico

grep -q "[[:space:]]$(hostname)\$" /etc/hosts 2>/dev/null || echo "127.0.0.1 $(hostname)" >> /etc/hosts
mkdir -p /dados/downloads "$ENTRADA"
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
DAEMON=""
iniciar() { rm -f "$BX/recnetbx.pid"; (cd "$BX" && exec "$JAVA" -jar "$JAR") & DAEMON=$!; }
parar() {
  [ -n "$DAEMON" ] && kill "$DAEMON" 2>/dev/null
  i=0; while [ -n "$DAEMON" ] && kill -0 "$DAEMON" 2>/dev/null && [ $i -lt 20 ]; do sleep 1; i=$((i + 1)); done
  [ -n "$DAEMON" ] && kill -9 "$DAEMON" 2>/dev/null
  DAEMON=""; rm -f "$BX/recnetbx.pid"
}
fechar_configurador() { pkill -f "$CLASSE_CONFIG" 2>/dev/null; sleep 1; }
abrir_configurador() { (cd "$BX" && exec "$JAVA" -cp "$JAR" "$CLASSE_CONFIG") >/dev/null 2>&1 & }
status() { printf '{"ok":%s,"mensagem":"%s","em":"%s"}\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ENTRADA/status.json"; }

# Preenche o configurador oficial com o certificado e a senha entregues pelo InTAX.
configurar_entrega() {
  echo "ReceitanetBX: certificado novo entregue pelo InTAX; configurando."
  parar
  fechar_configurador
  sed -i 's#^certificadoDigital=.*#certificadoDigital=/entrada/certificado.pfx#; s#^armazenamentoCertificado=.*#armazenamentoCertificado=C#' "$CONF"
  ANTES="$(stat -c %Y "$CONF")"
  abrir_configurador
  W=""; i=0
  while [ -z "$W" ] && [ $i -lt 60 ]; do W="$(xdotool search --name 'Configura.*Receitanet' 2>/dev/null | head -1)"; sleep 1; i=$((i + 1)); done
  if [ -z "$W" ]; then status false "A tela de configuração do ReceitanetBX não abriu."; rm -f "$ENTRADA/senha"; iniciar; return; fi
  sleep 2
  xdotool windowactivate --sync "$W" >/dev/null 2>&1
  # Campo "Caminho do certificado" (posição na janela do configurador 1.10.0); Tab Tab leva ao campo da senha.
  xdotool mousemove --window "$W" 332 90 click 1; sleep 0.3
  xdotool key ctrl+a; xdotool type --delay 15 '/entrada/certificado.pfx'
  xdotool key Tab Tab; sleep 0.3
  xdotool key ctrl+a; xdotool type --delay 15 --file "$ENTRADA/senha"
  sleep 0.5
  xdotool key alt+s; sleep 4
  rm -f "$ENTRADA/senha"
  fechar_configurador
  DEPOIS="$(stat -c %Y "$CONF")"
  if configurado && [ "$DEPOIS" != "$ANTES" ] && grep -q '^certificadoDigital=/entrada/certificado.pfx$' "$CONF"; then
    status true "Certificado configurado no ReceitanetBX."
  else
    status false "O configurador do ReceitanetBX não gravou a senha. Tente de novo ou configure pela tela remota."
  fi
  iniciar
  VISTO="$(stat -c %Y "$CONF")"
}

iniciar
configurado || abrir_configurador
VISTO="$(stat -c %Y "$CONF")"
while true; do
  if [ -s "$ENTRADA/senha" ] && [ -s "$ENTRADA/certificado.pfx" ]; then configurar_entrega; fi
  if [ -n "$DAEMON" ] && ! kill -0 "$DAEMON" 2>/dev/null; then echo "ReceitanetBX: serviço parou; reiniciando."; sleep 5; iniciar; fi
  # Configuração feita à mão pela tela remota: reinicia o serviço para ler a senha nova.
  AGORA="$(stat -c %Y "$CONF")"
  if [ "$AGORA" != "$VISTO" ]; then VISTO="$AGORA"; if configurado; then echo "ReceitanetBX: configuração alterada; reiniciando o serviço."; parar; iniciar; fi; fi
  sleep 5
done
