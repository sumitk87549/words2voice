"""
Voisetu TTS FastAPI Service — Supertonic-3 Engine
Runs on port 8000. Accessed by Spring Boot backend and optionally Angular (via Spring proxy).

Endpoints:
  GET  /health                  — liveness check
  GET  /voices                  — list available voice presets
  POST /synthesize              — generate TTS audio (returns WAV bytes)
  GET  /docs                    — Swagger UI
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field, field_validator

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("voisetu.tts")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Voisetu TTS Service",
    description="On-device TTS powered by Supertonic-3 (Supertone/supertonic-3)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Spring Boot & Angular both access this
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Voice catalogue ───────────────────────────────────────────────────────────
# Supertonic-3 ships 10 built-in presets: M1–M5, F1–F5.
# We expose them with descriptive labels; the id is exactly what the SDK expects.
VOICE_CATALOGUE = [
    # Male voices
    {"id": "M1", "display_name": "Arjun",   "gender": "male",   "style_tag": "Neutral & Clear",    "description": "A calm, authoritative male voice ideal for narration."},
    {"id": "M2", "display_name": "Vikram",  "gender": "male",   "style_tag": "Deep & Warm",         "description": "Rich, deep male voice with a warm, conversational tone."},
    {"id": "M3", "display_name": "Rohan",   "gender": "male",   "style_tag": "Expressive",          "description": "Energetic male voice with natural expressiveness."},
    {"id": "M4", "display_name": "Dev",     "gender": "male",   "style_tag": "Professional",        "description": "Crisp, professional voice suited for announcements."},
    {"id": "M5", "display_name": "Karan",   "gender": "male",   "style_tag": "Young & Casual",      "description": "Youthful, friendly voice with a casual delivery."},
    # Female voices
    {"id": "F1", "display_name": "Priya",   "gender": "female", "style_tag": "Soft & Melodic",      "description": "Warm, melodic female voice perfect for storytelling."},
    {"id": "F2", "display_name": "Ananya",  "gender": "female", "style_tag": "Confident",           "description": "Confident, clear female voice great for presentations."},
    {"id": "F3", "display_name": "Neha",    "gender": "female", "style_tag": "Expressive",          "description": "Expressive female voice with natural cadence."},
    {"id": "F4", "display_name": "Kavya",   "gender": "female", "style_tag": "Young & Bright",      "description": "Bright, cheerful voice with a modern feel."},
    {"id": "F5", "display_name": "Meera",   "gender": "female", "style_tag": "Calm & Soothing",     "description": "Smooth, soothing voice ideal for meditation or long-form content."},
]

VOICE_ID_SET = {v["id"] for v in VOICE_CATALOGUE}

# ── TTS Engine (lazy-loaded at startup) ───────────────────────────────────────
tts_engine = None
MOCK_TTS = os.getenv("MOCK_TTS", "false").lower() == "true"
_start_time = time.time()

def get_engine():
    global tts_engine
    if tts_engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialised yet. Please retry in a moment.")
    return tts_engine


@app.on_event("startup")
async def startup_event():
    global tts_engine

    if MOCK_TTS:
        log.info("🧪 MOCK_TTS=true — skipping Supertonic-3 model loading")
        tts_engine = "mock"
        return

    log.info("Loading Supertonic-3 model from cache …")
    t0 = time.time()

    try:
        from supertonic import TTS  # noqa: PLC0415
        tts_engine = TTS(model="supertonic-3")
        log.info("✅ Supertonic-3 ready in %.1fs", time.time() - t0)
    except Exception as exc:
        log.error("❌ Failed to load Supertonic-3: %s", exc)
        # Keep running; every synthesis request will return 503 until fixed.


# ── Request/Response models ───────────────────────────────────────────────────

class SynthRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesise (Hindi/English/Hinglish)")
    voice_id: str = Field("M1", description="Voice preset ID (M1–M5, F1–F5)")
    lang: Optional[str] = Field(
        None,
        description=(
            "Language code: 'hi' (Hindi), 'en' (English), 'na' (auto-detect / Hinglish). "
            "Defaults to 'na' which handles Hinglish best."
        ),
    )
    speed: float = Field(1.0, ge=0.7, le=2.0, description="Speaking speed multiplier (0.7 – 2.0)")
    total_steps: int = Field(8, ge=1, le=40, description="Diffusion steps — higher = better quality but slower")
    silence_duration: float = Field(0.3, ge=0.0, le=2.0, description="Silence between chunks in seconds")

    @field_validator("voice_id")
    @classmethod
    def validate_voice(cls, v: str) -> str:
        if v not in VOICE_ID_SET:
            raise ValueError(f"Unknown voice_id '{v}'. Available: {sorted(VOICE_ID_SET)}")
        return v

    @field_validator("lang")
    @classmethod
    def validate_lang(cls, v: Optional[str]) -> Optional[str]:
        VALID = {
            "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es",
            "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv",
            "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "na",
        }
        if v is not None and v not in VALID:
            raise ValueError(f"Unknown language code '{v}'.")
        return v


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", summary="Liveness check")
async def health():
    engine_ok = tts_engine is not None
    return {
        "status": "ok" if engine_ok else "loading",
        "engine": "mock" if MOCK_TTS else "supertonic-3",
        "ready": engine_ok,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "voices_available": len(VOICE_CATALOGUE)
    }


@app.post("/estimate", summary="Estimate generation time")
async def estimate(req: SynthRequest):
    base = 4
    quality_factor = {4: 0.55, 8: 1.0, 16: 1.8, 32: 3.5}
    factor = quality_factor.get(req.total_steps, 1.0)
    seconds = int(base + (len(req.text) * 0.03 * factor))
    return {"estimated_seconds": seconds}


@app.get("/voices", summary="List available voice presets")
async def voices():
    return VOICE_CATALOGUE


@app.post(
    "/synthesize",
    summary="Generate TTS audio",
    response_description="WAV audio bytes",
    responses={
        200: {"content": {"audio/wav": {}}, "description": "Generated WAV audio"},
        422: {"description": "Validation error"},
        503: {"description": "Engine not ready"},
    },
)
async def synthesize(req: SynthRequest):
    # ── Mock mode ────────────────────────────────────────────────────────────
    if MOCK_TTS:
        log.info(
            "🧪 MOCK synthesis | voice=%s lang=%s chars=%d",
            req.voice_id,
            req.lang or "na",
            len(req.text),
        )

        t0 = time.time()

        # Generate 0.5 seconds of silence.
        sample_rate = 22050
        duration = 0.5
        wav = np.zeros(int(sample_rate * duration), dtype=np.float32)

        buf = io.BytesIO()
        sf.write(
            buf,
            wav,
            sample_rate,
            format="WAV",
            subtype="PCM_16",
        )
        buf.seek(0)

        elapsed = time.time() - t0

        return Response(
            content=buf.read(),
            media_type="audio/wav",
            headers={
                "X-Audio-Duration": str(duration),
                "X-Synthesis-Time": str(round(elapsed, 3)),
                "Content-Disposition": 'attachment; filename="words2voice_audio.wav"',
            },
        )

    # ── Real Supertonic-3 mode ───────────────────────────────────────────────
    engine = get_engine()

    log.info(
        "Synthesizing | voice=%s lang=%s speed=%.2f steps=%d chars=%d",
        req.voice_id,
        req.lang or "na",
        req.speed,
        req.total_steps,
        len(req.text),
    )

    t0 = time.time()

    try:
        voice_style = engine.get_voice_style(req.voice_id)

        effective_lang = req.lang if req.lang else "na"

        wav, duration = engine.synthesize(
            text=req.text,
            voice_style=voice_style,
            lang=effective_lang,
            speed=req.speed,
            total_steps=req.total_steps,
            silence_duration=req.silence_duration,
        )

    except ValueError as exc:
        log.warning("Synthesis validation error: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))

    except Exception as exc:
        log.error("Synthesis failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}")

    elapsed = time.time() - t0

    audio_duration = float(np.sum(duration))

    log.info(
        "✅ Generated %.2fs of audio in %.2fs (RTF %.3f)",
        audio_duration,
        elapsed,
        elapsed / max(audio_duration, 0.001),
    )

    buf = io.BytesIO()

    sf.write(
        buf,
        wav.squeeze(),
        engine.sample_rate,
        format="WAV",
        subtype="PCM_16",
    )

    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="audio/wav",
        headers={
            "X-Audio-Duration": str(round(audio_duration, 3)),
            "X-Synthesis-Time": str(round(elapsed, 3)),
            "Content-Disposition": 'attachment; filename="words2voice_audio.wav"',
        },
    )

# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    log.error("Unhandled error on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
