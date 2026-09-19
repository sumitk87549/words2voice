import {
  Component,
  inject,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioStateService } from '../../studio-state.service';
import { AutoResizeDirective } from '@shared/directives/auto-resize.directive';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { CharCountPipe } from '@shared/pipes/char-count.pipe';
import { SpokenDurationPipe } from '@shared/pipes/spoken-duration.pipe';

/**
 * ScriptEditorComponent — left panel of the Studio.
 * Child of StudioComponent. Reads/writes to StudioStateService.
 * Siblings (VoiceSettings, VoicePicker) see text changes via the shared service.
 */
@Component({
  selector: 'app-script-editor',
  standalone: true,
  imports: [FormsModule, AutoResizeDirective, TooltipDirective, CharCountPipe, SpokenDurationPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="editor-section">
      <div class="editor-header">
        <span class="script-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Script Editor
        </span>
        <div class="editor-actions">
          @if (!state.text()) {
            <button class="editor-action-btn" (click)="pasteFromClipboard()"
              [appTooltip]="'Paste text from clipboard'" tooltipPosition="top">
              📋 Paste
            </button>
          }
          @if (state.text()) {
            <button class="editor-action-btn" (click)="state.clearText()"
              [appTooltip]="'Clear all text'" tooltipPosition="top">
              ✕ Clear
            </button>
          }
        </div>
      </div>

      <!-- Textarea with appAutoResize directive -->
      <textarea
        id="tts-text-input"
        appAutoResize
        [value]="state.text()"
        (input)="onTextInput($event)"
        [placeholder]="currentPlaceholder"
        [maxLength]="state.maxChars"
        aria-label="TTS text input"
        rows="8">
      </textarea>

      <!-- Character progress bar -->
      <div class="char-bar">
        <div class="char-bar-fill"
          [style.width.%]="state.charsPercent()"
          [class.danger]="state.text().length > state.maxChars">
        </div>
      </div>

      <!-- Text stats row -->
      @if (state.text().trim()) {
        <div class="text-stats">
          <span class="stat-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Spoken: {{ state.text() | spokenDuration:state.selectedLang():state.speed() }}
          </span>
          <span class="stat-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Gen: {{ state.estimatedGenerationTime() }}
          </span>
          <span class="stat-chip">{{ state.text().trim().split(/\s+/).length }} words</span>
          <span class="stat-chip char-stat">
            {{ state.text().length | charCount:state.maxChars }}
          </span>
        </div>
      }
    </div>

    <!-- Script Notes -->
    <div class="script-notes">
      <div class="notes-icon">💬</div>
      <div class="notes-content">
        <p>For <strong>Hindi/Indian accent</strong>, type in Devanagari font — <em>e.g. <span
              class="devanagari-example">नमस्ते, आज का दिन</span></em></p>
        <p>Latin/English text will give <strong>English accent</strong>, even for Hindi words</p>
        <p>Mixture of Latin + Devanagari is recommended — <em>e.g. <span class="devanagari-example">अगर आप hard work करेंगे, तो आपको success ज़रूर मिलेगी।</span></em></p>
      </div>
    </div>
  `,
})
export class ScriptEditorComponent implements OnInit, OnDestroy {
  readonly state = inject(StudioStateService);

  readonly placeholderExamples = [
    'Type your Hindi / English / Hinglish script here…\n\nFor example: यार, आज का दिन बहुत amazing रहा! चाय पीनी है?',
    'एक समय की बात है, एक छोटे से गाँव में…\n\n(Hindi, English, and Hinglish all work here!)',
    'Good morning! Aaj hum baat karenge ek important topic ke baare mein…',
    'नमस्ते! आपका हमारे channel पर swagat hai। आज ka video bahut special hai…',
  ];

  currentPlaceholder = this.placeholderExamples[0];
  private _placeholderIdx = 0;
  private _placeholderTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this._placeholderTimer = setInterval(() => {
      if (!this.state.text()) {
        this._placeholderIdx = (this._placeholderIdx + 1) % this.placeholderExamples.length;
        this.currentPlaceholder = this.placeholderExamples[this._placeholderIdx];
      }
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this._placeholderTimer) clearInterval(this._placeholderTimer);
  }

  onTextInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.state.setText(value);
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        this.state.setText(clipText.substring(0, this.state.maxChars));
      }
    } catch {
      // Clipboard permission denied — ignore silently
    }
  }
}
