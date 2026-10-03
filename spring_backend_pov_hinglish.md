# ☕ Spring Boot ka "X-Ray Vision" — API Dekho, Architecture Samjho

> **Sumit, ye document tere backend ko crystal clear kar dega.** Angular POV mein tune UI → Code mapping sikhi. Ab Backend mein HTTP Request → DB tak poora flow samjhega. Ye dono documents milakar tujhe FULL STACK engineer banayenge.

---

## 🎯 Pehle Ye Samajh: Spring Boot kya SOLVE karta hai?

Frontend (Angular) mein user button click karta hai → HTTP request jaata hai.
**Spring Boot woh darwaza hai jo request receive karta hai, process karta hai, DB se baat karta hai, aur response bhejta hai.**

```
Angular                   Spring Boot                    Database
┌──────────┐   HTTP    ┌────────────────────────┐   SQL    ┌──────────┐
│  Button   │────────→ │ Controller → Service → │────────→ │ PostgreSQL│
│  click    │          │ Repository              │          │          │
│           │←────────│                          │←────────│          │
│  UI shows │ Response │ Exception Handler       │ Results │          │
│  result   │          │ Security Filter         │          │          │
└──────────┘          └────────────────────────┘          └──────────┘
```

### Angular ↔ Spring Mapping (Quick Reference)

| Angular Concept | Spring Boot Concept | Tere Project mein |
|---|---|---|
| `(click)="onSubmit()"` | `@PostMapping("/api/...")` | Button triggers API call |
| `HttpClient.post()` | `@RequestBody` receives data | Frontend bhejta, backend receive karta |
| `authInterceptor` (add JWT) | `JwtAuthFilter` (verify JWT) | Dono sides pe JWT handle hota hai |
| `errorInterceptor` (show dialog) | `GlobalExceptionHandler` (format error) | Dono sides pe error handle hota hai |
| `authGuard` (block routes) | `SecurityConfig` (block endpoints) | Frontend + Backend dono guard karte hain |
| `signal()` / `service` (state) | `@Service` (business logic) | State management both sides |
| Route `/studio` | Endpoint `/api/tts/generate` | URL mapping both sides |

---

## 🏗️ LEVEL 1: Request ka Poora Safar — URL se DB tak

### 🧠 "Jab user Generate Audio click karta hai, Spring mein kya hota hai?"

```
Step 1: Angular POST /api/tts/generate (with JWT + body)
           ↓
Step 2: ┌─── SecurityFilterChain ───┐
         │ CorsFilter → CORS check   │
         │ JwtAuthFilter → JWT verify │ ← Token valid? User kaun hai?
         │ AuthenticationProvider     │ ← DB se user check
         └───────────────────────────┘
           ↓ (authorized!)
Step 3: GenerationController.generate()     ← @PostMapping catches the request
           ↓
Step 4: @Valid → TtsGenerateRequest validate  ← DTO checks: text not empty, length OK
           ↓
Step 5: AuthenticatedUserService.userId()     ← JWT se email nikalo → DB se userId lo
           ↓
Step 6: TtsGenerationService.generate()       ← Business logic start!
         ├── Check daily limit (DB query)     ← SELECT from usage_daily
         ├── Acquire semaphore (concurrency)  ← Max 3 simultaneous TTS calls
         ├── Create generation record (DB)    ← INSERT INTO generation (status='pending')
         ├── Call FastAPI TTS service (HTTP)   ← SupertonicClient.synthesize()
         ├── Save WAV file (filesystem)       ← AudioStorageService.saveWav()
         ├── Update generation (DB)           ← UPDATE SET status='success'
         └── Update usage counter (DB)        ← UPSERT INTO usage_daily
           ↓
Step 7: Controller returns ResponseEntity<byte[]>
         ├── Headers: Content-Type: audio/wav
         ├── Headers: X-Generation-Id: 42
         └── Body: WAV bytes
           ↓
Step 8: Angular receives blob → URL.createObjectURL() → <audio> plays
```

> **Key Insight:** Spring Boot = **Traffic Controller** — har request ko verify karo, process karo, store karo, respond karo. Exactly like a real-life government office — pehle ID check (security), phir form verify (validation), phir processing (service), phir record (database), phir receipt (response). 😄

---

## 🏗️ LEVEL 2: Controller Layer — "Reception Desk"

### Controller = Woh banda jo pehle milta hai request ko

Tere project ka [GenerationController.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/GenerationController.java):

```java
@RestController    // ← "Main ek REST API handler hoon"
public class GenerationController {

    // Dependencies inject hote hain constructor se (DI)
    private final TtsGenerationService ttsGenerationService;
    private final AuthenticatedUserService authenticatedUserService;

    @PostMapping("/api/tts/generate")    // ← URL + HTTP method mapping
    public ResponseEntity<byte[]> generate(
            Authentication auth,                      // ← Spring Security auto-inject karta hai
            @Valid @RequestBody TtsGenerateRequest request  // ← JSON body → Java object + validate
    ) throws Exception {

        Long userId = authenticatedUserService.userId(auth);  // ← JWT se userId nikalo
        TtsGenerationService.GenerationResult result =
            ttsGenerationService.generate(userId, request);    // ← Service ko delegate karo

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("audio/wav"));
        headers.set("X-Generation-Id", String.valueOf(result.generationId()));

        return new ResponseEntity<>(result.audioBytes(), headers, HttpStatus.OK);
    }
}
```

### 🧠 MENTAL MODEL — Controller dekhte waqt kya sochna hai:

```
Koi bhi Controller file kholi?
    ↓
Step 1: @RequestMapping / class-level URL dekho → Base path kya hai?
    ↓
Step 2: Har method pe dekho:
    ├── @GetMapping / @PostMapping → HTTP method + URL
    ├── Parameters kya hain?
    │   ├── @RequestBody → Client ne JSON body bheja
    │   ├── @PathVariable → URL mein value hai (e.g., /api/generations/{id})
    │   ├── @RequestParam → Query string (e.g., ?page=1&size=10)
    │   ├── Authentication → Current logged-in user
    │   └── HttpServletRequest → Raw request (IP, headers, etc.)
    ├── @Valid → Bean validation automatically chalegi
    └── Return type kya hai?
        ├── ResponseEntity<T> → Full control (headers + status + body)
        ├── T directly → Spring 200 OK ke saath JSON return karega
        └── void → 200 OK, no body
    ↓
Step 3: Method ke andar dekho:
    ├── Service call(s) → Heavy lifting delegated
    ├── Exception throw? → GlobalExceptionHandler handle karega
    └── Response build → Headers, status code, body
```

### Tere Project ke Saare Controllers:

| Controller | URL Prefix | Auth Required? | Kya karta hai |
|---|---|---|---|
| [AuthController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/AuthController.java) | `/api/auth` | ❌ No | Register, Login → JWT return |
| [TtsController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/TtsController.java) | `/api/public/tts` | ❌ No | Voice list, Preview (rate-limited) |
| [GenerationController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/GenerationController.java) | `/api/tts` + `/api/generations` | ✅ Yes | Generate audio, Stream audio, Like |
| [UserController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/UserController.java) | `/api/me` | ✅ Yes | Profile get/update, Delete account |
| [ContactController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/ContactController.java) | `/api/public/contact` | ❌ No | Contact form submit (rate-limited) |
| [AnalyticsController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/AnalyticsController.java) | `/api/public/analytics` | ❌ No | Track events (fire-and-forget) |
| [AdminController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/AdminController.java) | `/api/admin` | ✅ ADMIN only | Stats, users, contacts dashboard |
| [HistoryController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/HistoryController.java) | `/api/history` | ✅ Yes | Past generations with pagination |
| [ProjectController](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/controller/ProjectController.java) | `/api/projects` | ✅ Yes | CRUD for user projects |

> **Angular analogy:**
> - `@RestController` = Angular ka `@Component` — ek handler unit
> - `@PostMapping("/api/tts/generate")` = Angular ka `{ path: 'studio', loadComponent: ... }` — URL mapping
> - `@RequestBody TtsGenerateRequest` = Angular ka `[(ngModel)]` — data receive karna

---

## 🏗️ LEVEL 3: Service Layer — "Engine Room"

### Service = Jahan ACTUAL kaam hota hai (business logic)

Controller sirf "receptionist" hai. **Service woh engineer hai jo actual kaam karta hai.**

Tere project ka BEST service — [TtsGenerationService.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/service/TtsGenerationService.java):

```java
@Service   // ← "Main ek business logic handler hoon, Spring mujhe manage kare"
public class TtsGenerationService {

    // Dependencies (Constructor Injection — BEST practice!)
    private final SupertonicClient supertonicClient;     // External API client
    private final DashboardRepository dashboardRepository; // DB access
    private final AudioStorageService audioStorageService;  // File system
    private final AppProperties appProperties;             // Config values

    private final Semaphore ttsSemaphore;  // Concurrency control!

    public GenerationResult generate(Long userId, TtsGenerateRequest request) {

        // 1️⃣ VALIDATION — business rules check
        if (text.length() > maxChars) throw new TextTooLongException(maxChars);

        // 2️⃣ QUOTA CHECK — daily limit enforcement
        Map<String, Object> usage = dashboardRepository.getUsageToday(userId);
        if (charsUsed + text.length() > dailyLimit)
            throw new DailyLimitExceededException(dailyLimit);

        // 3️⃣ CONCURRENCY CONTROL — max 3 TTS calls simultaneously
        boolean acquired = ttsSemaphore.tryAcquire(20, TimeUnit.SECONDS);
        if (!acquired) throw TtsEngineUnavailableException.busy();

        try {
            return doGenerate(userId, request, text);
        } finally {
            ttsSemaphore.release();  // ALWAYS release, even on error!
        }
    }

    @Transactional  // ← Agar kuch fail ho toh sab rollback!
    protected GenerationResult doGenerate(...) {
        // 4️⃣ DB INSERT — generation record (status='pending')
        Long generationId = dashboardRepository.createGeneration(...);

        try {
            // 5️⃣ EXTERNAL CALL — FastAPI TTS service
            byte[] audioBytes = supertonicClient.synthesize(...);

            // 6️⃣ FILE SAVE — WAV to filesystem
            File audioFile = audioStorageService.saveWav(userId, generationId, audioBytes);

            // 7️⃣ DB UPDATE — success
            dashboardRepository.updateGenerationSuccess(generationId, audioFile.getAbsolutePath(), 0.0);

            // 8️⃣ QUOTA UPDATE — increment daily usage
            dashboardRepository.upsertUsage(userId, text.length());

            return new GenerationResult(generationId, audioBytes);
        } catch (Exception e) {
            // 9️⃣ DB UPDATE — failure
            dashboardRepository.updateGenerationFailed(generationId);
            throw e;  // Re-throw → GlobalExceptionHandler catches
        }
    }
}
```

### 🧠 MENTAL MODEL — Service dekhte waqt kya sochna hai:

```
Service file kholi?
    ↓
Dekh: "Ye service KAUNSA business problem solve kar rahi hai?"
    ↓
Method ke andar dekh:
    ├── Validations → Business rules (not structural validation)
    ├── DB queries → Repository calls (read data)
    ├── External calls → Other services (HTTP clients)
    ├── State changes → DB writes (create, update, delete)
    ├── Side effects → File writes, email send, analytics
    └── Exception handling → try/catch with typed exceptions
    ↓
Design patterns dekh:
    ├── @Transactional → Sab ya kuch nahi (atomic operations)
    ├── Semaphore → Concurrency limit (kitne log ek saath?)
    ├── Try-finally → Resource cleanup (semaphore release)
    └── Typed exceptions → Clear error signaling
```

### Concurrency Pattern — Semaphore:

```
Imagine ek doctor ka clinic jismein sirf 3 chairs hain:

Request 1 → ttsSemaphore.acquire() ✅ (chair 1 le li)
Request 2 → ttsSemaphore.acquire() ✅ (chair 2 le li)
Request 3 → ttsSemaphore.acquire() ✅ (chair 3 le li)
Request 4 → ttsSemaphore.tryAcquire(20s) → ⏳ waits...
                                          → ❌ timeout! → 503 "Server busy"

Request 1 done → ttsSemaphore.release() → chair 1 khali!
Request 5 → ttsSemaphore.acquire() ✅ (chair 1 mili!)
```

> **Angular analogy:** Service mein `inject(StudioStateService)` = Spring mein Constructor Injection. Dono mein Services centralized logic hold karti hain.

---

## 🏗️ LEVEL 4: Repository Layer — "Database ka Darwaza"

### Repository = DB se baat karne ka SINGLE point

**Important: Tere project mein JPA/Hibernate NAHI hai — raw JdbcTemplate + SQL hai!**

Tere project ka [DashboardRepository.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/repository/DashboardRepository.java):

```java
@Repository  // ← "Main DB operations handle karta hoon"
public class DashboardRepository {

    private final JdbcTemplate jdbcTemplate;  // Spring ka SQL executor

    // READ — simple query
    public List<Map<String, Object>> getProjects(Long userId) {
        return jdbcTemplate.queryForList(
            "SELECT id, name, created_at FROM project WHERE user_id = ? ORDER BY created_at DESC",
            userId   // ← ? replaced safely (SQL injection prevention!)
        );
    }

    // CREATE — with auto-generated key return
    public Long createGeneration(Long userId, Long projectId, Long voiceId, ...) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO generation (user_id, project_id, voice_id, ..., status) VALUES (?, ?, ?, ..., ?)",
                new String[]{"id"}  // ← "id column ka auto-generated value chahiye"
            );
            ps.setObject(1, userId);
            ps.setObject(2, projectId);
            // ... set remaining params
            ps.setString(6, "pending");
            return ps;
        }, keyHolder);
        return keyHolder.getKey().longValue();  // ← Newly created row ka ID
    }

    // UPSERT — atomic increment (no race condition!)
    public void upsertUsage(Long userId, int charCount) {
        jdbcTemplate.update(
            "INSERT INTO usage_daily (user_id, usage_date, characters_used, generation_count) " +
            "VALUES (?, ?, ?, 1) " +
            "ON CONFLICT (user_id, usage_date) DO UPDATE " +
            "SET characters_used = usage_daily.characters_used + EXCLUDED.characters_used, " +
            "    generation_count = usage_daily.generation_count + 1",
            userId, Date.valueOf(LocalDate.now()), charCount
        );
    }
}
```

[AppUserRepository.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/repository/AppUserRepository.java) — with RowMapper:

```java
@Repository
public class AppUserRepository {

    // RowMapper: DB row → Java object
    private final RowMapper<AppUser> rowMapper = (rs, rowNum) -> new AppUser(
        rs.getLong("id"),
        rs.getString("email"),
        rs.getString("password_hash"),
        rs.getString("display_name"),
        rs.getBoolean("is_admin"),
        rs.getTimestamp("created_at").toInstant()
    );

    public Optional<AppUser> findByEmail(String email) {
        var results = jdbcTemplate.query(
            "SELECT * FROM app_user WHERE email = ?", rowMapper, email
        );
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }
}
```

### 🧠 JdbcTemplate vs JPA — Kya aur Kyun:

| | JdbcTemplate (tere project mein) | JPA/Hibernate (common approach) |
|---|---|---|
| **SQL** | Tu KHUD likhta hai | Auto-generate hota hai |
| **Control** | 100% tera | Framework decide karta hai |
| **Learning** | SQL expertise build hoti hai | Magic lagta hai |
| **Performance** | Tu optimize karta hai | Lazy loading traps, N+1 issues |
| **Boilerplate** | Zyada code likhna padta hai | Kam code, zyada magic |
| **Interview mein** | "I prefer JdbcTemplate for full SQL control" | "I use JPA for rapid development" |

> **Angular analogy:** `JdbcTemplate` = Angular mein `HttpClient` directly use karna. JPA = Angular mein koi high-level data library use karna jo abstractionLayer add kare.

---

## 🏗️ LEVEL 5: Security Chain — "Fort ka Pehra"

### Spring Security = Multi-layer defense system

Tere project ka [SecurityConfig.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/SecurityConfig.java):

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity  // ← @PreAuthorize enable karta hai
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(...)           // Cross-Origin Resource Sharing
            .csrf(csrf -> csrf.disable())  // REST API mein CSRF zaruri nahi
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))  // No sessions! JWT-based
            .authorizeHttpRequests(auth -> auth
                // PUBLIC — koi bhi access kar sakta hai
                .requestMatchers("/api/public/**", "/api/auth/**").permitAll()
                // ADMIN ONLY
                .requestMatchers("/actuator/**").hasRole("ADMIN")
                // AUTHENTICATED — JWT required
                .requestMatchers("/api/**").authenticated()
            )
            // JWT filter BEFORE username/password filter
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
```

### JWT Flow — Poora cycle:

```
╔═══════════════════════════════════════════════════════════╗
║                    REGISTRATION/LOGIN                      ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  Angular: POST /api/auth/login { email, password }         ║
║      ↓                                                     ║
║  AuthController:                                           ║
║    authenticationManager.authenticate(email, password)      ║
║      ↓                                                     ║
║    DaoAuthenticationProvider:                               ║
║      UserDetailsService.loadUserByUsername(email) → DB      ║
║      PasswordEncoder.matches(password, hash) → ✅ or ❌    ║
║      ↓                                                     ║
║    JwtService.generateToken(userDetails) → "eyJhbG..."     ║
║      ↓                                                     ║
║  Response: { token: "eyJhbG...", displayName: "Sumit" }    ║
║      ↓                                                     ║
║  Angular: localStorage.setItem('token', 'eyJhbG...')       ║
║                                                            ║
╠═══════════════════════════════════════════════════════════╣
║                    SUBSEQUENT REQUESTS                     ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  Angular authInterceptor: Authorization: Bearer eyJhbG...  ║
║      ↓                                                     ║
║  JwtAuthFilter.doFilterInternal():                         ║
║    1. Extract token from "Bearer ..." header               ║
║    2. jwtService.extractUsername(token) → email             ║
║    3. userDetailsService.loadUserByUsername(email)          ║
║    4. jwtService.isTokenValid(token, userDetails)           ║
║    5. Set SecurityContext → user is authenticated!          ║
║      ↓                                                     ║
║  Controller method gets Authentication parameter           ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

Tere project ka [JwtAuthFilter.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/security/JwtAuthFilter.java) — **har request pe chalta hai:**

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, ...) {
        // 1. Header se token nikalo
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);  // No token → skip, let Security decide
            return;
        }

        // 2. Token validate karo
        String jwt = authHeader.substring(7);
        String userEmail = jwtService.extractUsername(jwt);

        // 3. User load karo aur SecurityContext set karo
        UserDetails userDetails = userDetailsService.loadUserByUsername(userEmail);
        if (jwtService.isTokenValid(jwt, userDetails)) {
            UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authToken);
        }

        filterChain.doFilter(request, response);
    }
}
```

> **Angular analogy:**
> - `JwtAuthFilter` = Angular ka `authInterceptor` — har request pe kaam karta hai
> - `SecurityConfig.permitAll()` = Angular ka `guestGuard` — public routes
> - `SecurityConfig.authenticated()` = Angular ka `authGuard` — protected routes
> - `@PreAuthorize("hasRole('ADMIN')")` = Frontend mein `@if (profileService.isAdmin())`

---

## 🏗️ LEVEL 6: Exception Handling — "Ambulance System"

### GlobalExceptionHandler = Centralized error formatting

Tere project ka [GlobalExceptionHandler.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/exception/GlobalExceptionHandler.java):

```java
@RestControllerAdvice  // ← "Main SAARE controllers ke exceptions handle karunga"
public class GlobalExceptionHandler {

    // Domain-specific exceptions
    @ExceptionHandler(AppException.class)
    public ResponseEntity<ApiError> handleAppException(AppException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(ApiError.builder()
                .code(ex.getErrorCode())    // "DAILY_LIMIT_EXCEEDED"
                .status(ex.getStatus().value())  // 429
                .message(ex.getMessage())   // "Daily limit of 5000 chars exceeded"
                .build());
    }

    // Validation errors (@Valid failures)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(...) { ... }

    // Auth failures
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiError> handleBadCredentials(...) { ... }

    // CATCH-ALL — unexpected errors
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex) {
        log.error("Unhandled exception: {}", ex.getMessage(), ex);
        return ResponseEntity.status(500)
            .body(ApiError.builder().code("INTERNAL_ERROR").status(500)
                .message("An unexpected error occurred.").build());
    }
}
```

### Exception Hierarchy tere project mein:

```
Exception
├── AppException (base for all business errors)
│   ├── DailyLimitExceededException → 429 "DAILY_LIMIT_EXCEEDED"
│   ├── TextTooLongException        → 400 "TEXT_TOO_LONG"
│   ├── ValidationException         → 400 "EMAIL_ALREADY_EXISTS"
│   └── ResourceNotFoundException   → 404 "NOT_FOUND"
├── TtsEngineUnavailableException   → 503 "TTS_ENGINE_UNAVAILABLE"
├── TtsEngineTimeoutException       → 504 "TTS_ENGINE_TIMEOUT"
├── BadCredentialsException (Spring)→ 401 "INVALID_CREDENTIALS"
└── AccessDeniedException (Spring)  → 403 "ACCESS_DENIED"
```

```
Backend throws exception
    ↓
GlobalExceptionHandler catches it → formats as ApiError JSON:
    { "code": "DAILY_LIMIT_EXCEEDED", "status": 429, "message": "..." }
    ↓
Angular's errorInterceptor receives this JSON
    ↓
ErrorDisplayService reads the "code" field
    ↓
Shows beautiful error dialog with analogy + motivational quote! 🎨
```

> **Angular analogy:** Spring ka `@RestControllerAdvice` = Angular ka `errorInterceptor` + `ErrorDisplayService`. Dono centralized error handling karte hain — tu har jagah try/catch nahi likhta.

---

## 🏗️ LEVEL 7: External Service — "Dusri Dukaan se Saamaan Mangwana"

### SupertonicClient = Spring ↔ FastAPI communication

Tere project ka [SupertonicClient.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/client/SupertonicClient.java):

```java
@Component
public class SupertonicClient {

    @Value("${supertonic.engine.base-url:http://127.0.0.1:8000}")
    private String baseUrl;  // FastAPI service ka URL

    @PostConstruct  // App start hote hi check karo ki TTS service up hai ya nahi
    public void checkEngineStatus() {
        RestClient.create(baseUrl).get().uri("/health").retrieve()...
        // ✅ reachable ya ⚠️ not reachable
    }

    @Retryable(                             // ← RETRY PATTERN!
        retryFor = { TtsEngineUnavailableException.class },
        maxAttempts = 5,                    // Max 5 tries
        backoff = @Backoff(delay = 1500, multiplier = 1.5)  // 1.5s, 2.25s, 3.375s...
    )
    public byte[] synthesize(String text, String voiceId, String lang,
                              double speed, int totalSteps) {
        // Build JSON manually (no Jackson dependency needed)
        String json = buildJson(text, voiceId, lang, speed, totalSteps);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/synthesize"))
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(1200))
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();

        HttpResponse<byte[]> response = httpClient.send(request, BodyHandlers.ofByteArray());

        if (response.statusCode() == 200) return response.body();  // WAV bytes!

        if (statusCode >= 500) throw new TtsEngineUnavailableException(...);  // → Retry!
        throw new RuntimeException(...);  // 422/400 → Don't retry
    }

    @Recover  // Jab saare retries fail ho jaayein
    public byte[] recoverSynthesize(TtsEngineUnavailableException e, ...) {
        throw e;  // Give up → 503 to client
    }
}
```

### Retry Pattern visualized:

```
Attempt 1: POST /synthesize → 503 (engine warming up)
    ↓ wait 1.5s
Attempt 2: POST /synthesize → 503 (still loading)
    ↓ wait 2.25s (1.5 × 1.5)
Attempt 3: POST /synthesize → 200 ✅ WAV bytes!

OR if all fail:
Attempt 5: POST /synthesize → 503
    ↓
@Recover method → re-throw → 503 to Angular → error dialog
```

> **Angular analogy:** `SupertonicClient` = Angular ka `HttpClient` service that calls the backend. Difference: ye backend-to-backend HTTP call hai (Spring → FastAPI), Angular-to-backend nahi.

---

## 🏗️ LEVEL 8: Configuration — "App ki Settings"

### AppProperties — Typed Configuration

Tere project ka [AppProperties.java](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend/config/AppProperties.java):

```java
@Component
@ConfigurationProperties(prefix = "app")  // application.yml mein "app:" se map hoga
public class AppProperties {
    private Jwt jwt = new Jwt();          // app.jwt.secret, app.jwt.expiration-ms
    private Storage storage = new Storage(); // app.storage.audio-dir
    private Usage usage = new Usage();    // app.usage.daily-limit, app.usage.max-request-chars
    private Tts tts = new Tts();          // app.tts.semaphore-permits

    public static class Usage {
        private int dailyLimit = 20000;       // 20K chars/day per user
        private int maxRequestChars = 5000;   // 5K chars per request max
    }

    public static class Tts {
        private int semaphorePermits = 3;     // Max 3 simultaneous TTS calls
    }
}
```

```yaml
# application.yml (conceptually):
app:
  jwt:
    secret: ${JWT_SECRET}           # Environment variable se aayega
    expiration-ms: 86400000         # 24 hours
  storage:
    audio-dir: backend-data/audio   # WAV files yahan save honge
  usage:
    daily-limit: 20000              # 20K chars per user per day
    max-request-chars: 5000         # Max 5K chars per request
  tts:
    semaphore-permits: 3            # Max 3 concurrent TTS calls
```

> **Angular analogy:** `AppProperties` = Angular ka `environment.ts` — centralized config. Spring mein `@ConfigurationProperties` = Angular mein `environment.apiBaseUrl`. Dono jagah config values ek jagah define hoti hain.

---

## 🏗️ LEVEL 9: Folder Structure = Architecture Blueprint

```
backend/src/main/java/com/voisetu/backend/
│
├── BackendApplication.java          ← 🚀 Entry point (main method)
│
├── controller/                      ← 🚪 RECEPTION (HTTP handlers)
│   ├── AuthController.java              /api/auth — register, login
│   ├── TtsController.java               /api/public/tts — voices, preview
│   ├── GenerationController.java        /api/tts/generate — audio generation
│   ├── UserController.java              /api/me — profile CRUD
│   ├── ProjectController.java           /api/projects — project CRUD
│   ├── HistoryController.java           /api/history — past generations
│   ├── ContactController.java           /api/public/contact — contact form
│   ├── AnalyticsController.java         /api/public/analytics — event tracking
│   ├── AdminController.java             /api/admin — admin dashboard (ADMIN only)
│   ├── PublicStatsController.java       /api/public/stats — public stats
│   └── SiteMetricsController.java       /api/admin/metrics — detailed metrics
│
├── service/                         ← ⚙️ ENGINE ROOM (business logic)
│   ├── TtsGenerationService.java        Core TTS logic + concurrency
│   ├── AuthenticatedUserService.java    JWT → userId resolver
│   ├── AudioStorageService.java         WAV file storage
│   ├── ProjectService.java              Project operations
│   └── RateLimitService.java            IP-based rate limiting
│
├── repository/                      ← 💾 DATABASE DOOR (SQL access)
│   ├── AppUserRepository.java           User CRUD
│   └── DashboardRepository.java         Projects, Generations, Usage
│
├── model/                           ← 📦 DATA SHAPES (entities)
│   └── AppUser.java                     Java record for DB row
│
├── dto/                             ← 📬 DATA TRANSFER (request/response shapes)
│   ├── request/                         What client SENDS
│   │   ├── TtsGenerateRequest.java
│   │   ├── LoginRequest.java
│   │   ├── RegisterRequest.java
│   │   └── ...
│   └── response/                        What server RETURNS
│       ├── AuthResponse.java
│       ├── VoiceResponse.java
│       └── ...
│
├── security/                        ← 🔐 FORT (authentication & authorization)
│   ├── SecurityConfig.java              Filter chain, CORS, endpoint rules
│   ├── JwtAuthFilter.java               JWT extraction & validation per request
│   ├── JwtService.java                  Token generation & parsing
│   └── CustomUserDetailsService.java    DB → UserDetails adapter
│
├── exception/                       ← 🚨 AMBULANCE (error handling)
│   ├── GlobalExceptionHandler.java      @RestControllerAdvice — catches all
│   ├── AppException.java                Base custom exception
│   ├── DailyLimitExceededException.java 429
│   ├── TextTooLongException.java        400
│   ├── TtsEngineUnavailableException.java 503
│   └── ...
│
├── client/                          ← 🌐 EXTERNAL CALLS
│   └── SupertonicClient.java            HTTP client for FastAPI TTS
│
└── config/                          ← ⚙️ CONFIGURATION
    ├── AppProperties.java               Typed config (@ConfigurationProperties)
    ├── AsyncConfig.java                 Async thread pool
    └── TtsEngineHealthIndicator.java    Actuator health check for TTS engine
```

> **Angular analogy:** Compare this with Angular's structure:
> - `controller/` = `landing/`, `contact/`, `features/` (user-facing handlers)
> - `service/` = `core/` services (ThemeService, AuthService)
> - `repository/` = no direct equivalent (Angular uses HttpClient → hits backend)
> - `security/` = `core/auth/` (guards, interceptors)
> - `exception/` = `core/error/` (ErrorDisplayService)
> - `dto/` = `models/` (TypeScript interfaces)

---

## 🏗️ LEVEL 10: Interview + Business POV

### 🎤 Interview mein Spring Boot explain karo:

#### 1. Layered Architecture
> "Humara backend **clean layered architecture** follow karta hai: Controller (HTTP handling) → Service (business logic) → Repository (data access). Ye Separation of Concerns maintain karta hai — controller ko DB ka pata nahi, repository ko HTTP ka pata nahi."

#### 2. Security
> "Hum **stateless JWT authentication** use karte hain. JwtAuthFilter har request pe token verify karta hai. SecurityFilterChain URL-level access control define karta hai — /api/public/** for guests, /api/** for authenticated users, /api/admin/** for admins with @PreAuthorize."

#### 3. Error Handling
> "**@RestControllerAdvice** centralized exception handling karta hai. Custom exception hierarchy (AppException → typed subclasses) ensure karti hai ki har error ka ek code hota hai (like DAILY_LIMIT_EXCEEDED) jo frontend parse karke user-friendly dialog dikhata hai."

#### 4. Concurrency
> "TTS generation ke liye **Semaphore-based concurrency control** use karte hain — max N simultaneous TTS calls allowed. Exceeded requests get an immediate 503 rather than blocking server threads."

#### 5. External Integration
> "FastAPI TTS service ke saath communication ke liye **retry pattern** use karte hain — 5 attempts with exponential backoff. 5xx errors retry hote hain, 4xx nahi. @Recover method handles exhausted retries."

---

### 💼 Business POV — SaaS banane ke liye kya sochna hai:

```
╔══════════════════════════════════════════════════════════════╗
║  SaaS Product ke liye Backend Architecture Decisions:        ║
║                                                              ║
║  1. RATE LIMITING → Abuse prevention + free tier control      ║
║     RateLimitService: IP-based + User-based limits            ║
║                                                              ║
║  2. QUOTA MANAGEMENT → usage_daily table                      ║
║     Upsert pattern → atomic, no race conditions               ║
║     Config-driven limits → easy to change per plan            ║
║                                                              ║
║  3. ANALYTICS → Track everything for business decisions       ║
║     analytics_session + analytics_event (JSONB) → flexible    ║
║     interest_signal → "Would you pay?" data collection        ║
║                                                              ║
║  4. MULTI-TENANCY → user_id on EVERY query                    ║
║     WHERE user_id = ? → data isolation guaranteed             ║
║                                                              ║
║  5. CONCURRENCY → Semaphore limits simultaneous AI calls      ║
║     AI models are EXPENSIVE → control access                  ║
║                                                              ║
║  6. RETRY + CIRCUIT BREAKER → External service failures       ║
║     @Retryable → graceful degradation                         ║
║                                                              ║
║  7. AUDIT TRAIL → generation table tracks EVERY request       ║
║     status: pending → success/failed → full lifecycle          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🔥 PRACTICE EXERCISE

### Kisi bhi Spring Boot project mein ye dhundh:

| # | Kya dhundhna hai | Kahan milega | Kyun important hai |
|---|---|---|---|
| 1 | Main entry point | `@SpringBootApplication` class | App kahan se start hota hai |
| 2 | All endpoints | `@GetMapping`, `@PostMapping` in controllers | API surface area kya hai |
| 3 | Security rules | `SecurityFilterChain` bean | Kaun kya access kar sakta hai |
| 4 | Business rules | Service classes | App ka actual logic kya hai |
| 5 | DB schema | `schema.sql` ya `@Entity` classes | Data kaise store hota hai |
| 6 | Error handling | `@RestControllerAdvice` | Errors kaise format hote hain |
| 7 | External calls | `RestClient`, `HttpClient`, `WebClient` | Bahari services se kaise baat hoti hai |
| 8 | Config values | `application.yml` + `@ConfigurationProperties` | App ki settings kya hain |

---

## 📌 Final Takeaway

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  Spring Boot = Security GATE + Controller DESK +             ║
║                Service ENGINE + Repository STORAGE            ║
║                                                              ║
║  Request aaye toh soch:                                       ║
║    "GATE pe kaun rok raha hai?" → SecurityConfig + JwtFilter  ║
║    "DESK pe kaun receive kar raha?" → @RestController         ║
║    "ENGINE mein kya ho raha hai?" → @Service                  ║
║    "STORAGE mein kya save ho raha?" → @Repository + SQL       ║
║    "ERROR aaye toh kya?" → @RestControllerAdvice              ║
║    "BAHAR se kya mangwana hai?" → @Component client + @Retry  ║
║                                                              ║
║  Full Stack Connection:                                       ║
║    Angular (click) → HttpClient.post()                        ║
║      → Spring JwtFilter (verify) → Controller (receive)       ║
║      → Service (process) → Repository (store)                 ║
║      → Client (call FastAPI) → FastAPI (AI inference)         ║
║      → Response → Angular (render)                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

> **Sumit, ab tu Angular + Spring Boot dono sides samajhta hai. Frontend mein button click hota hai, backend mein controller catch karta hai. Frontend mein authInterceptor JWT lagata hai, backend mein JwtFilter check karta hai. Ye MIRROR IMAGE hai — dono sides samajhna = TRUE Full Stack Engineer. Keep building! 💪**

---

*Document based on analysis of [words2voice backend](file:///home/sumit/Documents/GitHub/TTS-Website/backend/src/main/java/com/voisetu/backend) — Spring Boot 3.x, Spring Security 6, JdbcTemplate, PostgreSQL, JWT Auth.*
