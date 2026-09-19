import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface SeoPage {
  title: string;
  description: string;
  path: string;
  keywords: string;
}

const siteUrl = 'https://words2voice.vercel.app/';

const pages: Record<string, SeoPage> = {
  '/': {
    title: 'Free Hindi Text to Speech Online | AI Voice Generator for Hindi, English & Hinglish | words2voice',
    description: 'Convert Hindi, English and Hinglish text to natural AI speech online. Generate free Indian voiceovers for YouTube, Reels, ads, education, podcasts and accessibility with words2voice.',
    path: '/',
    keywords: 'Hindi text to speech, free TTS online, Hinglish voice generator, Indian AI voice generator, English India text to speech, Hindi voiceover maker, text to voice Hindi'
  },
  '/about': {
    title: 'About words2voice | Free Hindi & Hinglish AI Text to Speech for India',
    description: 'Learn why words2voice was built: a free, India-first AI text-to-speech tool for Hindi creators, educators, businesses and storytellers.',
    path: '/about',
    keywords: 'about words2voice, Hindi TTS India, free AI voice generator India'
  },
  '/contact': {
    title: 'Contact words2voice | Hindi Text to Speech Support & Feedback',
    description: 'Contact words2voice for feedback, support and partnership ideas for Hindi, English and Hinglish text-to-speech generation.',
    path: '/contact',
    keywords: 'contact words2voice, Hindi TTS support, AI voice generator feedback'
  },
  '/privacy': {
    title: 'Privacy Policy | words2voice Hindi AI Text to Speech',
    description: 'Read how words2voice protects text, audio and account data for Hindi, English and Hinglish text-to-speech users.',
    path: '/privacy',
    keywords: 'words2voice privacy, TTS privacy, AI voice data policy'
  },
  '/terms': {
    title: 'Terms of Service | words2voice Hindi AI Text to Speech',
    description: 'Read the words2voice terms for generating AI voiceovers from Hindi, English and Hinglish text.',
    path: '/terms',
    keywords: 'words2voice terms, TTS terms, AI voice generator terms'
  }
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  init(): void {
    this.updatePage(this.router.url.split('?')[0] || '/');
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      this.updatePage(event.urlAfterRedirects.split('?')[0] || '/');
    });
  }

  private updatePage(path: string): void {
    const page = pages[path] ?? pages['/'];
    const canonical = `${siteUrl}${page.path === '/' ? '' : page.path}`;

    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({ name: 'keywords', content: page.keywords });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });

    let link: HTMLLinkElement | null = document.querySelector("link[rel='canonical']");
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);
  }
}
