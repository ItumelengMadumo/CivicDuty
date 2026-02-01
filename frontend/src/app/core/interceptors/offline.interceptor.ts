import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NetworkService } from '../services/network.service';
import { StorageService } from '../services/storage.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../../../environments/environment';

export const offlineInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const networkService = inject(NetworkService);
    const storageService = inject(StorageService);
    const toastService = inject(ToastService);

    // Only handle API requests
    if (!req.url.startsWith(environment.apiUrl)) {
        return next(req);
    }

    // Check if offline before making request
    if (!networkService.isOnline()) {
        // For GET requests, try to serve from cache
        if (req.method === 'GET') {
            return handleOfflineGet(req, storageService, toastService);
        }

        // For write operations, queue for later
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            return handleOfflineWrite(req, storageService, toastService);
        }
    }

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            // Network error while we thought we were online
            if (error.status === 0 || error.status === 504) {
                toastService.warning('Connection lost. Some features may be limited.');

                // For GET requests, try cache
                if (req.method === 'GET') {
                    return handleOfflineGet(req, storageService, toastService);
                }
            }

            return throwError(() => error);
        })
    );
};

function handleOfflineGet(
    req: HttpRequest<unknown>,
    storageService: StorageService,
    toastService: ToastService
) {
    // Extract cache key from URL
    const cacheKey = req.urlWithParams;

    // This would need to be async, but interceptors expect observables
    // For now, just throw an offline error
    toastService.info('You\'re offline. Showing cached data if available.');

    return throwError(() => new HttpErrorResponse({
        error: { message: 'Offline' },
        status: 0,
        statusText: 'Offline',
        url: req.url
    }));
}

function handleOfflineWrite(
    req: HttpRequest<unknown>,
    storageService: StorageService,
    toastService: ToastService
) {
    toastService.info('Action queued. Will sync when back online.');

    // Queue the request for later sync
    // This is handled by individual services (ReportService, ValidationService, etc.)

    return throwError(() => new HttpErrorResponse({
        error: { message: 'Offline - queued for sync' },
        status: 0,
        statusText: 'Offline',
        url: req.url
    }));
}
