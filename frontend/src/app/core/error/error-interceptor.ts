import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth';
import { ErrorDisplayService } from './error-display.service';
import { ApiError, mapApiErrorToUserFacing } from './api-error.model';

/**
 * Global HTTP error interceptor.
 *
 * For every failed HTTP response it:
 * 1. Parses the structured {@link ApiError} from the backend
 * 2. Converts it to a {@link UserFacingError} with friendly analogy + quote
 * 3. For fatal errors (5xx, 429, 503) — shows the ErrorDialog overlay
 * 4. For field errors (400 VALIDATION_ERROR) — re-throws so forms can handle them
 * 5. For 401 — delegates to AuthService.logout()
 *
 * Non-fatal errors (400 with fieldErrors) are re-thrown with the enriched object
 * so individual components can map them to form fields.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const errorDisplay = inject(ErrorDisplayService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 or 403 while unauthenticated — log out silently without popping up error dialog
      if (err.status === 401 || (err.status === 403 && !authService.isAuthenticated())) {
        authService.logout();
        const apiError = parseApiError(err);
        const userFacingError = mapApiErrorToUserFacing(apiError);
        return throwError(() => ({ ...err, userFacingError }));
      }

      // Parse ApiError from backend body, or synthesize one for network errors
      const apiError: ApiError = parseApiError(err);
      const userFacingError = mapApiErrorToUserFacing(apiError);

      // For VALIDATION_ERROR with field details — let the component handle form display
      // We still show the overlay for non-field validation (missing body, etc.)
      const hasFieldErrors = apiError.details && Object.keys(apiError.details).length > 0;
      if (apiError.code === 'VALIDATION_ERROR' && hasFieldErrors) {
        // Attach enriched error so components can read it
        return throwError(() => ({ ...err, userFacingError }));
      }

      // For all other errors — show the overlay
      errorDisplay.show(userFacingError);
      return throwError(() => ({ ...err, userFacingError }));
    })
  );
};

function parseApiError(err: HttpErrorResponse): ApiError {
  // Network/CORS errors (status 0)
  if (err.status === 0) {
    return {
      code: 'TTS_ENGINE_UNAVAILABLE',
      status: 0,
      message: 'Network error — cannot reach the server',
    };
  }

  // Backend returned our structured ApiError
  if (err.error && typeof err.error === 'object' && err.error.code) {
    return err.error as ApiError;
  }

  // Backend returned a plain error string (legacy / unexpected)
  const code = codeToStatus(err.status);
  return {
    code,
    status: err.status,
    message: err.error?.message ?? err.message ?? 'An error occurred',
  };
}

function codeToStatus(status: number): string {
  switch (status) {
    case 400: return 'VALIDATION_ERROR';
    case 401: return 'INVALID_CREDENTIALS';
    case 403: return 'ACCESS_DENIED';
    case 404: return 'RESOURCE_NOT_FOUND';
    case 413: return 'TEXT_TOO_LONG';
    case 429: return 'RATE_LIMIT_EXCEEDED';
    case 503: return 'TTS_ENGINE_UNAVAILABLE';
    case 504: return 'TTS_ENGINE_TIMEOUT';
    default:  return 'INTERNAL_ERROR';
  }
}
