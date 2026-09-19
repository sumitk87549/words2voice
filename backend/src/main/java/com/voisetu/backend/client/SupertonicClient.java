package com.voisetu.backend.client;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.voisetu.backend.exception.TtsEngineTimeoutException;
import com.voisetu.backend.exception.TtsEngineUnavailableException;

import jakarta.annotation.PostConstruct;

/**
 * HTTP client for the Voisetu FastAPI TTS service (supertonic-3) on port 8000.
 *
 * Retry strategy:
 *   - Retries up to 2 times on {@link TtsEngineUnavailableException} with a 1.5s backoff.
 *   - Does NOT retry on user input errors (422) or daily limit errors.
 *   - Timeout errors (> 120s) are not retried — they map to 504 Gateway Timeout.
 */
@Component
public class SupertonicClient {

    private static final Logger log = LoggerFactory.getLogger(SupertonicClient.class);

    private final String baseUrl;
    private final HttpClient httpClient;

    public SupertonicClient(
            @Value("${supertonic.engine.base-url:http://127.0.0.1:8000}") String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)  // uvicorn doesn't support HTTP/2
                .build();
    }

    @PostConstruct
    public void checkEngineStatus() {
        try {
            RestClient.create(baseUrl).get().uri("/health").retrieve().toBodilessEntity();
            log.info("✅  Voisetu TTS service is reachable at {}", baseUrl);
        } catch (Exception e) {
            log.warn("⚠️  Voisetu TTS service not reachable at {} — start tts-service first!", baseUrl);
        }
    }

    /**
     * Synthesise speech via POST /synthesize.
     * Retried up to 2 times (total 3 attempts) on engine connectivity errors.
     *
     * @param text       Text to synthesise
     * @param voiceId    Voice preset: M1–M5 or F1–F5
     * @param lang       Language: "hi", "en", "na"
     * @param speed      Speed multiplier 0.7–2.0
     * @param totalSteps Diffusion quality steps 1–40
     * @return Raw WAV bytes
     * @throws TtsEngineUnavailableException if engine is down or returns 5xx
     * @throws TtsEngineTimeoutException if synthesis exceeds timeout
     */
    @Retryable(
        retryFor = { TtsEngineUnavailableException.class },
        maxAttempts = 5,
        backoff = @Backoff(delay = 1500, multiplier = 1.5)
    )
    public byte[] synthesize(String text, String voiceId, String lang, double speed, int totalSteps) {
        String json = buildJson(text, voiceId, lang, speed, totalSteps);
        log.debug("POST {}/synthesize → {}…", baseUrl, json.substring(0, Math.min(json.length(), 120)));

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/synthesize"))
                    .header("Content-Type", "application/json")
                    .header("Accept", "audio/wav, */*")
                    .timeout(Duration.ofSeconds(1200))
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            int statusCode = response.statusCode();

            if (statusCode == 200) {
                log.info("✅  TTS OK — {} bytes (voice={} lang={} speed={} steps={})",
                        response.body().length, voiceId, lang, speed, totalSteps);
                return response.body();
            }

            String errorBody = new String(response.body(), StandardCharsets.UTF_8);
            log.error("TTS service HTTP {}: {}", statusCode, errorBody);

            if (statusCode >= 500 || statusCode == 503) {
                // These are retryable
                throw new TtsEngineUnavailableException(
                        "TTS service error " + statusCode + ": " + errorBody);
            }
            // 422, 400 — not retryable; rethrow as-is
            throw new RuntimeException("TTS service error " + statusCode + ": " + errorBody);

        } catch (TtsEngineUnavailableException e) {
            throw e;
        } catch (HttpTimeoutException e) {
            log.error("TTS synthesis timed out after 120s");
            throw new TtsEngineTimeoutException();
        } catch (ConnectException e) {
            log.warn("Cannot connect to TTS service at {}", baseUrl);
            throw new TtsEngineUnavailableException(
                    "Voisetu TTS engine is offline. Start tts-service/start-tts-service.sh", e);
        } catch (TtsEngineTimeoutException e) {
            throw e;
        } catch (Exception e) {
            log.error("TTS synthesis failed: {}", e.getMessage(), e);
            throw new TtsEngineUnavailableException("TTS synthesis failed: " + e.getMessage(), e);
        }
    }

    /** Called when all retry attempts for synthesize() have been exhausted. */
    @Recover
    public byte[] recoverSynthesize(TtsEngineUnavailableException e,
                                    String text, String voiceId, String lang,
                                    double speed, int totalSteps) {
        log.error("All TTS retry attempts exhausted for voiceId={}: {}", voiceId, e.getMessage());
        throw e;
    }

    private String buildJson(String text, String voiceId, String lang, double speed, int totalSteps) {
        String safeText    = escapeJson(text    != null ? text    : "");
        String safeVoiceId = escapeJson(voiceId != null ? voiceId : "M1");
        String safeLang    = escapeJson(lang    != null ? lang    : "na");

        return String.format(
            "{\"text\":\"%s\",\"voice_id\":\"%s\",\"lang\":\"%s\"," +
            "\"speed\":%.4f,\"total_steps\":%d,\"silence_duration\":0.3}",
            safeText, safeVoiceId, safeLang, speed, totalSteps
        );
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    /** @deprecated Use {@link TtsEngineUnavailableException} directly */
    @Deprecated(forRemoval = true)
    public static class EngineUnreachableException extends RuntimeException {
        public EngineUnreachableException(String message) { super(message); }
    }
}
