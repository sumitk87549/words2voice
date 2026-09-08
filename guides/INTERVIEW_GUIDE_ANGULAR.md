# 🅰️ Angular Frontend — Comprehensive Interview Guide (Hinglish)

> **Interview Goal**: Iss guide ko padhne ke baad aap interviewer ke samne poore confidence ke saath bata sakenge ki aapne Frontend kaise design kiya, zoneless Angular 22 kyun chuna, Signals se state management kaise handle ki, aur components ke beech communication kaise setup hai.

---

## 1. High-Level Architecture & Key Decisions

Aapka Frontend ek **Zoneless Angular 22** single-page application (SPA) hai jo completely **Standalone Components** par built hai. Iss app me koi `NgModule` nahi hai.

### Key Architectural Choices:
1. **Zoneless Change Detection**: `provideZonelessChangeDetection()` use karke Zone.js ko completely hata diya gaya hai. Isse app light-weight aur ultra-fast ho jaati hai kyunki Zone.js har DOM event ya async task par poore component tree ko re-check nahi karta.
2. **Signals-First State Management**: Redux ya NgRx jaisi heavy libraries ki jagah Angular **Signals** (`signal()`, `computed()`, `effect()`) ka use kiya gaya hai. Signals fine-grained reactivity dete hain.
3. **OnPush Change Detection Strategy**: Saare feature components me `ChangeDetectionStrategy.OnPush` enforce kiya gaya hai.
4. **Functional Interceptors & Guards**: Angular 22 ke modern functional APIs (`HttpInterceptorFn`, `CanActivateFn`) use kiye gaye hain.
5. **Lazy Loading**: Route-level code splitting ki gayi hai using `loadComponent` taaki initial bundle size kam rahe aur site instant load ho.

---

## 2. Important Files & Folder Structure

Aap code files ko samajhne ke liye niche diye gaye files ko point-to-point manually inspect kar sakte hain:

- **App Config & Setup**:
  - [`app.config.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/app.config.ts) — App-level providers setup (Zoneless CD, Router, HttpClient with Interceptors).
  - [`app.routes.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/app.routes.ts) — Lazy-loaded routes configuration aur guards mapping.
  - [`app.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/app.ts) — Root component jo shell layout, global toast, aur error dialog render karta hai.

- **Core Authentication & Security**:
  - [`auth.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/auth/auth.ts) — `AuthService` (token state, login, register, logout logic).
  - [`auth-interceptor.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/auth/auth-interceptor.ts) — HTTP requests me `Authorization: Bearer <token>` add karne wala functional interceptor.
  - [`auth-guard.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/auth/auth-guard.ts) — Protected routes (`authGuard`) aur guest-only routes (`guestGuard`).

- **Global Error Handling Pipeline**:
  - [`error-interceptor.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/error/error-interceptor.ts) — API errors catch karke format karta hai.
  - [`api-error.model.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/error/api-error.model.ts) — Backend error codes ko user-friendly English metaphors aur titles me map karta hai.
  - [`error-dialog.component.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/error/error-dialog.component.ts) — Glassmorphism modal UI popup for system errors.

- **Studio Core Workspace (TTS Feature)**:
  - [`studio.component.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/studio.component.ts) — Thin Orchestrator component.
  - [`studio-state.service.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/studio-state.service.ts) — Single Source of Truth for Studio state.
  - [`studio-api.service.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/services/studio-api.service.ts) — API calls to Spring Boot backend.
  - [`studio-estimator.service.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/services/studio-estimator.service.ts) — Spoken duration and audio generation time calculations.

- **Dashboard & User Profile**:
  - [`dashboard.component.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/dashboard/dashboard.component.ts) — Shell layout with sidebar navigation.
  - [`dashboard.resolver.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/dashboard/dashboard.resolver.ts) — Pre-fetches user profile before route activation to prevent UI flicker.

---

## 3. Coding Paradigms & Patterns Explained

### A. State Management: Signals vs RxJS
- **Signals**: UI State ke liye humne Angular Signals (`signal()`, `computed()`, `effect()`) use kiya hai.
  - `signal(defaultValue)` — Dynamic variable jo value change hone par target elements ko Notify karta hai.
  - `computed(() => ...)` — Derived state, jaise `charsPercent`, `estimatedSpokenDuration`, `isAuthenticated`. Yeh tabhi re-calculate hota hai jab iske dependency signals change hote hain.
  - `effect(() => ...)` — Side-effects ke liye, jaise draft text ko `localStorage` me auto-save karna.
- **RxJS**: Async Data Streams aur HTTP requests handling ke liye RxJS (`Observable`, `Subject`, `shareReplay`) use hota hai. Async API calls ko process karne ke baad data ko Signal me dump kar diya jata hai.

### B. Parent-Child & Component Communication
- **Orchestrator Pattern**: Studio feature me [`StudioComponent`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/studio.component.ts) ek thin orchestrator hai. Yeh mostly HTML layout, header controls, aur child components ko hold karta hai.
- **Service-Based Shared State**: Child components (ScriptEditor, VoiceSettings, VoicePicker, AudioResult) aapas me direct `@Input()` / `@Output()` props pass karne ke bajaye central [`StudioStateService`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/features/studio/studio-state.service.ts) injection se communicate karte hain.
  - Jab ScriptEditor me user text type karta hai -> `state.setText(val)` call hota hai.
  - VoiceSettings aur AudioResult reactively Signals update hote hi bina kisi prop drilling ke auto-render ho jaate hain.

### C. Authentication Flow & Interceptor Pipeline
1. User `/login` ya `/signup` page se credentials bhejta hai.
2. Server HTTP 200 ke saath JWT token return karta hai.
3. [`AuthService`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/auth/auth.ts) token ko `localStorage` (`'token'`) me save karta hai aur `token` Signal update karta hai.
4. Future HTTP requests par [`authInterceptor`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/auth/auth-interceptor.ts) token read karke header attach kar deta hai: `Authorization: Bearer <token>`.
5. Agar server se `401 Unauthorized` response aaye, interceptor automatic `authService.logout()` trigger karke token clear karta hai aur user ko login page par redirect kar deta hai.

### D. Form Validation & UX Architecture
- Dynamic validation errors ko handled kiya gaya hai using custom error mapper [`api-error.model.ts`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/core/error/api-error.model.ts).
- Text limit (15,000 chars) aur character count live calculate hote hain using [`CharCountPipe`](file:///home/sumit/Documents/GitHub/TTS-Website/frontend/src/app/shared/pipes/char-count.pipe.ts).

---

## 4. Top Interview Questions & Practical Answers (Hinglish)

### Q1: Aapne Zoneless Angular 22 kyun choose kiya? Iske kya benefits hain?
**Answer (Interview Script)**:
> *"Maine Angular 22 me `provideZonelessChangeDetection()` use karke Zone.js ko complete remove kar diya hai. Standard Angular me Zone.js har micro-task (jaise `setTimeout`, `fetch`, DOM clicks) par poore component tree ko dirty mark karke re-evaluate karta tha jo performance bottleneck tha. Zoneless approach me Angular Signals direct DOM nodes ko update karte hain jisse Change Detection highly targeted aur fast ho jata hai, reducing CPU overhead and bundle size."*

### Q2: Aapne State Management ke liye NgRx kyun nahi use kiya?
**Answer (Interview Script)**:
> *"NgRx traditional Angular apps ke liye accha tha par isme bahut sara boilerplate code (Actions, Reducers, Effects, Selectors) likhna padta tha. Angular 16+ me Signals aane ke baad reactive state local aur global level par maintain karna extremely clean ho gaya hai. Humne `StudioStateService` me signals aur computed signals use karke single source of truth banaya hai, jo NgRx jitna predictable hai par bina kisi third-party library aur extra boilerplate code ke."*

### Q3: Parent-Child aur Sibling Components ke beech data flow kaise manage kiya?
**Answer (Interview Script)**:
> *"Studio module me multiple complex components hain—ScriptEditor, VoiceSettings, VoicePicker, aur AudioResult. Direct `@Input()` aur `@Output()` events pass karne se Prop-Drilling issue aata. Iss wajah se maine Service-based State Pattern design kiya (`StudioStateService`). Parent component (`StudioComponent`) pure layout orchestrator hai. Saare sibling components single service injected hain aur direct state signals read aur mutate karte hain."*

### Q4: Security aur JWT Token management frontend me kaise implement kiya?
**Answer (Interview Script)**:
> *"JWT token login ke baad `localStorage` me store hota hai. Ek functional HTTP Interceptor (`authInterceptor`) har outgoing HTTP call intercept karke `Authorization` header me `Bearer <token>` attach karta hai. Agar session expire ho jaye ya server se 401 status response aaye, toh interceptor response catch karke user ko clean state me logout karke `/login` page par send kar deta hai. Route protection ke liye `CanActivateFn` functional guards (`authGuard` and `guestGuard`) use kiye gaye hain."*

### Q5: Dashboard page par User Profile instant kaise load hota hai bina flicker ke?
**Answer (Interview Script)**:
> *"Maine Angular `dashboardResolver` (Functional Resolver) implement kiya hai. Jab bhi user `/studio` ya `/projects` dashboard shell route navigate karta hai, resolver background me `/api/me` call karke user data fetch karta hai BEFORE component render. Isse initial paint par koi empty UI flicker ya layout shift nahi hota."*

---

## Summary Checklist for Interview
- [x] **Zoneless CD**: `provideZonelessChangeDetection()`
- [x] **State**: Angular Signals (`signal`, `computed`, `effect`)
- [x] **Pattern**: Orchestrator + Shared State Service
- [x] **Auth**: Functional Interceptors + Functional Guards (`CanActivateFn`)
- [x] **Performance**: Lazy loading (`loadComponent`) + Resolvers
