import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ToastService } from '../core/toast/toast.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent {
  http = inject(HttpClient);
  private location = inject(Location);
  private toast = inject(ToastService);

  goBack() { this.location.back(); }

  name = '';
  email = '';
  message = '';
  loading = false;
  error = '';
  hasSubmitted = false;
  originalName = '';
  originalEmail = '';
  originalMessage = '';

  onFieldChange() {
    if (this.hasSubmitted && this.isFormDirty) {
      this.hasSubmitted = false;
    }
  }

  get isFormDirty(): boolean {
    return this.name !== this.originalName ||
           this.email !== this.originalEmail ||
           this.message !== this.originalMessage;
  }

  get isButtonDisabled(): boolean {
    return this.loading ||
           !this.name ||
           !this.email ||
           !this.message ||
           (this.hasSubmitted && !this.isFormDirty);
  }

  get buttonText(): string {
    if (this.loading) return 'Sending...';
    if (this.hasSubmitted && !this.isFormDirty) return 'Sent';
    return 'Send Message';
  }

  onSubmit() {
    this.loading = true;
    this.error = '';
    this.http.post<any>(`${environment.apiBaseUrl}/public/contact`, {
      name: this.name, email: this.email, message: this.message
    }).subscribe({
      next: () => {
        this.toast.success('Message sent successfully! Thanks for reaching out.');
        this.hasSubmitted = true;
        this.originalName = this.name;
        this.originalEmail = this.email;
        this.originalMessage = this.message;
        this.loading = false;
      },
      error: (err) => {
        const errorMessage = err.error?.error || 'Something went wrong. Please try again.';
        this.toast.error(errorMessage);
        this.error = errorMessage;
        this.loading = false;
      }
    });
  }
}
