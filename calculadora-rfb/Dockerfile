# Calculadora de Tributos da Reforma (Receita Federal / Serpro), licença MIT:
# https://github.com/ReceitaFederal/calculadora-rtc-regime-regular
# A versão fica travada no commit (RFB_COMMIT, vindo de CALCULADORA_RFB_COMMIT no .env). Trocar de versão: Administração >
# Integrações > "Aplicar versão nova" (o servidor reconstrói, roda a bateria de conferência e mostra o que mudou).
FROM maven:3.9.9-eclipse-temurin-21 AS build
ARG RFB_REPO=https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git
ARG RFB_COMMIT=150cccb
WORKDIR /src
RUN git clone --quiet "$RFB_REPO" . && git checkout --quiet "$RFB_COMMIT"
# Banco SQLite oficial (Flyway) e o JAR, sem rodar os testes de integração deles.
RUN mkdir -p calculadora/db \
 && mvn -q -B flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
 && mvn -q -B -DskipTests package \
 && cp target/*.jar /src/app.jar \
 && git rev-parse --short HEAD > /src/COMMIT

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/app.jar /app/app.jar
COPY --from=build /src/calculadora/db /app/calculadora/db
COPY --from=build /src/COMMIT /app/COMMIT
COPY --from=build /src/LICENSE /app/LICENSE
COPY entrypoint.sh /app/entrypoint.sh
RUN useradd -r -u 10001 calc && chown -R calc /app && chmod +x /app/entrypoint.sh
EXPOSE 8080
ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseSerialGC"
ENTRYPOINT ["/app/entrypoint.sh"]
