package com.voisetu.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Centralized typed configuration properties — replaces all scattered {@code @Value} annotations.
 *
 * Bound from {@code application.yml} prefix {@code app}.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Storage storage = new Storage();
    private Usage usage = new Usage();
    private String allowedOrigins = "http://localhost:4200";
    private Tts tts = new Tts();

    @Getter
    @Setter
    public static class Jwt {
        private String secret;
        private long expirationMs = 86_400_000L;
    }

    @Getter
    @Setter
    public static class Storage {
        private String audioDir = "backend-data/audio";
    }

    @Getter
    @Setter
    public static class Usage {
        private int dailyLimit = 20000;
        private int maxRequestChars = 5000;
    }

    @Getter
    @Setter
    public static class Tts {
        /** Max simultaneous TTS synthesis calls. Excess requests get an immediate 503. */
        private int semaphorePermits = 3;
    }
}
