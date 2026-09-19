package com.voisetu.backend.service;

import com.voisetu.backend.repository.DashboardRepository;
import com.voisetu.backend.client.SupertonicClient;
import com.voisetu.backend.config.AppProperties;
import com.voisetu.backend.dto.request.TtsGenerateRequest;
import com.voisetu.backend.exception.DailyLimitExceededException;
import com.voisetu.backend.exception.TextTooLongException;
import com.voisetu.backend.exception.TtsEngineUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Core TTS generation service.
 *
 * Concurrency model:
 *   - A bounded {@link Semaphore} limits simultaneous TTS calls to {@code app.tts.semaphore-permits}.
 *   - Requests that cannot acquire a permit within a short timeout get an immediate 503
 *     rather than piling up and blocking server threads.
 *   - The DB operations (create, update, usage upsert) are wrapped in a transaction.
 *     If TTS fails, the generation row is updated to 'failed'; no orphans are left.
 *
 * N+1 prevention:
 *   - Voice DB ID is resolved once per request via a single indexed query on {@code engine_voice_id}.
 *   - No repeated DB round-trips per generation within a request.
 */
@Service
public class TtsGenerationService {

    private static final Logger log = LoggerFactory.getLogger(TtsGenerationService.class);

    private final SupertonicClient supertonicClient;
    private final DashboardRepository dashboardRepository;
    private final JdbcTemplate jdbcTemplate;
    private final AudioStorageService audioStorageService;
    private final AppProperties appProperties;

    /** Guards the maximum number of simultaneous TTS synthesis calls. */
    private final Semaphore ttsSemaphore;

    public TtsGenerationService(SupertonicClient supertonicClient,
                                DashboardRepository dashboardRepository,
                                JdbcTemplate jdbcTemplate,
                                AudioStorageService audioStorageService,
                                AppProperties appProperties) {
        this.supertonicClient = supertonicClient;
        this.dashboardRepository = dashboardRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.audioStorageService = audioStorageService;
        this.appProperties = appProperties;
        this.ttsSemaphore = new Semaphore(appProperties.getTts().getSemaphorePermits(), true);
    }

    /**
     * Validates and generates speech audio for the authenticated user.
     *
     * @throws TextTooLongException if text exceeds per-request limit
     * @throws DailyLimitExceededException if user has hit their daily quota
     * @throws TtsEngineUnavailableException if the TTS semaphore is full
     */
    public GenerationResult generate(Long userId, TtsGenerateRequest request) throws Exception {
        String text = request.text().trim();

        // Business rule validation (structural validation already done by @Valid in controller)
        int maxChars = appProperties.getUsage().getMaxRequestChars();
        if (text.length() > maxChars) {
            throw new TextTooLongException(maxChars);
        }

        // Check daily usage limit
        Map<String, Object> usage = dashboardRepository.getUsageToday(userId);
        int charsUsed = ((Number) usage.get("characters_used")).intValue();
        int dailyLimit = appProperties.getUsage().getDailyLimit();
        if (charsUsed + text.length() > dailyLimit) {
            throw new DailyLimitExceededException(dailyLimit);
        }

        // Acquire semaphore — fail fast if TTS studio is full (wait up to 20 seconds)
        boolean acquired;
        try {
            acquired = ttsSemaphore.tryAcquire(20, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw TtsEngineUnavailableException.busy();
        }
        if (!acquired) {
            log.warn("TTS semaphore full ({} permits, 0 available) for userId={}", 
                     appProperties.getTts().getSemaphorePermits(), userId);
            throw TtsEngineUnavailableException.busy();
        }

        try {
            return doGenerate(userId, request, text);
        } finally {
            ttsSemaphore.release();
        }
    }

    /**
     * Inner method that performs the DB writes + TTS call.
     * Wrapped in a transaction: if TTS fails, the generation row is updated to 'failed'.
     */
    @Transactional
    protected GenerationResult doGenerate(Long userId, TtsGenerateRequest request, String text) throws Exception {
        Long voiceDbId = resolveVoiceDbId(request.voiceId());
        Long generationId = dashboardRepository.createGeneration(
                userId, request.projectId(), voiceDbId, text, text.length());

        log.info("Starting TTS | userId={} generationId={} voice={} lang={} chars={}",
                userId, generationId, request.voiceId(), request.resolvedLang(), text.length());

        try {
            byte[] audioBytes = supertonicClient.synthesize(
                    text,
                    request.voiceId(),
                    request.resolvedLang(),
                    request.resolvedSpeed(),
                    request.resolvedTotalSteps()
            );

            File audioFile = audioStorageService.saveWav(userId, generationId, audioBytes);
            dashboardRepository.updateGenerationSuccess(generationId, audioFile.getAbsolutePath(), 0.0);
            dashboardRepository.upsertUsage(userId, text.length());

            log.info("TTS success | generationId={} bytes={}", generationId, audioBytes.length);
            return new GenerationResult(generationId, audioBytes);

        } catch (Exception e) {
            log.error("TTS failed | generationId={} error={}", generationId, e.getMessage());
            dashboardRepository.updateGenerationFailed(generationId);
            throw e;
        }
    }

    /**
     * Resolves the voice's DB primary key from its engine voice ID (e.g. "M1").
     * Uses a single indexed query — no N+1 issue.
     */
    private Long resolveVoiceDbId(String engineVoiceId) {
        List<Map<String, Object>> voices = jdbcTemplate.queryForList(
                "SELECT id FROM voice WHERE engine_voice_id = ?", engineVoiceId);
        return voices.isEmpty() ? 1L : ((Number) voices.get(0).get("id")).longValue();
    }

    /** Returns semaphore stats for monitoring. */
    public int availableTtsSlots() {
        return ttsSemaphore.availablePermits();
    }

    public record GenerationResult(Long generationId, byte[] audioBytes) {}
}
