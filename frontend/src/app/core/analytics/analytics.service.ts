import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';

interface AnalyticsEvent {
  name: string;
  route: string;
  properties: Record<string, any>;
  timestamp: string;
  anonymousId: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly ANON_KEY = 'w2v-anon-id';
  private readonly SESSION_KEY = 'w2v-session-id';
  private readonly FLUSH_INTERVAL = 8000; // 8 seconds
  private readonly MAX_BATCH = 20;

  private queue: AnalyticsEvent[] = [];
  private anonymousId: string;
  private sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly apiUrl = `${environment.apiBaseUrl}/public/analytics/events`;

  constructor(private router: Router) {
    this.anonymousId = this.getOrCreateId(this.ANON_KEY);
    this.sessionId = this.createSessionId();

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(event => {
      this.track('page_view', { path: event.urlAfterRedirects });
    });

    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
      window.addEventListener('beforeunload', () => this.flush());
    }

    // Track session start
    this.track('session_start', {
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      viewport_width: typeof window !== 'undefined' ? window.innerWidth : 0,
      device_type: this.detectDeviceType(),
      browser: this.detectBrowser(),
    });
  }

  track(name: string, properties: Record<string, any> = {}) {
    const event: AnalyticsEvent = {
      name,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      properties,
      timestamp: new Date().toISOString(),
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
    };
    this.queue.push(event);

    // Auto-flush if batch is full
    if (this.queue.length >= this.MAX_BATCH) this.flush();
  }

  private flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.MAX_BATCH);
    const payload = JSON.stringify({ events: batch });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(this.apiUrl, blob);
    } else {
      fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  private getOrCreateId(key: string): string {
    if (typeof localStorage === 'undefined') return this.generateUUID();
    let id = localStorage.getItem(key);
    if (!id) {
      id = this.generateUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }

  private createSessionId(): string {
    // New session ID each browser session (sessionStorage)
    if (typeof sessionStorage === 'undefined') return this.generateUUID();
    let id = sessionStorage.getItem(this.SESSION_KEY);
    if (!id) {
      id = this.generateUUID();
      sessionStorage.setItem(this.SESSION_KEY, id);
    }
    return id;
  }

  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  private detectDeviceType(): string {
    if (typeof window === 'undefined') return 'unknown';
    const w = window.innerWidth;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  private detectBrowser(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    return 'Other';
  }
}
