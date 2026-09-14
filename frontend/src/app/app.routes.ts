import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { authGuard, guestGuard } from './core/auth/auth-guard';
import { dashboardResolver } from './features/dashboard/dashboard.resolver';

export const routes: Routes = [
  // Public routes — eager-loaded entry point
  { path: '', component: LandingComponent },

  // Lazy-loaded public pages
  {
    path: 'about',
    loadComponent: () => import('./about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'contact',
    loadComponent: () => import('./contact/contact.component').then(m => m.ContactComponent)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: 'terms',
    loadComponent: () => import('./terms/terms.component').then(m => m.TermsComponent)
  },

  // Auth routes — guestGuard redirects authenticated users to /studio
  {
    path: 'login',
    // canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'signup',
    // canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup/signup.component').then(m => m.SignupComponent)
  },

  // Dashboard shell — studio is public; protected features enforce authGuard on their child routes
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    resolve: { profile: dashboardResolver },
    children: [
      {
        path: 'studio',
        loadComponent: () => import('./features/studio/studio.component').then(m => m.StudioComponent)
      },
      {
        path: 'projects',
        canActivate: [authGuard],
        loadComponent: () => import('./features/projects/projects.component').then(m => m.ProjectsComponent)
      },
      {
        path: 'voice-lab',
        canActivate: [authGuard],
        loadComponent: () => import('./features/voice-lab/voice-lab.component').then(m => m.VoiceLabComponent)
      },
      {
        path: 'history',
        canActivate: [authGuard],
        loadComponent: () => import('./features/history/history.component').then(m => m.HistoryComponent)
      },
      {
        path: 'settings',
        canActivate: [authGuard],
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'admin',
        canActivate: [authGuard],
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
      },
    ]
  },

  // Catch-all redirect
  { path: '**', redirectTo: '' }
];
