# ReceitanetBX-Serviço (programa oficial da Receita Federal, versão Linux), para o InTAX saber quais escriturações do SPED
# (EFD-Contribuições, EFD ICMS/IPI) foram transmitidas e baixar os arquivos com o recibo.
# Página oficial: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/download/receitanetbx/download-do-programa-receitanetbx-servico
FROM debian:bookworm-slim

ARG BX_VERSAO=1.10.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl procps socat xvfb x11vnc fluxbox novnc python3-websockify xdotool \
       libfontconfig1 libxrender1 libxtst6 libxi6 fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# Instalação silenciosa (InstallJammer) do instalador oficial; traz o próprio Java 11.
RUN curl -fsSL -o /tmp/bx.bin "https://servicos.receita.fazenda.gov.br/publico/programas/ReceitanetBX/Servicos/ReceitanetBX-Servico-${BX_VERSAO}-Linux-x86_64-Install.bin" \
  && chmod +x /tmp/bx.bin && /tmp/bx.bin --mode silent --prefix /opt/bx && rm -f /tmp/bx.bin \
  && test -x /opt/bx/java/bin/java

COPY ws.properties /opt/bx/ws.properties
COPY recnetbx-service.properties.modelo /opt/bx/recnetbx-service.properties.modelo
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/$//' /entrypoint.sh /opt/bx/ws.properties /opt/bx/recnetbx-service.properties.modelo && chmod +x /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh

# /opt/bx inteiro fica num volume: configuração (senha cifrada pelo próprio programa), banco Derby, logs e downloads.
# /entrada: o InTAX entrega aqui o certificado e a senha (volume compartilhado com o backend).
VOLUME ["/opt/bx", "/dados", "/entrada"]
EXPOSE 2444 6080
ENTRYPOINT ["/entrypoint.sh"]
