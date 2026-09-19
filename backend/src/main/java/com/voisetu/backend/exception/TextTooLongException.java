package com.voisetu.backend.exception;

import org.springframework.http.HttpStatus;

/** Thrown when the submitted text exceeds the per-request character limit. */
public class TextTooLongException extends AppException {

    public TextTooLongException(int maxChars) {
        super(HttpStatus.PAYLOAD_TOO_LARGE, "TEXT_TOO_LONG",
                "Text exceeds the maximum allowed length of " + maxChars + " characters per request.");
    }
}
