import { Injectable, signal, computed } from '@angular/core';

export interface Position {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
    timestamp: number;
}

export interface LocationError {
    code: number;
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class LocationService {
    private position = signal<Position | null>(null);
    private error = signal<LocationError | null>(null);
    private watching = signal(false);
    private watchId: number | null = null;

    // Computed signals for external use
    readonly currentPosition = computed(() => this.position());
    readonly locationError = computed(() => this.error());
    readonly isWatching = computed(() => this.watching());
    readonly hasLocation = computed(() => this.position() !== null);

    // Default options for high accuracy
    private readonly defaultOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
    };

    /**
     * Check if geolocation is supported.
     */
    isSupported(): boolean {
        return 'geolocation' in navigator;
    }

    /**
     * Get current position (one-time).
     */
    async getCurrentPosition(options?: PositionOptions): Promise<Position> {
        if (!this.isSupported()) {
            throw { code: 0, message: 'Geolocation not supported' };
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const position = this.mapPosition(pos);
                    this.position.set(position);
                    this.error.set(null);
                    resolve(position);
                },
                (err) => {
                    const error = this.mapError(err);
                    this.error.set(error);
                    reject(error);
                },
                { ...this.defaultOptions, ...options }
            );
        });
    }

    /**
     * Start watching position.
     */
    startWatching(options?: PositionOptions): void {
        if (!this.isSupported() || this.watching()) return;

        this.watching.set(true);

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const position = this.mapPosition(pos);
                this.position.set(position);
                this.error.set(null);
            },
            (err) => {
                const error = this.mapError(err);
                this.error.set(error);
            },
            { ...this.defaultOptions, ...options }
        );
    }

    /**
     * Stop watching position.
     */
    stopWatching(): void {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.watching.set(false);
    }

    /**
     * Get last known position or fetch new one.
     */
    async getPosition(maxAge?: number): Promise<Position> {
        const current = this.position();
        const now = Date.now();

        if (current && maxAge && (now - current.timestamp) < maxAge) {
            return current;
        }

        return this.getCurrentPosition({
            maximumAge: maxAge || 60000
        });
    }

    /**
     * Request location permission.
     */
    async requestPermission(): Promise<PermissionState> {
        if (!('permissions' in navigator)) {
            // Fallback: try to get position which will trigger permission prompt
            try {
                await this.getCurrentPosition();
                return 'granted';
            } catch {
                return 'denied';
            }
        }

        const result = await navigator.permissions.query({ name: 'geolocation' });

        if (result.state === 'prompt') {
            // Trigger permission prompt
            try {
                await this.getCurrentPosition();
                return 'granted';
            } catch {
                return 'denied';
            }
        }

        return result.state;
    }

    /**
     * Check if location permission is granted.
     */
    async checkPermission(): Promise<PermissionState> {
        if (!('permissions' in navigator)) {
            return 'prompt';
        }

        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state;
    }

    /**
     * Calculate distance between two points (in meters).
     */
    calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = this.toRadians(lat1);
        const φ2 = this.toRadians(lat2);
        const Δφ = this.toRadians(lat2 - lat1);
        const Δλ = this.toRadians(lon2 - lon1);

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Format position for display.
     */
    formatPosition(position: Position): string {
        const lat = position.latitude.toFixed(6);
        const lon = position.longitude.toFixed(6);
        return `${lat}, ${lon}`;
    }

    /**
     * Format accuracy for display.
     */
    formatAccuracy(accuracy: number): string {
        if (accuracy < 10) return 'Excellent';
        if (accuracy < 30) return 'Good';
        if (accuracy < 100) return 'Fair';
        return 'Poor';
    }

    /**
     * Get accuracy color.
     */
    getAccuracyColor(accuracy: number): string {
        if (accuracy < 10) return '#22c55e';
        if (accuracy < 30) return '#84cc16';
        if (accuracy < 100) return '#eab308';
        return '#ef4444';
    }

    /**
     * Map GeolocationPosition to our Position interface.
     */
    private mapPosition(pos: GeolocationPosition): Position {
        return {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
            timestamp: pos.timestamp
        };
    }

    /**
     * Map GeolocationPositionError to our LocationError interface.
     */
    private mapError(err: GeolocationPositionError): LocationError {
        let message: string;

        switch (err.code) {
            case err.PERMISSION_DENIED:
                message = 'Location permission denied';
                break;
            case err.POSITION_UNAVAILABLE:
                message = 'Location unavailable';
                break;
            case err.TIMEOUT:
                message = 'Location request timed out';
                break;
            default:
                message = 'Unknown location error';
        }

        return { code: err.code, message };
    }

    /**
     * Convert degrees to radians.
     */
    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}
