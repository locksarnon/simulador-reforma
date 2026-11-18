#!/bin/sh
# Publica o banco oficial e a versão na pasta compartilhada com o InTAX (leitura das tabelas oficiais) e sobe a API.
set -e
if [ -d /compartilhado ]; then
  cp /app/calculadora/db/calculadora-pro.db /compartilhado/calculadora-pro.db.tmp
  mv /compartilhado/calculadora-pro.db.tmp /compartilhado/calculadora-pro.db
  cp /app/COMMIT /compartilhado/COMMIT
  chmod a+r /compartilhado/calculadora-pro.db /compartilhado/COMMIT
fi
exec setpriv --reuid=10001 --regid=10001 --clear-groups java $JAVA_OPTS -jar /app/app.jar --spring.profiles.active=offline
