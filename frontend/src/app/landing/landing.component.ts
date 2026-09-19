import { Component, OnInit, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ThemeService } from '../core/theme/theme.service';
import { AnalyticsService } from '../core/analytics/analytics.service';
import { AuthService } from '../core/auth/auth';
import { computed } from '@angular/core'

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  // ★ Default change detection so all async updates are caught automatically
})
export class LandingComponent implements OnInit {
  themeService = inject(ThemeService);
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private analytics = inject(AnalyticsService);
  private authService = inject(AuthService);
  // const isLoggedIn = this.authService.isAuthenticated();
  readonly isLoggedIn = computed(() => this.authService.isAuthenticated());

  DEFAULT_VOICES = [
    { engineVoiceId: 'M1', displayName: 'Rohan', gender: 'male', styleTag: 'Calm' },
    { engineVoiceId: 'M2', displayName: 'Aryan', gender: 'male', styleTag: 'Dynamic' },
    { engineVoiceId: 'M3', displayName: 'Kabir', gender: 'male', styleTag: 'Steady' },
    { engineVoiceId: 'M4', displayName: 'Dev', gender: 'male', styleTag: 'Warm' },
    { engineVoiceId: 'M5', displayName: 'Vihaan', gender: 'male', styleTag: 'High Energy' },
    { engineVoiceId: 'F1', displayName: 'Isha', gender: 'female', styleTag: 'Warm' },
    { engineVoiceId: 'F2', displayName: 'Meera', gender: 'female', styleTag: 'Calm' },
    { engineVoiceId: 'F3', displayName: 'Priya', gender: 'female', styleTag: 'Dynamic' },
    { engineVoiceId: 'F4', displayName: 'Kavya', gender: 'female', styleTag: 'High Energy' },
    { engineVoiceId: 'F5', displayName: 'Naina', gender: 'female', styleTag: 'Steady' }
  ];

  voices: any[] = this.DEFAULT_VOICES;
  selectedVoiceId = 'M1';
  textToSynthesize = 'कम बोलो, ज़्यादा करो !\nLet your results speak for you!';
  isLoading = false;
  audioUrl: string | null = null;
  errorMessage: string | null = null;
  maxLength = 300;
  mobileMenuOpen = false;

  totalGenerations = 0;
  totalUsers = 0;
  totalVisitors = 0;

  ngOnInit() {
    this.http.get<any[]>(`${environment.apiBaseUrl}/public/tts/voices`)
      .subscribe({
        next: (data) => {
          this.ngZone.run(() => {
            if (data && data.length > 0) {
              this.voices = data;
              const firstVoice = this.voices[0];
              this.selectedVoiceId = this.getVoiceId(firstVoice);
            }
            this.cdr.markForCheck();
          });
        },
        error: (err) => {
          console.error('Failed to load voices from server, using default list', err);
          this.cdr.markForCheck();
        }
      });

    this.http.get<any>(`${environment.apiBaseUrl}/public/stats`)
      .subscribe({
        next: (data) => {
          this.ngZone.run(() => {
            this.totalGenerations = data?.totalGenerations || 0;
            this.totalUsers = data?.totalUsers || 0;
            this.totalVisitors = data?.totalVisitors || 0;
            this.cdr.markForCheck();
          });
        },
        error: () => { }
      });
  }

  get textLength(): number {
    return this.textToSynthesize ? this.textToSynthesize.length : 0;
  }

  onListen() {
    if (!this.textToSynthesize || this.textToSynthesize.trim() === '') {
      this.errorMessage = 'Please enter some text.';
      return;
    }
    if (this.textToSynthesize.length > this.maxLength) {
      this.errorMessage = 'Text is too long.';
      return;
    }

    const activeVoiceId = this.selectedVoiceId ||
      (this.voices.length > 0 ? (this.voices[0].engineVoiceId || this.voices[0].engine_voice_id) : 'M1');

    this.analytics.track('preview_listen_clicked', { textLength: this.textLength, voiceId: activeVoiceId });

    this.isLoading = true;
    this.errorMessage = null;
    this.audioUrl = null;

    // Revoke old blob URL
    if (this.audioUrl && (this.audioUrl as string).startsWith('blob:')) {
      URL.revokeObjectURL(this.audioUrl);
    }

    const payload = {
      text: this.textToSynthesize,
      voiceId: activeVoiceId,
      engineVoiceId: activeVoiceId
    };

    this.http.post(`${environment.apiBaseUrl}/public/tts/preview`, payload, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          // ★ NgZone.run + markForCheck = guaranteed immediate render
          this.ngZone.run(() => {
            this.isLoading = false;
            this.audioUrl = URL.createObjectURL(blob as Blob);
            this.cdr.markForCheck();
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.isLoading = false;
            if (err.status === 429) {
              this.errorMessage = 'Rate limit reached. Please try again in a bit.';
            } else if (err.status === 503) {
              this.errorMessage = 'Voice engine is warming up — try again in a moment.';
            } else {
              this.errorMessage = 'Something went wrong during synthesis.';
            }
            this.cdr.markForCheck();
          });
        }
      });
  }

  getVoiceId(voice: any): string {
    return voice?.engineVoiceId || voice?.engine_voice_id || voice?.voiceId || 'M1';
  }

  getVoiceName(voice: any): string {
    return voice?.displayName || voice?.display_name || voice?.name || voice?.engineVoiceId || 'Voice';
  }

  getVoiceStyle(voice: any): string {
    return voice?.styleTag || voice?.style_tag || voice?.style || 'Standard';
  }
}
