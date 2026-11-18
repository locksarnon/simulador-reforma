#!/bin/bash
# Atualização da calculadora oficial da Receita pedida em Administração > Integrações ("Aplicar versão nova").
# Roda no servidor pelo cron (a cada 5 minutos). Passos:
#   1. o InTAX grava pedido.json {commit} na pasta de controle (volume calculadora_rfb_controle);
#   2. este script constrói a versão pedida numa imagem à parte, sobe uma cópia temporária na rede interna e roda a bateria
#      de conferência (backend/scripts/calculadora-rfb-bateria.mjs) contra a fotografia da versão em uso;
#   3. sem diferença, ou com a troca confirmada pelo administrador (pedido.json com "confirmado":true), troca a versão
#      (CALCULADORA_RFB_COMMIT no .env), confere que subiu, refaz a fotografia e grava situacao.json; com diferença e sem
#      confirmação, para e espera a confirmação na tela;
#   4. qualquer erro (build, cópia que não responde, troca que não sobe, erro inesperado) volta à versão anterior, grava
#      situacao.json com ERRO e limpa o pedido, para o painel não ficar preso e o administrador poder pedir de novo.
set -Eeuo pipefail
RAIZ=/var/www/html/simulador-reforma
cd "$RAIZ"
PROJ=simulador-reforma
CTRL=$(docker volume inspect -f '{{.Mountpoint}}' ${PROJ}_calculadora_rfb_controle 2>/dev/null || true)
[ -n "$CTRL" ] && [ -f "$CTRL/pedido.json" ] || exit 0
exec 9>/tmp/calculadora-rfb-atualizar.lock
flock -n 9 || exit 0

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.receitanetbx.yml -f docker-compose.calculadora-rfb.yml --env-file .env"
URL_EM_USO=http://reforma-calculadora-rfb:8080/api/calculadora
BATERIA="docker exec reforma-backend node scripts/calculadora-rfb-bateria.mjs"
situacao() { printf '%s\n' "$1" > "$CTRL/situacao.json.tmp" && mv "$CTRL/situacao.json.tmp" "$CTRL/situacao.json"; }
saudavel() { # $1 = host:porta; espera até 5 minutos
  local i=0
  until docker exec reforma-backend node -e "fetch('http://$1/api/calculadora/dados-abertos/versao').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
    i=$((i+1)); [ $i -lt 60 ] || return 1; sleep 5
  done
}

COMMIT=$(sed -n 's/.*"commit" *: *"\([0-9a-f]\{7,40\}\)".*/\1/p' "$CTRL/pedido.json" | cut -c1-7)
CONFIRMADO=$(grep -c '"confirmado":true' "$CTRL/pedido.json" || true)
ANTERIOR=$(grep '^CALCULADORA_RFB_COMMIT=' .env | head -1 | cut -d= -f2 || true)
TROCANDO=0

falhar() { # $1 = o que aconteceu
  docker rm -f reforma-calculadora-rfb-nova >/dev/null 2>&1 || true
  if [ "$TROCANDO" = 1 ]; then
    if [ -n "$ANTERIOR" ]; then sed -i "s/^CALCULADORA_RFB_COMMIT=.*/CALCULADORA_RFB_COMMIT=$ANTERIOR/" .env; else sed -i '/^CALCULADORA_RFB_COMMIT=/d' .env; fi
    $COMPOSE up -d --build --no-deps calculadora-rfb >> /tmp/calculadora-rfb-troca.log 2>&1 || true
  fi
  situacao "{\"etapa\":\"ERRO\",\"commit\":\"${COMMIT:-}\",\"mensagem\":\"$1 A versão anterior continua em uso.\"}"
  rm -f "$CTRL/pedido.json"
  exit 0
}
trap 'falhar "A atualização parou por um erro no servidor."' ERR

[ -n "$COMMIT" ] || falhar "Pedido sem versão válida."
if [ -f "$CTRL/bateria-$COMMIT.json" ] && [ "$CONFIRMADO" = 0 ]; then exit 0; fi
QUANDO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ! -f "$CTRL/bateria-$COMMIT.json" ]; then
  situacao "{\"etapa\":\"CONSTRUINDO\",\"commit\":\"$COMMIT\",\"desde\":\"$QUANDO\"}"
  docker build -q -t calculadora-rfb:"$COMMIT" --build-arg RFB_COMMIT="$COMMIT" ./calculadora-rfb > /tmp/calculadora-rfb-build.log 2>&1 || falhar "A versão pedida não compilou no servidor."
  situacao "{\"etapa\":\"CONFERINDO\",\"commit\":\"$COMMIT\",\"desde\":\"$QUANDO\"}"
  docker rm -f reforma-calculadora-rfb-nova >/dev/null 2>&1 || true
  docker run -d --name reforma-calculadora-rfb-nova --network ${PROJ}_default --memory 768m calculadora-rfb:"$COMMIT" >/dev/null
  saudavel reforma-calculadora-rfb-nova:8080 || falhar "A versão pedida não respondeu."
  [ -f "$CTRL/fotografia.json" ] || $BATERIA $URL_EM_USO /calculadora-rfb-controle fotografar >/dev/null
  $BATERIA http://reforma-calculadora-rfb-nova:8080/api/calculadora /calculadora-rfb-controle comparar "$COMMIT" >/dev/null
  docker rm -f reforma-calculadora-rfb-nova >/dev/null 2>&1 || true
fi

DIFS=$(sed -n 's/.*"diferencas":\([0-9]*\).*/\1/p' "$CTRL/bateria-$COMMIT.json")
if [ "${DIFS:-1}" != 0 ] && [ "$CONFIRMADO" = 0 ]; then
  situacao "{\"etapa\":\"AGUARDANDO_CONFIRMACAO\",\"commit\":\"$COMMIT\",\"diferencas\":$DIFS}"
  exit 0
fi

situacao "{\"etapa\":\"TROCANDO\",\"commit\":\"$COMMIT\"}"
TROCANDO=1
if grep -q '^CALCULADORA_RFB_COMMIT=' .env; then sed -i "s/^CALCULADORA_RFB_COMMIT=.*/CALCULADORA_RFB_COMMIT=$COMMIT/" .env; else echo "CALCULADORA_RFB_COMMIT=$COMMIT" >> .env; fi
$COMPOSE up -d --build --no-deps calculadora-rfb > /tmp/calculadora-rfb-troca.log 2>&1 || falhar "A troca da versão falhou."
saudavel reforma-calculadora-rfb:8080 || falhar "A versão nova não subiu."
$BATERIA $URL_EM_USO /calculadora-rfb-controle fotografar >/dev/null
TROCANDO=0
rm -f "$CTRL/pedido.json"
situacao "{\"etapa\":\"CONCLUIDA\",\"commit\":\"$COMMIT\",\"em\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"diferencas\":${DIFS:-0}}"
