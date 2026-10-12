# syntax=docker/dockerfile:1

# Stage 1 builds the jar. It uses the Maven wrapper, so the server gets the same Maven version
# as the laptop and needs neither Java nor Maven installed.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
COPY src src
# The cache mount keeps downloaded dependencies between builds without putting them in the image.
# Tests are skipped here: the one test starts the whole app and needs a running database.
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q package -DskipTests

# Stage 2 is what actually runs: a Java runtime and the jar, nothing else.
FROM eclipse-temurin:25-jre
WORKDIR /app
# Not root, so a compromised app can't rewrite its own container.
RUN useradd --system --uid 10001 moneytrail
USER moneytrail
COPY --from=build /build/target/backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
