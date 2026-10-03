# 💾 Database ka "X-Ray Vision" — Schema Dekho, Business Samjho

> **Sumit, ye document tere database ko crystal clear kar dega.** Angular POV mein tune UI → Code mapping sikhi. Spring POV mein tune Request → Response flow samjha. Ab Database mein DATA kaise organized hai, kyun hai, aur business ke liye kya matlab rakhta hai — ye samjhega.

---

## 🎯 Pehle Ye Samajh: Database kya SOLVE karta hai?

Controller request receive karta hai, Service process karta hai... **par data kahan jaata hai?** RAM mein data server restart pe ud jaata hai. Database = **Permanent Memory**.

```
User clicks "Generate Audio"
    ↓
Angular → Spring Controller → Service → Repository
    ↓                                         ↓
    ↓                                   ┌────────────┐
    ↓                                   │ PostgreSQL  │
    ↓                                   │  Database   │
    ↓                                   │             │
    ↓                                   │ Tables:     │
    ↓                                   │ • app_user  │
    ↓                                   │ • voice     │
    ↓                                   │ • generation│
    ↓                                   │ • usage     │
    ↓                                   │ • analytics │
    ↓                                   └────────────┘
    ↓
Audio returns to Angular
```

### Tech Stack Summary

| Parameter | Value |
|---|---|
| RDBMS | **PostgreSQL** |
| Access Layer | **JdbcTemplate** (raw SQL — no JPA, no Hibernate!) |
| Schema Init | `schema.sql` runs on EVERY startup (`CREATE TABLE IF NOT EXISTS`) |
| Seed Data | `data.sql` inserts 10 voices (`ON CONFLICT DO NOTHING`) |
| Connection Pool | HikariCP (prod: max 5, min idle 2) |
| Cloud Provider | Neon Serverless PostgreSQL (production) |

> **Spring analogy:** Jaise Spring mein `@Repository` class hai jo DB se baat karta hai, waise PostgreSQL uska "brain" hai — saara data yahan rahta hai.

---

## 🏗️ LEVEL 1: Database ka Mental Model

### 🧠 Database = Excel on Steroids

```
Excel Spreadsheet           →    Database Table
Sheet name (e.g. "Users")   →    Table name (app_user)
Column headers              →    Column definitions (id, email, password_hash)
Each row                    →    Each record (one user)
Cell formula                →    SQL query / constraint
Cross-sheet reference       →    Foreign Key (FK)
```

### Tere Project mein 11 Tables hain:

```
╔══════════════════════════════════════════════════════════════════╗
║  CORE BUSINESS                                                    ║
║  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ║
║  │ app_user │───→│ project  │    │  voice   │    │generation│    ║
║  │ (users)  │    │ (folders)│    │(presets) │    │(audios)  │    ║
║  └──────────┘    └──────────┘    └──────────┘    └──────────┘    ║
║                                                                    ║
║  QUOTA & LIMITS                                                    ║
║  ┌──────────────┐                                                 ║
║  │ usage_daily  │  ← "Aaj kitne characters use kiye?"              ║
║  └──────────────┘                                                 ║
║                                                                    ║
║  PUBLIC FORMS                                                      ║
║  ┌────────────────┐    ┌─────────────────┐                        ║
║  │contact_message │    │ interest_signal │  ← "Kya pay karoge?"    ║
║  └────────────────┘    └─────────────────┘                        ║
║                                                                    ║
║  ANALYTICS (BUSINESS INTELLIGENCE)                                ║
║  ┌──────────────────┐    ┌────────────────┐    ┌───────────────┐  ║
║  │analytics_session │───→│analytics_event │    │site_daily_stats│  ║
║  └──────────────────┘    └────────────────┘    └───────────────┘  ║
║                                                                    ║
║  PERFORMANCE MONITORING                                            ║
║  ┌──────────────────┐                                              ║
║  │synthesis_metric  │  ← "TTS kitna fast/slow tha?"                ║
║  └──────────────────┘                                              ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 🏗️ LEVEL 2: Schema Design — Tables ko Padho

### 🧠 "Table ka structure dekhte waqt kya sochna hai?"

```
Table definition kholi?
    ↓
Step 1: Table ka NAAM padho → Business entity kya hai?
    ↓
Step 2: PRIMARY KEY dekho → Har row uniquely identify kaise hoti hai?
    ↓
Step 3: Columns dekho:
    ├── Data type kya hai? (VARCHAR, INT, BOOLEAN, TIMESTAMPTZ, TEXT, JSONB)
    ├── NOT NULL hai? → Required field (blank nahi ho sakta)
    ├── UNIQUE hai? → Duplicate nahi ho sakta (e.g., email)
    ├── DEFAULT value hai? → Agar nahi diya toh ye use hoga
    └── REFERENCES kya hai? → Kisi aur table se linked hai?
    ↓
Step 4: Business rule samjho → "Ye table KYUN exist karta hai?"
```

### Key Tables Detailed:

#### 1. `app_user` — Users ka Table

```sql
-- File: schema.sql (Line 1-8)
CREATE TABLE IF NOT EXISTS app_user (
    id              BIGSERIAL PRIMARY KEY,      -- Auto-increment unique ID
    email           VARCHAR(255) NOT NULL UNIQUE, -- Login email (duplicate nahi ho sakta!)
    password_hash   VARCHAR(255) NOT NULL,      -- BCrypt hash (actual password KABHI store nahi!)
    display_name    VARCHAR(100) NOT NULL,      -- User ka naam
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE, -- Admin hai ya nahi
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- Kab register kiya
);
```

> **Security Insight:** `password_hash` column mein BCrypt hash store hota hai — `$2a$10$ABC123...` jaisa. Actual password KABHI database mein nahi jaata. Agar koi database hack bhi kar le, passwords safe hain!

#### 2. `generation` — Har Audio ka Record

```sql
-- File: schema.sql (Line 26-37)
CREATE TABLE IF NOT EXISTS generation (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES app_user(id) ON DELETE CASCADE,  -- Kaun generate kiya
    project_id      BIGINT REFERENCES project(id) ON DELETE SET NULL,  -- Kis project mein
    voice_id        BIGINT NOT NULL REFERENCES voice(id),               -- Kaunsi voice use hui
    input_text      TEXT NOT NULL,             -- Kya text diya tha
    char_count      INT NOT NULL,              -- Kitne characters the
    audio_path      VARCHAR(500),              -- WAV file kahan saved hai
    duration_seconds NUMERIC(6,2),             -- Audio kitne seconds ka hai
    status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending → success/failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **Business Insight:** `generation` table = Poora **audit trail**. Har TTS request ka record hai — success ya fail, kitne characters, kaunsi voice. Ye data business decisions ke liye GOLD hai!

#### 3. `usage_daily` — Daily Quota Tracking

```sql
-- File: schema.sql (Line 39-46)
CREATE TABLE IF NOT EXISTS usage_daily (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    usage_date          DATE NOT NULL,           -- Kaunsa din
    characters_used     INT NOT NULL DEFAULT 0,  -- Aaj kitne chars use kiye
    generation_count    INT NOT NULL DEFAULT 0,  -- Aaj kitni baar generate kiya
    UNIQUE(user_id, usage_date)                  -- Ek user ka ek din = ek row!
);
```

> **SaaS Insight:** Ye table **pricing model** ka foundation hai! Free tier: 5000 chars/day. Premium: 50000 chars/day. Enterprise: unlimited. Sirf ye ek column (`characters_used`) check karke tier enforce hota hai.

---

## 🏗️ LEVEL 3: Relationships — Tables kaise Connected hain

### Entity-Relationship Diagram:

```
╔═══════════════╗         ╔═══════════════╗
║   app_user    ║────────→║   project     ║
║   (Users)     ║ 1    N  ║   (Folders)   ║
╚═══════╦═══════╝         ╚═══════════════╝
        │ 1
        │         ╔═══════════════╗
        ├────────→║  generation   ║←──────────╔═══════════════╗
        │      N  ║  (Audios)     ║           ║    voice      ║
        │         ╚═══════╦═══════╝           ║  (Presets)    ║
        │                 │                   ╚═══════════════╝
        │         ╔═══════╩═══════╗
        │         ║synthesis_metric║
        │         ║ (Performance) ║
        │         ╚═══════════════╝
        │
        ├────────→╔═══════════════╗
        │      N  ║ usage_daily   ║
        │         ║ (Quota/day)   ║
        │         ╚═══════════════╝
        │
        ├────────→╔═══════════════╗
        │      N  ║interest_signal║
        │         ║ (Pay intent)  ║
        │         ╚═══════════════╝
        │
        └────────→╔═══════════════════╗       ╔═══════════════╗
               N  ║analytics_session  ║──────→║analytics_event║
                  ║ (Visitor session) ║  1  N ║ (Page views)  ║
                  ╚═══════════════════╝       ╚═══════════════╝
```

### CASCADE Rules — "Jab Delete karo toh kya hota hai?"

| Parent | Child | FK Column | ON DELETE | Kyun? |
|---|---|---|---|---|
| `app_user` | `project` | user_id | **CASCADE** | User delete → sab projects delete |
| `app_user` | `generation` | user_id | **CASCADE** | User delete → sab audios delete |
| `app_user` | `usage_daily` | user_id | **CASCADE** | User delete → usage data delete |
| `app_user` | `interest_signal` | user_id | **SET NULL** | User delete → par survey data RAKH lo! (business value) |
| `app_user` | `analytics_session` | user_id | **SET NULL** | User delete → par analytics data RAKH lo! |
| `project` | `generation` | project_id | **SET NULL** | Project delete → audio orphan ban jaaye, delete nahi |
| `generation` | `synthesis_metric` | generation_id | **CASCADE** | Audio delete → performance data bhi delete |
| `analytics_session` | `analytics_event` | session_id | **CASCADE** | Session delete → events bhi delete |

> **🧠 Mental Model:**
> - **CASCADE** = "Baap gaya toh bachche bhi gaye" (user → projects, generations)
> - **SET NULL** = "Baap gaya par bachche orphanage mein safe hain" (user → interest data, analytics)
> - **No action** = "Isko kabhi delete mat karna" (voice table → soft-delete via `is_available` flag)

---

## 🏗️ LEVEL 4: SQL Patterns — Raw SQL ki Taakat

### Pattern 1: Atomic UPSERT (usage_daily)

```sql
-- "Agar aaj ka row hai toh update karo, nahi toh insert karo — EK hi query mein!"
INSERT INTO usage_daily (user_id, usage_date, characters_used, generation_count)
VALUES (42, '2024-01-15', 500, 1)
ON CONFLICT (user_id, usage_date) DO UPDATE
SET characters_used = usage_daily.characters_used + EXCLUDED.characters_used,
    generation_count = usage_daily.generation_count + 1;
```

> **Kyun important?** Agar do requests SAME waqt aayein toh race condition nahi hogi! PostgreSQL atomically handle karta hai.

### Pattern 2: Idempotent INSERT (analytics_session)

```sql
-- "Agar session pehle se hai toh kuch mat karo, nahi hai toh insert karo"
INSERT INTO analytics_session (session_id, anonymous_id, user_id, ip_hash, ...)
VALUES ('uuid-123', 'anon-456', NULL, 'hash-789', ...)
ON CONFLICT DO NOTHING;
```

> **Kyun important?** Frontend bar-bar beacon bhejta hai. Duplicate session insert nahi hona chahiye.

### Pattern 3: JSONB for Flexible Data (analytics_event)

```sql
-- JSON data directly PostgreSQL mein store karo — schema change ki zaroorat nahi!
INSERT INTO analytics_event (session_id, event_name, route, properties)
VALUES ('uuid-123', 'generate_click', '/studio',
        '{"voice": "M1", "chars": 150, "quality": "High"}'::jsonb);
```

> **Kyun important?** Har event ke alag properties ho sakte hain. JSONB column = flexibility + queryability.

### Pattern 4: User-Scoped Queries (Security!)

```sql
-- HAMESHA WHERE user_id = ? lagao — dusre user ka data KABHI nahi dikhna chahiye!
SELECT * FROM generation WHERE id = 42 AND user_id = 7;   -- ✅ SAFE
SELECT * FROM generation WHERE id = 42;                     -- ❌ UNSAFE (koi bhi dekh lega!)
```

> **Security Rule:** Har query mein `WHERE user_id = ?` → Row-level data isolation. Ye SaaS ka FUNDAMENTAL rule hai.

### Pattern 5: Aggregate Queries (Admin Dashboard)

```sql
-- Business metrics ek query se nikalo
SELECT
    COUNT(*) AS total_generations,
    COUNT(*) FILTER (WHERE status = 'success') AS successful,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7_days,
    SUM(char_count) AS total_characters,
    AVG(synthesis_ms) AS avg_synthesis_ms
FROM generation;
```

> **Business Insight:** Ye queries Admin Dashboard power karti hain — "aaj kitne users aaye?", "average generation time kya hai?", "kaunsi voice sabse popular hai?"

---

## 🏗️ LEVEL 5: Indexes — Performance ka Secret Weapon

### Index kya hai?

```
Bina Index:
    "Sumit ka record dhundho" → Poora table scan karo (10 lakh rows!) → SLOW ⏱️

Index ke saath:
    "Sumit ka record dhundho" → Index check karo → Direct jump → FAST ⚡
```

> **Analogy:** Index = Library ka catalogue card. Bina catalogue ke puri library mein kitaab dhundhni padegi!

### Tere Project ke Indexes:

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| `idx_analytics_event_name` | `analytics_event` | `event_name` | "Saare page_view events dhundho" — fast filter |
| `idx_analytics_event_created_at` | `analytics_event` | `created_at` | "Last 7 days ke events" — time range queries |
| `idx_analytics_session_created` | `analytics_session` | `created_at` | Daily/weekly session counts |
| `idx_analytics_session_anon` | `analytics_session` | `anonymous_id` | Unique visitor counting |
| `idx_generation_status` | `generation` | `(status, created_at)` | **Compound index!** — "Successful generations in last 30 days" |

### Compound Index explained:

```sql
-- idx_generation_status ON generation(status, created_at)
-- Ye DO columns pe ek saath index hai!

SELECT COUNT(*) FROM generation
WHERE status = 'success'
AND created_at >= NOW() - INTERVAL '30 days';

-- PostgreSQL pehle 'success' filter karega (index),
-- phir within that, date range filter karega (same index).
-- Ek index se dono conditions cover!
```

### Implicit Indexes (UNIQUE constraints):

```
UNIQUE(email)              → PostgreSQL automatically creates index on email
UNIQUE(engine_voice_id)    → Automatic index on voice IDs
UNIQUE(user_id, usage_date)→ Automatic compound index → upsert fast!
UNIQUE(session_id)         → Automatic index on session lookups
```

> **Interview tip:** "Humne compound index (status, created_at) banaya admin dashboard queries optimize karne ke liye — pehle status filter hota hai, phir time range. Index order matters because of B-Tree's leftmost prefix rule."

---

## 🏗️ LEVEL 6: Data Flow Lifecycle — "Button se DB tak"

### Flow 1: User Registration

```
POST /api/auth/register { email, password, displayName }
    ↓
AuthController → passwordEncoder.encode(password) → BCrypt hash
    ↓
INSERT INTO app_user (email, password_hash, display_name)
VALUES ('sumit@email.com', '$2a$10$xyz...', 'Sumit');
    ↓
Return JWT token → Angular stores in localStorage
```

### Flow 2: TTS Generation (MOST IMPORTANT!)

```
POST /api/tts/generate { text, voiceId: "M1", projectId: 5 }
    ↓
Step 1: SELECT characters_used FROM usage_daily
        WHERE user_id = 42 AND usage_date = '2024-01-15';
        → Result: 3500 (limit 5000, text 500 chars → 3500+500=4000 < 5000 ✅)
    ↓
Step 2: SELECT id FROM voice WHERE engine_voice_id = 'M1';
        → Result: voice DB id = 1
    ↓
Step 3: INSERT INTO generation (user_id, project_id, voice_id, input_text,
        char_count, status) VALUES (42, 5, 1, 'Hello world', 11, 'pending');
        → Returns: generation_id = 789
    ↓
Step 4: HTTP POST to FastAPI /synthesize → WAV bytes return
    ↓
Step 5: Save WAV to filesystem: backend-data/audio/42/789.wav
    ↓
Step 6: UPDATE generation SET status = 'success',
        audio_path = '/data/audio/42/789.wav',
        duration_seconds = 2.5
        WHERE id = 789;
    ↓
Step 7: INSERT INTO usage_daily (user_id, usage_date, characters_used, generation_count)
        VALUES (42, '2024-01-15', 11, 1)
        ON CONFLICT (user_id, usage_date) DO UPDATE
        SET characters_used = usage_daily.characters_used + 11,
            generation_count = usage_daily.generation_count + 1;
    ↓
Step 8: Return WAV bytes + X-Generation-Id: 789 header
```

### Flow 3: Account Deletion (CASCADE in action!)

```
DELETE /api/me
    ↓
Step 1: SELECT audio_path FROM generation
        WHERE user_id = 42 AND audio_path IS NOT NULL;
        → Find all WAV files on disk
    ↓
Step 2: Delete each WAV file from filesystem
    ↓
Step 3: DELETE FROM app_user WHERE id = 42;
        → PostgreSQL CASCADE automatically deletes:
          • All rows in project WHERE user_id = 42
          • All rows in generation WHERE user_id = 42
          • All rows in usage_daily WHERE user_id = 42
        → PostgreSQL SET NULL automatically:
          • interest_signal.user_id = NULL (survey data saved!)
          • analytics_session.user_id = NULL (analytics saved!)
    ↓
Step 4: Return 204 No Content → Angular redirects to landing page
```

---

## 🏗️ LEVEL 7: Security at Database Level

### 1. Password Hashing (NEVER store plain text!)

```
User enters: "MyP@ss123"
                ↓
BCryptPasswordEncoder.encode("MyP@ss123")
                ↓
DB stores: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
                ↓
Login check: BCryptPasswordEncoder.matches("MyP@ss123", hash) → true ✅
```

### 2. SQL Injection Prevention (Parameterized Queries)

```java
// ❌ DANGEROUS — SQL injection vulnerability!
String sql = "SELECT * FROM app_user WHERE email = '" + email + "'";
// Attacker sends: email = "' OR '1'='1"
// Query becomes: SELECT * FROM app_user WHERE email = '' OR '1'='1' → ALL users!

// ✅ SAFE — JdbcTemplate parameterized query
jdbcTemplate.query("SELECT * FROM app_user WHERE email = ?", rowMapper, email);
// ? is replaced safely — no injection possible!
```

### 3. IP Hashing (Privacy-friendly Analytics)

```java
// Raw IP: 192.168.1.100
// Hash: SHA-256("192.168.1.100" + "w2v-salt-99")
// Stored: "a3f2b8c9d1e4..." (irreversible!)
```

> **GDPR/Privacy:** IP address directly store karna privacy violation ho sakta hai. Hash karo + salt lagao → user identify nahi ho sakta par analytics accurate rehta hai.

---

## 🏗️ LEVEL 8: Business Intelligence Tables

### Analytics System — "Kaun aa raha hai, kya kar raha hai?"

```
User opens website
    ↓
Angular AnalyticsService → POST /api/public/analytics/events
    ↓
┌─────────────────────────────────────────────┐
│ analytics_session                           │
│   session_id: "uuid-browser-tab"            │
│   anonymous_id: "uuid-localStorage"         │ ← Unique visitor tracking
│   device_type: "desktop"                    │
│   browser: "Chrome"                         │
│   referrer: "https://google.com"            │ ← Kahan se aaya?
└─────────────────────────────────────────────┘
            │ 1:N
            ↓
┌─────────────────────────────────────────────┐
│ analytics_event                             │
│   event_name: "page_view"                   │
│   route: "/studio"                          │
│   properties: {"viewport": "1920x1080"}     │ ← JSONB flexibility!
│                                             │
│   event_name: "generate_click"              │
│   properties: {"voice":"M1","chars":150}    │ ← User behavior tracking
└─────────────────────────────────────────────┘
```

### Interest Signal — "Kya log pay karenge?"

```sql
-- Monetization research data!
INSERT INTO interest_signal (user_id, would_pay, suggested_price_inr, comment)
VALUES (42, 'yes', 299, 'Great product, would pay monthly');
```

> **Business Insight:** Ye table DIRECTLY pricing decisions inform karti hai:
> ```sql
> SELECT would_pay, COUNT(*) as count,
>        AVG(suggested_price_inr) as avg_price
> FROM interest_signal
> GROUP BY would_pay;
> -- Result: yes=45 (avg ₹250), maybe=30 (avg ₹150), no=15
> -- → Majority willing to pay ~₹250/month! Launch premium tier! 🚀
> ```

### Site Daily Stats — Pre-aggregated Dashboard

```sql
-- Har din ka snapshot — admin dashboard instant load ke liye
SELECT * FROM site_daily_stats ORDER BY stat_date DESC LIMIT 30;
-- Fast because: ek row per day, not scanning millions of events!
```

---

## 🏗️ LEVEL 9: Production & Scaling

### Connection Pooling (HikariCP)

```yaml
# Production config:
spring.datasource.hikari:
  maximum-pool-size: 5      # Max 5 connections (Neon free tier limit!)
  minimum-idle: 2            # Always keep 2 connections warm
  idle-timeout: 600000       # Close idle after 10 minutes
  max-lifetime: 1800000      # Recycle connections every 30 minutes
```

```
Request 1 → Pool gives Connection A → Query → Return A to pool ✅
Request 2 → Pool gives Connection B → Query → Return B to pool ✅
Request 3 → Pool gives Connection A (reused!) → Query → Return ✅
...
Request 6 → Pool full (5 max) → WAIT until connection available...
```

> **Business Insight:** Neon free tier = 5 connections max. HikariCP pool se manage karo. Agar 100 users ek saath aayein, sirf 5 DB connections reuse hoti hain — baaki queue mein wait karte hain.

### Idempotent Schema Migrations

```sql
-- schema.sql har startup pe chalta hai, par safe hai kyunki:
CREATE TABLE IF NOT EXISTS app_user (...);  -- Agar hai toh skip!
ALTER TABLE generation ADD COLUMN IF NOT EXISTS is_liked BOOLEAN NOT NULL DEFAULT FALSE;
-- Column pehle se hai? → Skip! Nahi hai? → Add! → Safe evolution!
```

> **Interview tip:** "Humne JPA migrations (Flyway/Liquibase) ki jagah idempotent DDL statements use kiye — `IF NOT EXISTS` aur `ADD COLUMN IF NOT EXISTS` se schema evolution safe hoti hai bina migration scripts manage kiye."

---

## 🏗️ LEVEL 10: Interview + Business POV

### 🎤 Interview mein Database explain karo:

#### 1. Schema Design
> "11 PostgreSQL tables hain — core business (users, projects, generations), quota management (usage_daily with atomic upsert), analytics (session + events with JSONB), aur business intelligence (interest_signal, site_daily_stats). No JPA — raw JdbcTemplate for full SQL control."

#### 2. Data Integrity
> "Foreign keys with thoughtful CASCADE rules — user deletion cascades to their content but SET NULL on analytics/interest data to preserve business intelligence. Unique constraints prevent duplicates. NOT NULL constraints enforce data quality."

#### 3. Performance
> "Compound index on generation(status, created_at) optimizes admin dashboard queries. JSONB for flexible event properties without schema changes. Pre-aggregated site_daily_stats table for O(1) dashboard loads instead of scanning millions of rows."

#### 4. Security
> "BCrypt password hashing, parameterized SQL queries (no injection), SHA-256 IP hashing for privacy-compliant analytics, row-level user_id filtering on every query."

#### 5. Monetization Foundation
> "usage_daily enables config-driven tiered pricing. interest_signal collects willingness-to-pay data. analytics tables track user behavior funnel. All designed to support a freemium-to-premium business model."

### 💼 Business POV — Database = Business Foundation

```
╔══════════════════════════════════════════════════════════════╗
║  SaaS Database Design Checklist:                              ║
║                                                                ║
║  ✅ MULTI-TENANCY → user_id on every query                    ║
║     "Har user sirf apna data dekhe"                           ║
║                                                                ║
║  ✅ AUDIT TRAIL → generation table tracks every request        ║
║     "Kya hua, kab hua, kaun ne kiya — sab recorded"           ║
║                                                                ║
║  ✅ QUOTA SYSTEM → usage_daily with atomic upsert              ║
║     "Free tier enforce karo, premium pe upgrade karo"          ║
║                                                                ║
║  ✅ ANALYTICS → session + events + JSONB                       ║
║     "User behavior samjho → product improve karo"              ║
║                                                                ║
║  ✅ MONETIZATION DATA → interest_signal                        ║
║     "Pay karne ki ichha hai? Kitna? → Pricing decide karo"    ║
║                                                                ║
║  ✅ PERFORMANCE → Indexes + pre-aggregated stats               ║
║     "Admin dashboard mein 2 second nahi lagni chahiye"         ║
║                                                                ║
║  ✅ SOFT DELETE → voice.is_available flag                       ║
║     "Delete mat karo, disable karo — data preserve rakhni"    ║
║                                                                ║
║  ✅ IDEMPOTENT OPERATIONS → ON CONFLICT DO NOTHING/UPDATE      ║
║     "Retry-safe queries — duplicate insert panic nahi"         ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🔥 PRACTICE EXERCISE

### Kisi bhi database schema mein ye dhundh:

| # | Kya dhundhna hai | Kahan milega | Kyun important hai |
|---|---|---|---|
| 1 | Primary Keys | `BIGSERIAL PRIMARY KEY` | Unique identification |
| 2 | Foreign Keys | `REFERENCES table(id)` | Table relationships |
| 3 | CASCADE rules | `ON DELETE CASCADE/SET NULL` | Data integrity |
| 4 | Unique constraints | `UNIQUE(col1, col2)` | Duplicate prevention |
| 5 | Indexes | `CREATE INDEX` | Query performance |
| 6 | Default values | `DEFAULT now()`, `DEFAULT FALSE` | Data initialization |
| 7 | JSONB columns | `properties JSONB` | Flexible schema |
| 8 | Upsert patterns | `ON CONFLICT DO UPDATE` | Atomic operations |
| 9 | User scoping | `WHERE user_id = ?` | Multi-tenancy security |
| 10 | Aggregations | `COUNT, SUM, AVG, FILTER` | Business metrics |

---

## 📌 Full Stack Database Connection

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  Angular           Spring Boot          PostgreSQL            ║
║  ───────           ───────────          ──────────            ║
║  Button click  →   @PostMapping     →   INSERT INTO          ║
║  Form data     →   @RequestBody     →   Column values        ║
║  ngFor list    ←   List<Map>        ←   SELECT ... FROM      ║
║  Error dialog  ←   AppException     ←   Constraint violation ║
║  Auth guard    →   JwtFilter        →   WHERE user_id = ?    ║
║  HttpClient    →   JdbcTemplate     →   PreparedStatement    ║
║                                                              ║
║  Frontend State    Service State      Database State          ║
║  ─────────────     ─────────────      ──────────────          ║
║  signal()      ↔   @Service field  ↔   Table row             ║
║  Temporary         In-memory           Permanent!             ║
║  Lost on refresh   Lost on restart     Survives everything!   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

> **Sumit, ab tu TEEN layers samajhta hai — Angular (UI), Spring Boot (Logic), Database (Storage). Ye TEENON milke ek full product banate hain. Frontend temporary hai, backend in-memory hai, database PERMANENT hai. Isliye database design sahi hona SABSE important hai — baaki sab rebuild ho sakta hai, data nahi! 💪**

---

*Document based on analysis of [words2voice schema.sql](file:///home/sumit/Documents/GitHub/TTS-Website/backend/target/classes/schema.sql), [data.sql](file:///home/sumit/Documents/GitHub/TTS-Website/backend/target/classes/data.sql), and [database_blueprint.md](file:///home/sumit/Documents/GitHub/TTS-Website/database_blueprint.md) — PostgreSQL, JdbcTemplate, 11 tables, atomic upserts, JSONB analytics.*
