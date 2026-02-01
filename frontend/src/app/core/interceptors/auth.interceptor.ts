import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { environment } from '../../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const authService = inject(AuthService);

    // Only add token to API requests
    if (!req.url.startsWith(environment.apiUrl)) {
        return next(req);
    }

    // Skip auth for public endpoints
    const publicEndpoints = ['/auth/anonymous', '/auth/login', '/auth/register', '/health'];
    if (publicEndpoints.some(endpoint => req.url.includes(endpoint))) {
        return next(req);
    }

    const token = authService.token();

    if (token) {
        req = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    }

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
                // Token expired - try to refresh
                return authService.refreshToken().pipe(
                    switchMap((success) => {
                        if (success) {
                            // Retry with new token
                            const newToken = authService.token();
                            if (newToken) {
                                req = req.clone({
                                    setHeaders: {
                                        Authorization: `Bearer ${newToken}`
                                    }
                                });
                                return next(req);
                            }
                        }
                        // Refresh failed - logout
                        authService.logout();
                        return throwError(() => error);
                    }),
                    catchError(() => {
                        authService.logout();
                        return throwError(() => error);
                    })
                );
            }
            return throwError(() => error);
        })
    );
};
