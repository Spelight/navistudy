ARG RUNTIME_IMAGE=eclipse-temurin:21-jre-alpine
FROM ${RUNTIME_IMAGE}

USER root
WORKDIR /app
RUN rm -rf /app/*
COPY backend-dist/ ./
RUN chmod +x /app/bin/naviplan-backend

ENV HOST=0.0.0.0
ENV PORT=8090
EXPOSE 8090
ENTRYPOINT ["/app/bin/naviplan-backend"]
