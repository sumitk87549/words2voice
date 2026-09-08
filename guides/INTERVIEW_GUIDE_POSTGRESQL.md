# 🐘 PostgreSQL Database — Comprehensive Interview Guide (Hinglish)

> **Interview Goal**: Iss guide ko padhne ke baad aap database design, table relationships, foreign key cascading, atomic upserts (`ON CONFLICT DO UPDATE`), JSONB usage, aur indexing strategy ko 100% confidence ke saath explain kar payenge.

---

## 1. Database Architecture & Overview

Aapka application database **PostgreSQL** par running hai (Local par standard PostgreSQL aur Production me Neon Serverless PostgreSQL).

### Core Database Configuration:
1. **Idempotent Initialization**: Schema [`schema.sql`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/resources/schema.sql) aur Seed Data [`data.sql`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/resources/data.sql) application startup par automatic run hote hain (`spring.sql.init.mode: always`). Saare DDL statements `CREATE TABLE IF NOT EXISTS` use karte hain.
2. **Connection Pooling**: HikariCP connection pool configured hai (Production limits: `maximum-pool-size: 5`, `minimum-idle: 2`, `idle-timeout: 10m`).
3. **No ORM Overhead**: Access layer pure `JdbcTemplate` raw SQL operates karta hai without JPA overhead.

---

## 2. Table Schemas & Entity Relationships (11 Tables)

Aap database schema ko inspect karne ke liye niche diye gaye files ko ref kar sakte hain:
- [`schema.sql`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/resources/schema.sql) — 124 lines of complete DDL definition.
- [`data.sql`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/resources/data.sql) — Voice catalogue initial seed inserts.
- [`DashboardRepository.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/repository/DashboardRepository.java) — All custom native SQL queries.

### Summary of Tables:

1. **`app_user`**: User accounts (id, email, password_hash, display_name, is_admin, created_at).
2. **`voice`**: Pre-seeded TTS voices (`M1`–`M5`, `F1`–`F5`, display_name, gender, style_tag).
3. **`project`**: User folders grouping generations (user_id FK).
4. **`generation`**: Main TTS generation records (user_id FK, project_id FK, voice_id FK, input_text, char_count, audio_path, duration_seconds, status: `'pending'`/`'success'`/`'failed'`).
5. **`usage_daily`**: Quota tracking per user per day (user_id FK, usage_date, characters_used, generation_count).
6. **`contact_message`**: Public contact form submissions.
7. **`interest_signal`**: Monetisation interest survey responses (`would_pay`, `suggested_price_inr`).
8. **`analytics_session`**: Per-tab browser session metadata (session_id UUID, anonymous_id UUID, ip_hash, device_type, browser).
9. **`analytics_event`**: Granular UI event log (session_id FK, event_name, route, properties JSONB).
10. **`synthesis_metric`**: Audio synthesis performance metrics (synthesis_ms, real-time-factor RTF).
11. **`site_daily_stats`**: Aggregated daily snapshots for fast admin dashboard loading.

---

## 3. Key Database Paradigms & SQL Patterns

### A. Foreign Key Cascade Strategies (`CASCADE` vs `SET NULL`)
- **`ON DELETE CASCADE`**: User specific private data par apply hota hai.
  - Jab ek user account (`app_user`) delete hota hai, toh uske saare private `project`, `generation`, aur `usage_daily` records automatically cascade delete ho jaate hain.
- **`ON DELETE SET NULL`**: Business analytics aur feedback data par apply hota hai.
  - Jab user account delete hota hai, toh unke submitted `interest_signal` aur `analytics_session` records delete NAHI hote; balki unka `user_id` FK field `NULL` set ho jata hai. Isse platform analytics overall disrupt nahi hote.

### B. Atomic Upsert Pattern (`ON CONFLICT ... DO UPDATE`)
- **Problem**: Har user ko per day 5,000 characters limit allocation hai. Multiple concurrent requests par agar select-then-update kiya jaye, toh **Race Condition** ho sakti hai aur character limit bypass ho sakti hai.
- **Solution**: Postgres atomic upsert using `ON CONFLICT (user_id, usage_date) DO UPDATE`.
  - SQL: `INSERT INTO usage_daily (user_id, usage_date, characters_used, generation_count) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, usage_date) DO UPDATE SET characters_used = usage_daily.characters_used + EXCLUDED.characters_used, generation_count = usage_daily.generation_count + 1;`
  - Yeh single database lock me update perform karta hai, ensuring 100% thread safety and accuracy under heavy load.

### C. JSONB Data Type for Dynamic Analytics
- `analytics_event.properties` column me **JSONB** (Binary JSON) use kiya gaya hai.
- Standard relational columns har naye frontend event property ke liye Naye Database Migration schema alter require karti. JSONB flexiblity deta hai me arbitrary structured key-value pairs (jaise `{ "device": "mobile", "quality": "High", "viewport": "1920x1080" }`) without schema modification store kar sakein.

### D. Performance Indexing Strategy
- **Compound Index**: `idx_generation_status` on `(status, created_at)` — Admin metrics query status check aur date sorting fast karti hai.
- **Event Filter Index**: `idx_analytics_event_name` on `(event_name)` — Event specific analytics aggregate standard scans se 10x fast execute hote hain.
- **Session Lookup Index**: `idx_analytics_session_anon` on `(anonymous_id)` — Anonymous visitor track karna instant ho jata hai.

---

## 4. Top Interview Questions & Practical Answers (Hinglish)

### Q1: Aapka Database Schema design kaisa hai aur key relationships explain karo.
**Answer (Interview Script)**:
> *"Humara database normalized relational model baseline hai with 11 tables. Main central entities `app_user`, `voice`, `project`, aur `generation` hain. Ek user multiple projects aur audio generations own karta hai (`1-to-N` relation). High performance analytics ke liye humne session-based tracking (`analytics_session` aur `analytics_event`) build ki hai. Data integrity maintain karne ke liye foreign keys ON DELETE CASCADE (user's private data) aur ON DELETE SET NULL (anonymous analytics signals) clearly demarcated hain."*

### Q2: Quota Tracking me Race Conditions se bachne ke liye SQL me kya kiya?
**Answer (Interview Script)**:
> *"User daily character quota (`usage_daily` table) tracking me atomic upsert pattern (`ON CONFLICT DO UPDATE`) use kiya hai. Multi-threaded environment me Pehle READ karke FIR WRITE karne se Race Condition paida hoti hai. Iss se bachne ke liye maine single atomic SQL query me INSERT or UPDATE execute kiya (`INSERT ... ON CONFLICT (user_id, usage_date) DO UPDATE SET characters_used = usage_daily.characters_used + EXCLUDED.characters_used`). Yeh PostgreSQL internal row lock handle karke exact concurrency safety guarantee karta hai."*

### Q3: Foreign Key `CASCADE` aur `SET NULL` me kya difference hai aur aapne kaha use kiya?
**Answer (Interview Script)**:
> *"CASCADE primary key delete hone par dependent child rows ko bhi delete kar deta hai. Maine ise `app_user` -> `generation` aur `project` par lagaya taaki user account delete karne par unka sensitive textual data wipe out ho jaye. Wahi `SET NULL` child record ko retain karke foreign key value NULL kar deta hai. Ise maine `interest_signal` aur `analytics_session` me apply kiya taaki user deletion ke baad bhi platform level analytical metrics corrupt na hon."*

### Q4: PostgreSQL me JSONB data type kyun use kiya? Plain VARCHAR ya text kyun nahi?
**Answer (Interview Script)**:
> *"Analytics event tracking (`analytics_event.properties`) highly dynamic hota hai—har UI event ke properties alag hote hain. Plain VARCHAR me JSON strings format me store karne par queries execute nahi hoti. JSONB PostgreSQL ka binary JSON format hai jo JSON data validate karta hai, efficient space utilize karta hai, aur sabse important ispar PostgreSQL native GIN indexes aur `@>` JSON querying operators run kar sakte hain."*

### Q5: Aapne Indexes kaise select kiye?
**Answer (Interview Script)**:
> *"Maine query access patterns inspect karke target indexes create kiye. Generation table me Admin Dashboard frequent filter status check karta hai (`status = 'success'`), iske liye Maine Compound Index `idx_generation_status (status, created_at)` banaya. Analytics queries me event name par filtering ke liye `idx_analytics_event_name` index lagaya. Excessive indexing se INSERT speed reduce ho sakti hai, isliye sirf WHERE aur JOIN columns target kiye hain."*

---

## Summary Checklist for Interview
- [x] **Schema**: 11 Relational Tables with PostgreSQL
- [x] **Concurrency Safety**: Atomic `ON CONFLICT DO UPDATE` upserts
- [x] **Data Integrity**: Clean `CASCADE` vs `SET NULL` foreign key rules
- [x] **Semi-Structured Data**: JSONB for flexible analytics payload
- [x] **Optimization**: Compound & Single-column B-Tree indexes
