CREATE TABLE IF NOT EXISTS app_user (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice (
    id                BIGSERIAL PRIMARY KEY,
    engine_voice_id   VARCHAR(20) NOT NULL UNIQUE,
    display_name      VARCHAR(50) NOT NULL,
    gender            VARCHAR(10) NOT NULL,
    style_tag         VARCHAR(30) NOT NULL,
    is_available      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS project (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
    project_id      BIGINT REFERENCES project(id) ON DELETE SET NULL,
    voice_id        BIGINT NOT NULL REFERENCES voice(id),
    input_text      TEXT NOT NULL,
    char_count      INT NOT NULL,
    audio_path      VARCHAR(500),
    duration_seconds NUMERIC(6,2),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_daily (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    usage_date          DATE NOT NULL,
    characters_used     INT NOT NULL DEFAULT 0,
    generation_count    INT NOT NULL DEFAULT 0,
    UNIQUE(user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS contact_message (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interest_signal (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    would_pay           VARCHAR(10) NOT NULL,
    suggested_price_inr INT,
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE generation ADD COLUMN IF NOT EXISTS is_liked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE generation ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'completed';
ALTER TABLE generation ADD COLUMN IF NOT EXISTS estimated_seconds INT;
ALTER TABLE generation ADD COLUMN IF NOT EXISTS synthesis_ms BIGINT;

CREATE TABLE IF NOT EXISTS analytics_session (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL UNIQUE,
    anonymous_id    VARCHAR(100) NOT NULL,
    user_id         BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    ip_hash         VARCHAR(64),
    device_type     VARCHAR(20),
    browser         VARCHAR(50),
    referrer        VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_event (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL REFERENCES analytics_session(session_id) ON DELETE CASCADE,
    event_name      VARCHAR(100) NOT NULL,
    route           VARCHAR(255),
    properties      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_event(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_event_created_at ON analytics_event(created_at);

CREATE TABLE IF NOT EXISTS synthesis_metric (
    id              BIGSERIAL PRIMARY KEY,
    generation_id   BIGINT REFERENCES generation(id) ON DELETE CASCADE,
    voice_id        VARCHAR(50) NOT NULL,
    char_count      INT NOT NULL,
    quality_steps   INT,
    speed           NUMERIC(3,2),
    synthesis_ms    BIGINT,
    rtf             NUMERIC(6,3),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
--  Business metrics — aggregated daily stats for quick reporting
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS site_daily_stats (
    stat_date           DATE PRIMARY KEY,
    unique_sessions     INT NOT NULL DEFAULT 0,   -- distinct sessions that day
    unique_anon_ids     INT NOT NULL DEFAULT 0,   -- distinct anonymous visitors
    registered_users    INT NOT NULL DEFAULT 0,   -- total registered users (snapshot)
    new_signups         INT NOT NULL DEFAULT 0,   -- new registrations that day
    total_generations   INT NOT NULL DEFAULT 0,   -- successful generations that day
    total_chars         BIGINT NOT NULL DEFAULT 0,-- total characters synthesized
    page_views          INT NOT NULL DEFAULT 0,   -- page_view events that day
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_session_created ON analytics_session(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session_anon ON analytics_session(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_generation_status ON generation(status, created_at);