# FROM eclipse-temurin:17-jdk

# COPY target/backend-0.0.1-SNAPSHOT.jar app.jar

# EXPOSE 8080

# CMD ["java", "-jar", "app.jar"]

# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy pom.xml first (layer cache: only re-download deps when pom changes)
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build fat JAR
COPY src ./src
RUN mvn package -DskipTests -q

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Non-root user (security best practice)
RUN useradd -m -u 1000 appuser
USER appuser

# Copy the built JAR
COPY --from=builder --chown=appuser /app/target/*.jar app.jar

# ── JVM tuning for 512 MB free-tier containers ────────────────────────────
# -Xmx350m        : Max heap (leaves ~160 MB for JVM overhead, OS, metaspace)
# -Xms64m         : Start small, grow on demand
# -Xss512k        : Reduce thread stack from default 512k → 256k
# -XX:TieredStopAtLevel=1 : Faster startup (skip C2 JIT on cold start)
# -XX:+UseSerialGC: Smallest GC footprint (no parallel GC threads needed at this scale)
ENV JAVA_OPTS="-Xmx350m -Xms64m -Xss512k -XX:TieredStopAtLevel=1 -XX:+UseSerialGC \
  -Djava.security.egd=file:/dev/./urandom"

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
