import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Guard to protect routes that require authentication.
 */
export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    }

    // Store the attempted URL for redirecting after login
    const returnUrl = state.url;
    router.navigate(['/auth/login'], { queryParams: { returnUrl } });
    return false;
};

/**
 * Guard to protect routes that require identified (non-anonymous) users.
 */
export const identifiedUserGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.user();

    if (user && !user.isAnonymous) {
        return true;
    }

    // Redirect to register if anonymous
    if (user?.isAnonymous) {
        router.navigate(['/auth/register'], {
            queryParams: {
                returnUrl: state.url,
                message: 'Create an account to access this feature'
            }
        });
    } else {
        router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
    }

    return false;
};

/**
 * Guard to protect admin routes.
 */
export const adminGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAdmin()) {
        return true;
    }

    router.navigate(['/']);
    return false;
};

/**
 * Guard to prevent authenticated users from accessing auth pages.
 */
export const guestGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.user();

    // Allow anonymous users to access auth pages
    if (!user || user.isAnonymous) {
        return true;
    }

    // Redirect authenticated users to home
    router.navigate(['/']);
    return false;
};
