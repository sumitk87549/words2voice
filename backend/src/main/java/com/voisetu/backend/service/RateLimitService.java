package com.voisetu.backend.service;

import com.voisetu.backend.controller.TtsController;

import com.voisetu.backend.controller.ContactController;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Shared in-memory rate limiter for public endpoints (TTS preview, contact form).
 *
 * Replaces the two duplicate rate-limit maps that existed in TtsController and ContactController.
 *
 * A proper production deployment would use Redis for distributed rate limiting,
 * but this is correct for single-instance deployments.
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);

    private record RateLimitEntry(AtomicInteger count, Instant resetTime) {}

    private final ConcurrentHashMap<String, RateLimitEntry> limits = new ConcurrentHashMap<>();

    /**
     * Checks if the client IP is within its allowed request quota.
     */
    public boolean isAllowed(String clientIp, int maxPerHour, String context) {
        // Evict expired windows
        limits.entrySet().removeIf(e -> e.getValue().resetTime().isBefore(Instant.now()));

        RateLimitEntry entry = limits.compute(clientIp, (ip, existing) -> {
            if (existing == null || existing.resetTime().isBefore(Instant.now())) {
                return new RateLimitEntry(new AtomicInteger(1), Instant.now().plus(1, ChronoUnit.HOURS));
            }
            existing.count().incrementAndGet();
            return existing;
        });

        boolean allowed = entry.count().get() <= maxPerHour;
        if (!allowed) {
            log.warn("Rate limit hit for IP={} endpoint={} count={}", clientIp, context, entry.count().get());
        }
        return allowed;
    }
}
