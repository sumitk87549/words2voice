import { Injectable, inject, signal, computed } from '@angular/core';
import { StudioApiService } from './services/studio-api.service';
import { StudioEstimatorService } from './services/studio-estimator.service';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { ToastService } from '../../core/toast/toast.service';
import { ErrorDisplayService } from '../../core/error/error-display.service';
import {
  GenerationState,
  ProjectSummary,
  QualityPreset,
  StudioLanguage,
  Voice,
} from './models/studio.models';

/**
 * StudioStateService — single source of truth for all Studio state.
 *
 * All sibling components (ScriptEditor, VoiceSettings, VoicePicker, AudioResult)
 * read from and write to this shared service instead of passing props through
 * the parent. This demonstrates the sibling communication via service pattern.
 */
@Injectable({
  providedIn: 'root',
})
export class StudioStateService {
  private studioApi = inject(StudioApiService);
  private estimator = inject(StudioEstimatorService);
  private analytics = inject(AnalyticsService);
  private toast = inject(ToastService);
  private errorDisplay = inject(ErrorDisplayService);

  // ── Constants ────────────────────────────────────────────────────────
  readonly maxChars = 5000;

  readonly langOptions: { value: StudioLanguage; label: string }[] = [
    { value: 'na', label: '🌐 Auto (Hinglish)' },
    { value: 'hi', label: '🇮🇳 Hindi' },
    { value: 'en', label: '🇬🇧 English' },
  ];

  readonly speedPresets = [
    { value: 0.75, label: '0.75×' },
    { value: 0.9, label: '0.9×' },
    { value: 1.0, label: '1.0×' },
    { value: 1.1, label: '1.1×' },
    { value: 1.25, label: '1.25×' },
    { value: 1.5, label: '1.5×' },
  ];

  readonly qualityPresets: QualityPreset[] = [
    { steps: 4, label: 'Draft', description: 'Fast preview' },
    { steps: 8, label: 'Standard', description: 'Balanced quality' },
    { steps: 16, label: 'High', description: 'Rich voice quality' },
    { steps: 32, label: 'Ultra', description: 'Studio-grade' },
  ];

  readonly voiceUseCases: Record<string, string> = {
    M1: 'Best for: Narration, News',
    M2: 'Best for: Storytelling, Ads',
    M3: 'Best for: YouTube, Reels',
    M4: 'Best for: Announcements, Corporate',
    M5: 'Best for: Casual, Social Media',
    F1: 'Best for: Storytelling, Audiobooks',
    F2: 'Best for: Presentations, Business',
    F3: 'Best for: YouTube, Reels',
    F4: 'Best for: Social Media, Ads',
    F5: 'Best for: Meditation, Wellness',
  };

  readonly scriptPresets = [
    {
      label: 'Tech Review (Hinglish)',
      text: "नमस्ते दोस्तों! Welcome back to the channel. आज हम review करने वाले हैं एक बिलकुल नया smartphone, जो market में तहलका मचा रहा है! इसकी display quality? Absolutely stunning! और battery life के बारे में तो क्या ही कहें... it easily lasts two days! तो चलिए, बिना किसी देरी के, let's unbox this beast!"
    },
    {
      label: 'Motivational (Hinglish)',
      text: "ज़िन्दगी में उतार-चढ़ाव तो आते रहते हैं, right? Sometimes, आपको लगता है कि सब कुछ ख़त्म हो गया है... But wait! वही तो वो पल है जब आपको सबसे ज़्यादा strong रहना होता है। Never give up! क्योंकि हर अँधेरी रात के बाद, एक bright morning ज़रूर आती है। क्या आप तैयार हैं अपने सपनों को हकीकत में बदलने के लिए?"
    },
    {
      label: 'Travel Vlog (Hinglish)',
      text: "Wow! ये नज़ारा देखिए... unbelievable! यहाँ की ठंडी हवा और ये mountains, it feels like heaven! मैं आपको बता नहीं सकता कि मुझे यहाँ आकर कितनी शांति मिल रही है। अगर आप भी nature lover हैं, तो you must visit this place at least once in your lifetime. सच कहूँ तो, I am completely mesmerized by its beauty!"
    },
    {
      label: 'Educational Promo (Hinglish)',
      text: "क्या आप coding सीखना चाहते हैं, but don't know where to start? तो चिंता मत कीजिए! हमारा नया course specifically beginners के लिए design किया गया है। इसमें हम step-by-step हर concept को cover करेंगे... from basics to advanced levels! So, what are you waiting for? Enroll now और अपने IT career की एक शानदार शुरुआत करें।"
    },
    {
      label: 'Dramatic/Suspense (Hinglish)',
      text: "रुको!!! क्या तुमने भी वो आवाज़ सुनी?! मुझे नहीं पता कि वो क्या था... but it sounded terrifying! शशश... कोई आ रहा है! Oh my god, हमें यहाँ से तुरंत निकलना होगा! Hurry up, दरवाज़ा बंद करो! मैंने कहा दरवाज़ा बंद करो!!!"
    },
    {
      label: 'Health & Fitness (Hinglish)',
      text: "आजकल की busy life में, हम अक्सर अपनी health को ignore कर देते हैं। लेकिन याद रखिए, health is wealth! रोज़ सुबह सिर्फ 30 minutes का workout आपकी पूरी life बदल सकता है। Stay hydrated, eat healthy food, और junk food से जहाँ तक हो सके दूर रहें। Let's make a promise today: no more excuses!"
    },
    {
      label: 'Gaming Stream (Hinglish)',
      text: "Hey guys! क्या match चल रहा है! Last zone बचा है... only two enemies left! मेरे पास ammo बहुत कम है... क्या हम ये match जीत पाएंगे?! Watch out, right side से flank कर रहे हैं वो! Headshot!!! Boom! Yes! We did it guys! That was an epic win!"
    },
    {
      label: 'Casual/Comedy (Hinglish)',
      text: "यार, Indian weddings में जो मज़ा है ना, वो कहीं और नहीं है! Seriously, वो paneer की सब्जी के लिए लाइन में लगना... और DJ वाले बाबू को अपनी पसंद का गाना बजाने के लिए तंग करना! Haha, it's just hilarious! और वो रिश्तेदार जो हमेशा पूछते हैं, 'Beta, next turn तुम्हारा है?' Oh god, spare me please!"
    }
  ];

  // ── State Signals ────────────────────────────────────────────────────

  /** Script text — persisted to localStorage as draft */
  readonly text = signal<string>(localStorage.getItem('w2v-draft-text') ?? '');

  /** Available voices from API */
  readonly voices = signal<Voice[]>([]);
  readonly maleVoices = computed(() => this.voices().filter(v => v.gender === 'male'));
  readonly femaleVoices = computed(() => this.voices().filter(v => v.gender === 'female'));

  /** Selected voice */
  readonly selectedVoice = signal<Voice | null>(null);

  /** TTS controls */
  readonly selectedLang = signal<StudioLanguage>('na');
  readonly speed = signal<number>(1.0);
  readonly selectedQuality = signal<QualityPreset>(this.qualityPresets[2]); // High default

  /** Generation state */
  readonly generationState = signal<GenerationState>('idle');
  readonly generating = computed(() => this.generationState() === 'processing');
  readonly audioUrl = signal<string | null>(null);
  readonly error = signal<string>('');
  readonly generationElapsedMs = signal<number>(0);

  /** Projects */
  readonly projects = signal<ProjectSummary[]>([]);
  readonly selectedProjectId = signal<number | null>(null);

  /** Voice preview */
  readonly previewLoadingId = signal<string | null>(null);
  readonly previewPlayingId = signal<string | null>(null);

  // ── Computed Derivations ─────────────────────────────────────────────

  readonly charsPercent = computed(() =>
    Math.round((this.text().length / this.maxChars) * 100)
  );

  readonly estimatedSpokenDuration = computed(() => {
    const t = this.text();
    if (!t.trim()) return '';
    return this.estimator.spokenDuration(t, this.selectedLang(), this.speed());
  });

  readonly estimatedGenerationTime = computed(() => {
    const t = this.text();
    if (!t.trim()) return '';
    return this.estimator.generationTime(t, this.selectedQuality());
  });

  readonly estimatedGenerationSeconds = computed(() =>
    this.estimator.generationSeconds(this.text(), this.selectedQuality())
  );

  /** Language label for display */
  readonly selectedLangLabel = computed(() => {
    const lang = this.selectedLang();
    return lang === 'na' ? 'Auto' : lang === 'hi' ? 'Hindi' : 'English';
  });

  // ── Private timers ───────────────────────────────────────────────────
  private _elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private _previewAudio: HTMLAudioElement | null = null;
  private _generationStartTime = 0;

  // ── Data Fetching ─────────────────────────────────────────────────────

  fetchVoices(): void {
    this.studioApi.getVoices().subscribe({
      next: voices => {
        this.voices.set(voices);
        // Auto-select first male voice if none selected
        if (!this.selectedVoice() && this.maleVoices().length > 0) {
          this.selectedVoice.set(this.maleVoices()[0]);
        }
      },
      error: () => { },
    });
  }

  fetchProjects(): void {
    this.studioApi.getProjects().subscribe({
      next: res => this.projects.set(res),
      error: () => { },
    });
  }

  // ── State Mutations ────────────────────────────────────────────────────

  setText(value: string): void {
    this.text.set(value);
    this.saveDraft();
  }

  saveDraft(): void {
    if (this.text().trim()) {
      localStorage.setItem('w2v-draft-text', this.text());
    } else {
      localStorage.removeItem('w2v-draft-text');
    }
  }

  clearText(): void {
    this.text.set('');
    localStorage.removeItem('w2v-draft-text');
  }

  selectVoice(v: Voice): void {
    this.selectedVoice.set(v);
  }

  selectLang(l: StudioLanguage): void {
    this.selectedLang.set(l);
  }

  selectSpeed(s: number): void {
    this.speed.set(s);
  }

  selectQuality(q: QualityPreset): void {
    this.selectedQuality.set(q);
  }

  selectQualityBySteps(steps: number): void {
    const found = this.qualityPresets.find(q => q.steps === steps);
    if (found) this.selectedQuality.set(found);
  }

  setSelectedProjectId(id: number | null): void {
    this.selectedProjectId.set(id);
  }

  applyPreset(preset: { label: string; text: string }): void {
    this.text.set(preset.text);
    const hasHindi = /[\u0900-\u097F]/.test(preset.text);
    const hasLatin = /[a-zA-Z]/.test(preset.text);
    if (hasHindi && hasLatin) this.selectedLang.set('na');
    else if (hasHindi) this.selectedLang.set('hi');
    else this.selectedLang.set('en');
    this.saveDraft();
  }

  // ── Voice Preview ──────────────────────────────────────────────────────

  playVoicePreview(v: Voice, event: MouseEvent): void {
    event.stopPropagation();

    if (this._previewAudio) {
      this._previewAudio.pause();
      this._previewAudio = null;
    }

    if (this.previewPlayingId() === v.engine_voice_id) {
      this.previewPlayingId.set(null);
      return;
    }

    this.previewLoadingId.set(v.engine_voice_id);
    this.previewPlayingId.set(null);
    this.analytics.track('voice_previewed', { voiceId: v.engine_voice_id });

    this.studioApi.previewVoice(v.engine_voice_id).subscribe({
      next: blob => {
        this.previewLoadingId.set(null);
        this.previewPlayingId.set(v.engine_voice_id);
        const url = URL.createObjectURL(blob as Blob);
        this._previewAudio = new Audio(url);
        this._previewAudio.play();
        this._previewAudio.onended = () => {
          this.previewPlayingId.set(null);
          URL.revokeObjectURL(url);
        };
      },
      error: () => {
        this.previewLoadingId.set(null);
      },
    });
  }

  stopPreviewAudio(): void {
    if (this._previewAudio) {
      this._previewAudio.pause();
      this._previewAudio = null;
    }
    this.previewPlayingId.set(null);
  }

  // ── Audio Generation ────────────────────────────────────────────────────

  generate(onAudioReady?: (audioEl: HTMLAudioElement | null) => void): void {
    const text = this.text();
    const voice = this.selectedVoice();
    if (!text.trim() || !voice) return;

    this.analytics.track('generate_clicked', {
      charCount: text.length,
      voice: voice.display_name,
      voiceId: voice.engine_voice_id,
      quality: this.selectedQuality().label,
      speed: this.speed(),
      lang: this.selectedLang(),
    });

    // Reset state
    this.generationState.set('processing');
    this.error.set('');
    this._generationStartTime = Date.now();
    this.generationElapsedMs.set(0);

    // Revoke old blob URL
    const oldUrl = this.audioUrl();
    if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    this.audioUrl.set(null);

    // Start elapsed timer
    this._elapsedTimer = setInterval(() => {
      this.generationElapsedMs.set(Date.now() - this._generationStartTime);
    }, 500);

    this.studioApi.generateAudio({
      text,
      voiceId: voice.engine_voice_id,
      engineVoiceId: voice.engine_voice_id,
      lang: this.selectedLang(),
      speed: this.speed(),
      totalSteps: this.selectedQuality().steps,
      projectId: this.selectedProjectId(),
    }).subscribe({
      next: (blob: Blob) => {
        this._stopElapsedTimer();
        const url = URL.createObjectURL(blob);
        this.audioUrl.set(url);
        this.generationState.set('ready');

        this.analytics.track('generate_success', {
          charCount: text.length,
          voice: voice.display_name,
          elapsedMs: this.generationElapsedMs(),
        });

        localStorage.removeItem('w2v-draft-text');
        this.toast.success('Audio ready — click play to listen!');

        // Notify parent to trigger audio element load
        if (onAudioReady) onAudioReady(null);
      },
      error: err => {
        this._stopElapsedTimer();
        this.generationState.set('failed');

        this.analytics.track('generate_failed', {
          errorStatus: err.status,
          charCount: text.length,
        });

        // Error display is handled globally by errorInterceptor → ErrorDisplayService.
        // It shows a beautiful analogy + quote dialog based on the error code.
        // We only set a brief inline error message as a fallback for edge cases
        // where the interceptor didn't fire (e.g. purely client-side validation).
        const code = err.userFacingError?.code;
        if (!code) {
          this.error.set('Generation failed. Please check your text and try again.');
        } else {
          this.error.set(''); // Interceptor already showed the dialog
        }
      },
    });
  }

  trackDownload(): void {
    this.analytics.track('audio_downloaded', { charCount: this.text().length });
    this.toast.info('Download started');
  }

  /** Clean up all timers and audio on component destroy */
  cleanup(): void {
    this._stopElapsedTimer();
    this.stopPreviewAudio();
  }

  private _stopElapsedTimer(): void {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
  }
}
