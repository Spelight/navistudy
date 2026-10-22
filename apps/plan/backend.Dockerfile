FROM gradle:8.10-jdk21-alpine AS build
WORKDIR /workspace
COPY backend/ ./
RUN gradle --no-daemon clean installDist

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S naviplan && adduser -S -G naviplan naviplan
WORKDIR /app
COPY --from=build /workspace/build/install/naviplan-backend/ ./
USER naviplan
ENV HOST=0.0.0.0
ENV PORT=8090
EXPOSE 8090
ENTRYPOINT ["/app/bin/naviplan-backend"]
