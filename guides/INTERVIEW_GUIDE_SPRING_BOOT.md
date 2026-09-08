# 🍃 Spring Boot Backend — Comprehensive Interview Guide (Hinglish)

> **Interview Goal**: Iss guide ko padhne ke baad aap interviewer ko Spring Boot architecture, Spring Security JWT authentication flow, raw SQL JdbcTemplate choice, Semaphore concurrency control, Spring Retry, aur Global Exception Handling crystal-clear Hinglish me explain kar payenge.

---

## 1. High-Level Architecture & Core Decisions

Aapka Backend ek **Spring Boot 4.1 (Java 17)** microservice-ready REST API application hai. 

### Key Architectural Choices:
1. **Layered Architecture**: Standard Separation of Concerns — `Controller` (HTTP REST endpoints) -> `Service` (Business logic, transactions, concurrency) -> `Repository` (Data access layer).
2. **JdbcTemplate Over JPA/Hibernate**: Hibernate ORM ki jagah raw SQL with `JdbcTemplate` use kiya gaya hai. Isse zero N+1 query problem, lower memory footprint, aur queries par 100% control milta hai.
3. **Stateless JWT Authentication**: Spring Security ke saath JSON Web Tokens (JWT) using HMAC-SHA256 signature. Stateful HTTP Session disable ki gayi hai (`SessionCreationPolicy.STATELESS`).
4. **Concurrency Rate Protection (Semaphore)**: Downstream FastAPI TTS Engine over-saturate na ho, iske liye fair `Semaphore(3)` permits limit apply kiye hain.
5. **Fault Tolerance (Spring Retry)**: `SupertonicClient` me `@Retryable` and `@Recover` annotations se transient network failures ko auto-retry (exponential backoff) kiya jata hai.
6. **Immutable DTOs using Java Records**: Request aur Response transfer ke liye Java `record` types use hue hain `@Valid` (Hibernate Validator) annotations ke saath.

---

## 2. Important Files & Folder Structure

Aap code files ko inspect karne ke liye niche diye gaye file links ref kar sakte hain:

- **Security & JWT Auth**:
  - [`SecurityConfig.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/SecurityConfig.java) — Security filter chain, CORS rules, BCrypt password encoder, route authorization.
  - [`JwtAuthFilter.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/JwtAuthFilter.java) — `OncePerRequestFilter` jo har HTTP request se `Authorization: Bearer` header extract karke validate karta hai.
  - [`JwtService.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/JwtService.java) — Token generation, HMAC signing, claim extraction (username/email), validation logic.
  - [`CustomUserDetailsService.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/CustomUserDetailsService.java) — DB se user details load karke `ROLE_USER` ya `ROLE_ADMIN` grant karta hai.

- **Core Services & Business Logic**:
  - [`TtsGenerationService.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/TtsGenerationService.java) — Full TTS orchestration: Daily character quota check, Semaphore acquisition, DB record creation, Audio storage.
  - [`SupertonicClient.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/client/SupertonicClient.java) — FastAPI TTS microservice HTTP client with Spring Retry (`@Retryable`).
  - [`RateLimitService.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/RateLimitService.java) — Sliding window in-memory rate limiter using `ConcurrentHashMap`.
  - [`AudioStorageService.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/AudioStorageService.java) — Disk storage management for generated `.wav` audio files.

- **Repositories & Data Access**:
  - [`AppUserRepository.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/repository/AppUserRepository.java) — User CRUD with raw SQL `JdbcTemplate`.
  - [`DashboardRepository.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/repository/DashboardRepository.java) — Generations, projects, daily usage atomic upsert SQLs.

- **Exception Handling & Controllers**:
  - [`GlobalExceptionHandler.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/exception/GlobalExceptionHandler.java) — `@RestControllerAdvice` for uniform JSON error responses.
  - [`GenerationController.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/GenerationController.java) — REST endpoint `POST /api/tts/generate`.
  - [`AuthController.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/AuthController.java) — REST endpoints for Login & Registration.

- **Actuator & Configuration**:
  - [`AppProperties.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/config/AppProperties.java) — Typed `@ConfigurationProperties(prefix = "app")`.
  - [`TtsEngineHealthIndicator.java`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/config/TtsEngineHealthIndicator.java) — Custom Spring Actuator health check calling Python service `/health`.

---

## 3. Key Design Patterns & Coding Paradigms

### A. Raw SQL `JdbcTemplate` Over JPA / Hibernate
- **Interview Pitch**: JPA/Hibernate microservices me complex join queries, DTO mapping overhead, aur unexpected N+1 select queries generate kar deta hai.
- **Solution**: Humne `JdbcTemplate` raw SQL rely kiya. Complex queries (jaise daily stats aggregations, atomic character quota upserts) ko native PostgreSQL SQL statements me exact optimize karke run kiya hai.

### B. Spring Security & JWT Authentication Request Lifecycle
1. Request hit hoti hai -> [`JwtAuthFilter`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/JwtAuthFilter.java) (extends `OncePerRequestFilter`).
2. Interceptor `Authorization` header read karta hai: `Bearer <token>`.
3. [`JwtService`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/JwtService.java) secret key (HS256) se signature verify karke email/username extract karta hai.
4. [`CustomUserDetailsService`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/CustomUserDetailsService.java) database check karke `UserDetails` object construct karta hai.
5. Filter `UsernamePasswordAuthenticationToken` banakar `SecurityContextHolder.getContext().setAuthentication(auth)` me set kar deta hai.
6. Controller level par current authenticated user ki identity easily extract ho jati hai.

### C. Concurrency Limit via `Semaphore`
- Audio generation (AI Text-to-Speech) ek CPU/GPU intensive process hai. Agar 50 users ek sath generation request bhej de, toh FastAPI server crash ya hang ho sakta hai.
- Solution: [`TtsGenerationService`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/TtsGenerationService.java) me `new Semaphore(3, true)` permits instanted hain.
  - Jab user generate karta hai, service `ttsSemaphore.tryAcquire(3, TimeUnit.SECONDS)` call karti hai.
  - Agar 3 slots already active hain aur 3 seconds me koi slot free nahi hota, toh `TtsEngineUnavailableException` (HTTP 503) throw hota hai.
  - Generation complete hone par `finally` block me `ttsSemaphore.release()` mandatory execute hota hai.

### D. Fault Tolerance using Spring Retry
- [`SupertonicClient`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/client/SupertonicClient.java) me external Python HTTP call hai.
- `@Retryable(retryFor = TtsEngineUnavailableException.class, maxAttempts = 2, backoff = @Backoff(delay = 1500, multiplier = 1.5))` apply kiya hai.
- Agar python server momentary busy hota hai, Spring Boot 1.5 seconds wait karke automatically re-try karta hai before failing to the user.

### E. Rate Limiting Architecture
- [`RateLimitService`](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/RateLimitService.java) in-memory sliding window algorithm implement karta hai using `ConcurrentHashMap`.
- Client IP address basis par public endpoints (e.g. preview audio max 30/hour, contact form max 5/hour) restrict kiye jaate hain.

---

## 4. Top Interview Questions & Practical Answers (Hinglish)

### Q1: Aapne Spring Data JPA/Hibernate ki jagah JdbcTemplate kyun use kiya?
**Answer (Interview Script)**:
> *"Hibernate abstract ORM layer prala karta hai par high-throughput ya analytical microservices me yeh unnecessary overhead aur hidden N+1 queries create kar deta hai. `JdbcTemplate` se hume SQL queries par complete control milta hai, response mapping faster hoti hai, memory footprint kam rahta hai, aur PostgreSQL specific features (jaise JSONB, `ON CONFLICT DO UPDATE` atomic upsert) hum directly run kar sakte hain."*

### Q2: JWT Authentication Flow Spring Security me kaise integrate kiya?
**Answer (Interview Script)**:
> *"Humne `SecurityConfig` ko stateless banaya (`SessionCreationPolicy.STATELESS`) aur CSRF disable kiya. Ek custom filter `JwtAuthFilter` implement kiya jo `OncePerRequestFilter` extend karta hai. Yeh filter incoming `Authorization` header se Bearer JWT token Parse karta hai, `JwtService` se HMAC-SHA256 signature aur expiration check karta hai, aur authenticated `UsernamePasswordAuthenticationToken` ko `SecurityContextHolder` me inject kar deta hai."*

### Q3: AI Service backend par heavy load hone par aapne server crash hone se kaise bachaya?
**Answer (Interview Script)**:
> *"Text-to-Speech synthesis heavy process hoti hai. Multi-threading crash se bachne ke liye maine double strategy use ki: First, `TtsGenerationService` me ek fair `Semaphore(3)` permit limit setup ki taaki maximum 3 concurrent audio synthesis calls hi FastAPI backend par jayein. Baaki calls queue hokar wait karti hain ya gracefully 503 Engine Busy error return karti hain. Second, `SupertonicClient` me Spring Retry (`@Retryable`) lagaya taaki transient timeouts auto-recover ho sakein."*

### Q4: Global Exception Handling kaise implemented hai?
**Answer (Interview Script)**:
> *"Humne `@RestControllerAdvice` annotation ke saath `GlobalExceptionHandler` banaya hai. Har custom domain exception (jaise `DailyLimitExceededException` for 429, `TextTooLongException` for 413, `TtsEngineUnavailableException` for 503) ko capture karke ek standardized JSON error response body (containing timestamp, status code, error code, message) me return karte hain. Isse frontend ko reliable aur consistent error structure milta hai."*

### Q5: DTOs ke liye Java Records kyun choose kiye?
**Answer (Interview Script)**:
> *"Java 14+ me introduced `record` types inherently immutable hote hain, compact syntactically hain, aur automatically `equals()`, `hashCode()`, `toString()` provide karte hain. Data Transfer Objects (DTOs) ke liye records best practice hain kyunki DTOs ko compile-time read-only hona chahiye. Humne record components par Hibernate Validation `@Valid` annotations (`@NotBlank`, `@Size`, `@Email`) lagaye hain."*

---

## Summary Checklist for Interview
- [x] **Stack**: Spring Boot 4.1 + Java 17
- [x] **Data Access**: `JdbcTemplate` with raw SQL queries
- [x] **Security**: Spring Security + JWT (`JwtAuthFilter`, `JwtService`)
- [x] **Concurrency**: `Semaphore(3)` fair rate protection
- [x] **Resilience**: `@Retryable` backoff on `SupertonicClient`
- [x] **Exception Handling**: `@RestControllerAdvice` + Java Records DTOs
