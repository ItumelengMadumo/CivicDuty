import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { environment } from '@env/environment';
import { TokenResponse, AuthState, User } from '../models';
import { StorageService } from './storage.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly TOKEN_KEY = 'civicduty_token';
    private readonly USER_KEY = 'civicduty_user';
    private readonly DEVICE_ID_KEY = 'civicduty_device_id';

    private authState = signal<AuthState>({
        isAuthenticated: false,
        isAnonymous: true,
        userId: null,
        token: null,
        expiresAt: null
    });

    // Public computed signals
    readonly isAuthenticated = computed(() => this.authState().isAuthenticated);
    readonly isAnonymous = computed(() => this.authState().isAnonymous);
    readonly userId = computed(() => this.authState().userId);
    readonly token = computed(() => this.authState().token);

    constructor(
        private http: HttpClient,
        private router: Router,
        private storage: StorageService
    ) { }

    /**
     * Initialize authentication on app startup.
     * Restores existing session or creates anonymous auth.
     */
    async initializeAuth(): Promise<void> {
        const storedToken = localStorage.getItem(this.TOKEN_KEY);
        const storedUser = localStorage.getItem(this.USER_KEY);

        if (storedToken && storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                const expiresAt = new Date(userData.expiresAt);

                // Check if token is still valid
                if (expiresAt > new Date()) {
                    this.authState.set({
                        isAuthenticated: true,
                        isAnonymous: userData.isAnonymous,
                        userId: userData.userId,
                        token: storedToken,
                        expiresAt
                    });
                    return;
                }
            } catch {
                // Invalid stored data, clear it
                this.clearStorage();
            }
        }

        // No valid session, authenticate anonymously
        await this.authenticateAnonymous();
    }

    /**
     * Authenticate with device fingerprint for anonymous usage.
     */
    async authenticateAnonymous(): Promise<void> {
        const deviceId = this.getOrCreateDeviceId();
        const fingerprint = await this.generateFingerprint(deviceId);

        try {
            const response = await firstValueFrom(
                this.http.post<TokenResponse>(`${environment.apiUrl}/auth/anonymous`, {
                    device_fingerprint: fingerprint,
                    platform: this.getPlatform(),
                    app_version: '1.0.0'
                })
            );

            this.handleAuthResponse(response, true);
        } catch (error) {
            console.error('Anonymous auth failed:', error);
            // Set minimal state for offline usage
            this.authState.set({
                isAuthenticated: false,
                isAnonymous: true,
                userId: null,
                token: null,
                expiresAt: null
            });
        }
    }

    /**
     * Register a new identified account.
     */
    register(email: string, password: string, linkDevice: boolean = true): Observable<TokenResponse> {
        const deviceFingerprint = linkDevice ? this.getDeviceFingerprint() : undefined;

        return this.http.post<TokenResponse>(`${environment.apiUrl}/auth/register`, {
            email,
            password,
            device_fingerprint: deviceFingerprint
        }).pipe(
            tap(response => this.handleAuthResponse(response, false))
        );
    }

    /**
     * Login with credentials.
     */
    login(email: string, password: string): Observable<TokenResponse> {
        return this.http.post<TokenResponse>(`${environment.apiUrl}/auth/login`, {
            email,
            password
        }).pipe(
            tap(response => this.handleAuthResponse(response, false))
        );
    }

    /**
     * Verify email with code.
     */
    verifyEmail(code: string): Observable<any> {
        return this.http.post(`${environment.apiUrl}/auth/verify`, { code });
    }

    /**
     * Refresh authentication token.
     */
    refreshToken(): Observable<TokenResponse> {
        return this.http.post<TokenResponse>(`${environment.apiUrl}/auth/refresh`, {}).pipe(
            tap(response => this.handleAuthResponse(response, response.is_anonymous)),
            catchError(error => {
                this.logout();
                throw error;
            })
        );
    }

    /**
     * Get current user profile.
     */
    getCurrentUser(): Observable<User> {
        return this.http.get<User>(`${environment.apiUrl}/auth/me`);
    }

    /**
     * Logout and clear session.
     */
    logout(): void {
        this.clearStorage();
        this.authState.set({
            isAuthenticated: false,
            isAnonymous: true,
            userId: null,
            token: null,
            expiresAt: null
        });
        this.router.navigate(['/map']);

        // Re-authenticate anonymously
        this.authenticateAnonymous();
    }

    /**
     * Get the current auth token for API requests.
     */
    getToken(): string | null {
        return this.authState().token;
    }

    /**
     * Check if the current token is expired.
     */
    isTokenExpired(): boolean {
        const expiresAt = this.authState().expiresAt;
        if (!expiresAt) return true;
        return expiresAt <= new Date();
    }

    private handleAuthResponse(response: TokenResponse, isAnonymous: boolean): void {
        const expiresAt = new Date(Date.now() + response.expires_in * 1000);

        this.authState.set({
            isAuthenticated: true,
            isAnonymous,
            userId: response.user_id,
            token: response.access_token,
            expiresAt
        });

        // Persist to storage
        localStorage.setItem(this.TOKEN_KEY, response.access_token);
        localStorage.setItem(this.USER_KEY, JSON.stringify({
            userId: response.user_id,
            isAnonymous,
            expiresAt: expiresAt.toISOString()
        }));
    }

    private clearStorage(): void {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    }

    private getOrCreateDeviceId(): string {
        let deviceId = localStorage.getItem(this.DEVICE_ID_KEY);
        if (!deviceId) {
            deviceId = uuidv4();
            localStorage.setItem(this.DEVICE_ID_KEY, deviceId);
        }
        return deviceId;
    }

    private async generateFingerprint(deviceId: string): Promise<string> {
        // Combine device ID with browser characteristics
        const components = [
            deviceId,
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset().toString()
        ];

        const data = components.join('|');
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);

        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private getDeviceFingerprint(): string | undefined {
        const deviceId = localStorage.getItem(this.DEVICE_ID_KEY);
        return deviceId || undefined;
    }

    private getPlatform(): string {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) return 'android';
        if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
        if (/Windows/.test(ua)) return 'windows';
        if (/Mac/.test(ua)) return 'macos';
        if (/Linux/.test(ua)) return 'linux';
        return 'web';
    }
}
