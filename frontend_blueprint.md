# Frontend Blueprint — Angular

## Technology Stack & Versions

| Dependency            | Version   |
| --------------------- | --------- |
| Angular (Core)        | ^22.0.0   |
| Angular CLI           | ^22.0.7   |
| TypeScript            | ~6.0.2    |
| RxJS                  | ~7.8.0    |
| Node Package Manager  | npm 11.16 |
| Test Framework        | Vitest 4  |
| Build Tool            | esbuild   |

**Dev Server**: `ng serve` → `http://localhost:4200`  
**Production Build**: `ng build` → optimised bundle served by nginx  
**Product Domain**: `https://words2voice.in`

---

## Architecture Overview

The frontend is a **zoneless Angular 22** application built entirely with **Standalone Components** (no `NgModules`).

### Core Architectural Decisions

| Decision                        | Implementation                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Change Detection                | `provideZonelessChangeDetection()` — **Zone.js is not loaded at all**                       |
| Component CD Strategy           | `ChangeDetectionStrategy.OnPush` on all feature components                                  |
| State Management                | Angular **Signals** (`signal()`, `computed()`, `effect()`) — no NgRx or external store      |
| HTTP Interceptors               | Functional interceptors via `withInterceptors([authInterceptor, errorInterceptor])`          |
| Routing                         | `loadComponent` lazy loading per route; guards as functional `CanActivateFn`                 |
| Styling                         | Component-scoped SCSS; global theme via CSS Custom Properties on `[data-theme]`              |
| Communication Between Siblings  | Shared injectable services with Signals (e.g. `StudioStateService`)                         |
| Auth Token Storage              | `localStorage` key `token` (v1 — planned migration to HttpOnly cookies)                     |

---

## Environment Configuration

### `src/environments/environment.ts` (Development)
```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080/api'   // Spring Boot backend
};
```

### `src/environments/environment.prod.ts` (Production)
```typescript
export const environment = {
  production: true,
  apiBaseUrl: '/api'   // Same-origin via nginx reverse proxy — no CORS needed
};
```

---

## Application Bootstrap

### `app.config.ts`
The application-level provider configuration:
- **`provideZonelessChangeDetection()`** — removes Zone.js entirely.
- **`provideRouter(routes)`** — registers the route tree.
- **`provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`** — registers HTTP client with two functional interceptors chained in order.

### `app.ts` (Root Component)
- **Selector**: `app-root`
- **Template**: `<router-outlet>`, `<app-toast>`, `<app-error-dialog>`
- **Injected Services**: `ThemeService` (sets `[data-theme]` on boot), `AnalyticsService` (starts session tracking), `SeoService` (initialises route-based meta tags via `seo.init()`).

---

## Directory Structure

```
src/app/
├── app.config.ts                    # Application bootstrap providers
├── app.routes.ts                    # Route definitions
├── app.ts                           # Root component
├── core/                            # Singleton services & interceptors
│   ├── analytics/
│   │   └── analytics.service.ts
│   ├── auth/
│   │   ├── auth.ts                  # AuthService (Signal-based token)
│   │   ├── auth-guard.ts            # authGuard + guestGuard
│   │   └── auth-interceptor.ts      # JWT Bearer interceptor
│   ├── error/
│   │   ├── api-error.model.ts       # ApiError + UserFacingError interfaces + ERROR_UX_MAP
│   │   ├── error-dialog.component.ts# Glassmorphism error overlay
│   │   ├── error-display.service.ts # Signal-based error state
│   │   └── error-interceptor.ts     # HTTP error parser
│   ├── seo/
│   │   └── seo.service.ts
│   ├── theme/
│   │   └── theme.service.ts
│   ├── toast/
│   │   ├── toast.component.ts
│   │   └── toast.service.ts
│   └── user-profile/
│       └── user-profile.service.ts
├── features/
│   ├── admin/                       # Admin dashboard
│   ├── auth/
│   │   ├── login/                   # Login page
│   │   └── signup/                  # Signup page
│   ├── dashboard/                   # Shell layout with sidebar
│   │   ├── dashboard.component.ts
│   │   └── dashboard.resolver.ts    # Pre-fetches user profile
│   ├── history/                     # Generation history list
│   ├── projects/                    # Project CRUD
│   ├── settings/                    # User settings (name, password, avatar)
│   ├── studio/                      # Core TTS workspace
│   │   ├── components/
│   │   │   ├── audio-result/
│   │   │   ├── script-editor/
│   │   │   └── voice-settings/
│   │   ├── models/
│   │   │   └── studio.models.ts     # All TypeScript interfaces
│   │   ├── services/
│   │   │   ├── studio-api.service.ts
│   │   │   └── studio-estimator.service.ts
│   │   ├── studio.component.ts      # Thin orchestrator
│   │   ├── studio-state.service.ts  # Signal-based state store
│   │   └── voice-picker/
│   └── voice-lab/                   # Voice experimentation
├── landing/                         # Public landing page
├── about/
├── contact/
├── privacy/
├── terms/
└── shared/
    ├── directives/
    │   ├── auto-resize.directive.ts
    │   ├── click-outside.directive.ts
    │   ├── if-authenticated.directive.ts
    │   └── tooltip.directive.ts
    └── pipes/
        ├── char-count.pipe.ts
        ├── spoken-duration.pipe.ts
        └── time-format.pipe.ts
```

---

## Routing (`app.routes.ts`)

| Path           | Component              | Guard          | Loading  | Notes                                    |
| -------------- | ---------------------- | -------------- | -------- | ---------------------------------------- |
| `/`            | `LandingComponent`     | —              | Eager    | Public homepage                          |
| `/about`       | `AboutComponent`       | —              | Lazy     | Static public page                       |
| `/contact`     | `ContactComponent`     | —              | Lazy     | Contact form                             |
| `/privacy`     | `PrivacyComponent`     | —              | Lazy     |                                          |
| `/terms`       | `TermsComponent`       | —              | Lazy     |                                          |
| `/login`       | `LoginComponent`       | `guestGuard`   | Lazy     | Redirects to `/studio` if authenticated  |
| `/signup`      | `SignupComponent`      | `guestGuard`   | Lazy     | Redirects to `/studio` if authenticated  |
| (shell)        | `DashboardComponent`   | —              | Lazy     | Resolver: `dashboardResolver`            |
| `/studio`      | `StudioComponent`      | —              | Lazy     | **Public** — core TTS workspace          |
| `/projects`    | `ProjectsComponent`    | `authGuard`    | Lazy     |                                          |
| `/voice-lab`   | `VoiceLabComponent`    | `authGuard`    | Lazy     |                                          |
| `/history`     | `HistoryComponent`     | `authGuard`    | Lazy     |                                          |
| `/settings`    | `SettingsComponent`    | `authGuard`    | Lazy     |                                          |
| `/admin`       | `AdminComponent`       | `authGuard`    | Lazy     |                                          |
| `**`           | —                      | —              | —        | Redirect → `/`                           |

---

## Core Services (Detailed)

### `core/auth/auth.ts` — `AuthService`
**Scope**: `providedIn: 'root'`

| Signal / Property  | Type                      | Description                                                |
| ------------------ | ------------------------- | ---------------------------------------------------------- |
| `token`            | `Signal<string \| null>`  | JWT read from `localStorage('token')` on boot              |
| `isAuthenticated`  | `Computed<boolean>`       | Derived: `!!token()`                                       |
| `profileUpdated$`  | `Subject<void>`           | RxJS event bus for profile change notifications            |

| Method              | Returns              | Description                                                         |
| ------------------- | -------------------- | ------------------------------------------------------------------- |
| `register(data)`    | `Observable<{token}>`| POST `/api/auth/register` → stores token on success                 |
| `login(data)`       | `Observable<{token}>`| POST `/api/auth/login` → stores token on success                    |
| `logout()`          | `void`               | Clears `localStorage`, resets token signal, navigates to `/login`   |

### `core/auth/auth-guard.ts`
Two functional guards:
- **`authGuard`**: If `!isAuthenticated()` → redirect to `/login`.
- **`guestGuard`**: If `isAuthenticated()` → redirect to `/studio`.

### `core/auth/auth-interceptor.ts`
Functional `HttpInterceptorFn`. Reads `token()` signal and attaches `Authorization: Bearer <token>` to all HTTP requests targeting external URLs. On `401` response → calls `authService.logout()`.

### `core/error/error-interceptor.ts`
Functional `HttpInterceptorFn`. Catches `HttpErrorResponse` and:
1. **401/403 unauthenticated** → silent logout, no dialog.
2. **VALIDATION_ERROR with field errors** → re-throws enriched error for form-level handling.
3. **All other errors** → shows the `ErrorDialogComponent` overlay via `ErrorDisplayService.show()`.

**Error code mapping** (`api-error.model.ts`): Maps backend `code` strings (e.g. `TTS_ENGINE_UNAVAILABLE`, `DAILY_LIMIT_EXCEEDED`, `TEXT_TOO_LONG`, `INVALID_CREDENTIALS`, etc.) to user-facing objects containing: `title`, `analogy` (plain-English metaphor), `quote` + `quoteAuthor`, `actionLabel`, `canRetry`.

### `core/error/error-dialog.component.ts` — `ErrorDialogComponent`
Global overlay, mounted once in `app.html`. Uses `@if (errorDisplay.currentError(); as err)` to render a glassmorphism card with animated entrance, emoji icon (mapped by error code), title, analogy, quote blockquote, and Retry/Dismiss buttons. Dismissable via Escape key or backdrop click.

### `core/analytics/analytics.service.ts` — `AnalyticsService`
**Scope**: `providedIn: 'root'` — initialised at app boot.

| Constant         | Value  | Description                          |
| ---------------- | ------ | ------------------------------------ |
| `FLUSH_INTERVAL` | 8000ms | Batch flush timer                    |
| `MAX_BATCH`      | 20     | Max events per flush                 |

- Generates a persistent `anonymousId` (UUID in `localStorage` key `w2v-anon-id`).
- Creates a per-tab `sessionId` (UUID in `sessionStorage` key `w2v-session-id`).
- Auto-tracks `page_view` on every Angular `NavigationEnd` event.
- Tracks `session_start` with referrer, viewport, device type, browser.
- `track(name, properties)` — queues an event; auto-flushes at `MAX_BATCH`.
- `flush()` — sends queued events to `POST /api/public/analytics/events` using `navigator.sendBeacon()` (fire-and-forget, works during `beforeunload`).

### `core/seo/seo.service.ts` — `SeoService`
Updates `<title>`, `<meta description>`, `<meta keywords>`, Open Graph tags, Twitter cards, and canonical `<link>` on every route navigation. Maintains a static map of page-specific SEO data for `/`, `/about`, `/contact`, `/privacy`, `/terms`.

### `core/theme/theme.service.ts` — `ThemeService`
- **Signal**: `theme = signal<'night' | 'day'>` — default: `'night'`.
- **Storage**: Persisted to `localStorage` key `w2v-theme`.
- **DOM**: Sets `document.documentElement.setAttribute('data-theme', theme)`.
- **Method**: `toggle()` — switches between `'night'` and `'day'`.

### `core/toast/toast.service.ts` — `ToastService`
- **Signal**: `toasts = signal<Toast[]>([])`.
- **Interface**: `Toast { id, message, type: 'success'|'error'|'info', duration }`.
- **Methods**: `show(msg, type, duration)`, `success(msg)`, `error(msg)` (6s duration), `info(msg)`.
- Auto-removes toasts after their duration via `setTimeout`.

### `core/user-profile/user-profile.service.ts` — `UserProfileService`
Central profile state shared between Dashboard and Settings:
- **Signal**: `profile = signal<UserProfile | null>(null)`.
- **Computed**: `displayName`, `email`, `isAdmin` — derived from `profile()`.
- **Local signals**: `avatarEmoji`, `avatarColor` — persisted to `localStorage` keys `w2v-avatar`, `w2v-avatar-color`.
- **Methods**: `loadProfile()` (GET `/api/me`), `updateDisplayName(name)` (PATCH `/api/me`), `saveAvatar(emoji, color)`, `clearProfile()`.

---

## Studio Feature (Core TTS Workspace)

### TypeScript Interfaces (`studio.models.ts`)

```typescript
interface Voice         { id: number; engine_voice_id: string; display_name: string; gender: string; style_tag: string; description?: string }
interface ProjectSummary{ id: number; name: string }
interface ScriptPreset  { label: string; text: string }
interface QualityPreset { steps: number; label: 'Draft'|'Standard'|'High'|'Ultra'; description: string }
type VoiceTab           = 'Male' | 'Female'
type GenerationState    = 'idle' | 'processing' | 'ready' | 'failed'
type StudioLanguage     = 'na' | 'hi' | 'en'
interface GenerateAudioRequest { text, voiceId, engineVoiceId, lang, speed, totalSteps, projectId }
```

### `studio-state.service.ts` — `StudioStateService`
**The single source of truth for the entire Studio module.** All child components (ScriptEditor, VoicePicker, VoiceSettings, AudioResult) read from and write to this service.

**Constants**:
- `maxChars = 5000`
- `langOptions`: Auto (Hinglish) / Hindi / English
- `speedPresets`: 0.75× to 1.5×
- `qualityPresets`: Draft(4) / Standard(8) / High(16) / Ultra(32)
- `voiceUseCases`: Maps voice IDs to recommended use cases (e.g. M1 → "Narration, News")
- `scriptPresets`: 8 Hinglish preset scripts (Tech Review, Motivational, Travel Vlog, etc.)

**State Signals**:

| Signal                  | Type                         | Default / Init                     |
| ----------------------- | ---------------------------- | ---------------------------------- |
| `text`                  | `Signal<string>`             | Draft from `localStorage('w2v-draft-text')` |
| `voices`                | `Signal<Voice[]>`            | `[]` — populated from API          |
| `selectedVoice`         | `Signal<Voice \| null>`      | Auto-selects first male voice      |
| `selectedLang`          | `Signal<StudioLanguage>`     | `'na'` (Auto/Hinglish)             |
| `speed`                 | `Signal<number>`             | `1.0`                              |
| `selectedQuality`       | `Signal<QualityPreset>`      | High (16 steps)                    |
| `generationState`       | `Signal<GenerationState>`    | `'idle'`                           |
| `audioUrl`              | `Signal<string \| null>`     | Blob URL of generated audio        |
| `error`                 | `Signal<string>`             | Inline fallback error message      |
| `generationElapsedMs`   | `Signal<number>`             | Live timer during generation       |
| `projects`              | `Signal<ProjectSummary[]>`   | User's project list                |
| `selectedProjectId`     | `Signal<number \| null>`     | Project to tag generation with     |

**Computed Signals**: `maleVoices`, `femaleVoices`, `charsPercent`, `generating`, `estimatedSpokenDuration`, `estimatedGenerationTime`, `selectedLangLabel`.

**Key Methods**:
- `fetchVoices()` → GET `/api/voices` (cached via `shareReplay`).
- `fetchProjects()` → GET `/api/projects`.
- `setText(value)` — updates signal + saves draft to localStorage.
- `applyPreset(preset)` — sets text + auto-detects language (Hindi regex check).
- `playVoicePreview(voice, event)` — POST `/api/public/tts/preview` → plays audio via `HTMLAudioElement`.
- `generate(onAudioReady?)` — orchestrates the full TTS flow: analytics tracking → state reset → elapsed timer → POST `/api/tts/generate` → blob URL → toast notification.
- `trackDownload()` — fires analytics event.
- `cleanup()` — clears timers and audio on component destroy.

### `studio-api.service.ts` — `StudioApiService`
HTTP client for Studio-specific API calls:

| Method                    | HTTP     | Endpoint                                | Response   |
| ------------------------- | -------- | --------------------------------------- | ---------- |
| `getVoices()`             | GET      | `/api/voices`                           | `Voice[]`  |
| `getProjects()`           | GET      | `/api/projects`                         | `ProjectSummary[]` |
| `previewVoice(id, lang)`  | POST     | `/api/public/tts/preview`               | `Blob` (WAV) |
| `generateAudio(request)`  | POST     | `/api/tts/generate`                     | `Blob` (WAV) |
| `getGenerationAudio(id)`  | GET      | `/api/generations/{id}/audio`           | `Blob` (WAV) |
| `likeGeneration(id)`      | POST     | `/api/generations/{id}/like`            | `void`     |

### `studio-estimator.service.ts` — `StudioEstimatorService`
Pure-calculation service:
- `spokenDuration(text, lang, speed)` → `"~2m 30s"` (English: 16 chars/sec, Hindi: 14 chars/sec).
- `generationSeconds(text, quality)` → integer (base 4s + 0.03 per char × quality factor).
- `generationTime(text, quality)` → `"~12s"` formatted string.

### `studio.component.ts` — `StudioComponent`
**Thin orchestrator** — layout only, delegates all logic to child components via `StudioStateService`.
- `ngOnInit()` → `state.fetchVoices()`, `state.fetchProjects()`.
- `ngOnDestroy()` → `state.cleanup()`.
- `showFirstRun` → boolean from `localStorage('w2v-seen-intro')`.
- `applyRandomPreset()` → picks random preset from `scriptPresets`.

---

## Dashboard Feature

### `dashboard.component.ts`
Shell layout with collapsible sidebar. Uses `OnPush` CD. Reads profile via `UserProfileService` signals (displayName, avatarEmoji, avatarColor, isAdmin). Subscribes to `authService.profileUpdated$` for backward compat.

### `dashboard.resolver.ts`
Functional `ResolveFn<UserProfile | null>`. Pre-fetches `GET /api/me` before `DashboardComponent` activates, ensuring sidebar renders with real user data on first paint (no flicker). Gracefully returns `null` on failure.

---

## Shared Module

### Directives

| Directive               | Selector                    | Type        | Description                                                |
| ----------------------- | --------------------------- | ----------- | ---------------------------------------------------------- |
| `AutoResizeDirective`   | `textarea[appAutoResize]`   | Attribute   | Auto-resizes textarea height to fit content on `input`     |
| `ClickOutsideDirective` | `[appClickOutside]`         | Attribute   | Emits event on click outside host element (mobile menus)   |
| `IfAuthenticatedDirective`| `*appIfAuthenticated`     | Structural  | Renders content only when `isAuthenticated()` is true; uses `effect()` for reactivity |
| `TooltipDirective`      | `[appTooltip]`              | Attribute   | Displays styled tooltip on hover; supports `top/bottom/left/right` positioning |

### Pipes

| Pipe            | Name              | Usage                                     | Example Output       |
| --------------- | ----------------- | ----------------------------------------- | -------------------- |
| `CharCountPipe` | `charCount`       | `{{ text.length \| charCount:maxChars }}`  | `"1,234 / 15,000 chars"` |
| `SpokenDurationPipe` | `spokenDuration` | `{{ text \| spokenDuration:lang:speed }}` | `"~2m 30s"`          |
| `TimeFormatPipe`| `timeFormat`      | `{{ elapsedMs \| timeFormat }}`            | `"1:30"` or `"45s"`  |

---

## localStorage Keys Used

| Key               | Purpose                                   | Scope         |
| ----------------- | ----------------------------------------- | ------------- |
| `token`           | JWT authentication token                  | Auth          |
| `w2v-theme`       | Theme preference (`'night'`/`'day'`)      | Theme         |
| `w2v-draft-text`  | Unsaved script draft                      | Studio        |
| `w2v-seen-intro`  | First-run intro dismissed flag            | Studio        |
| `w2v-anon-id`     | Persistent anonymous visitor ID (UUID)    | Analytics     |
| `w2v-avatar`      | User avatar emoji                         | Profile       |
| `w2v-avatar-color`| User avatar gradient colour               | Profile       |

**sessionStorage**: `w2v-session-id` — per-tab session UUID for analytics.
