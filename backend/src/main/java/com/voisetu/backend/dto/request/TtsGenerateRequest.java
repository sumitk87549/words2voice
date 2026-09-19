package com.voisetu.backend.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.*;

/**
 * Request DTO for authenticated TTS generation (POST /api/tts/generate).
 *
 * Validation is enforced via Bean Validation; business-rule checks
 * (daily limit, char limit) remain in {@code TtsGenerationService}.
 */
public record TtsGenerateRequest(

        @NotBlank(message = "Text is required and cannot be empty")
        @Size(max = 5000, message = "Text must not exceed 5000 characters per request")
        String text,

        @JsonAlias({"engineVoiceId", "engine_voice_id", "voice_id"})
        @NotBlank(message = "Voice ID is required")
        @Pattern(regexp = "[MF][1-5]", message = "Voice ID must be one of: M1–M5 or F1–F5")
        String voiceId,

        @Pattern(regexp = "hi|en|na", message = "Language must be 'hi', 'en', or 'na' (auto)")
        String lang,

        @DecimalMin(value = "0.7", message = "Speed must be at least 0.7")
        @DecimalMax(value = "2.0", message = "Speed must not exceed 2.0")
        Double speed,

        @Min(value = 1, message = "Total steps must be at least 1")
        @Max(value = 40, message = "Total steps must not exceed 40")
        Integer totalSteps,

        Long projectId
) {
    public String resolvedLang()       { return lang      == null || lang.isBlank()      ? "na"  : lang; }
    public double resolvedSpeed()      { return speed     == null                         ? 1.0   : speed; }
    public int    resolvedTotalSteps() { return totalSteps == null                         ? 8     : totalSteps; }
}
