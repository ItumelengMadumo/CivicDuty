import { Injectable, signal, computed } from '@angular/core';
import { fromEvent, merge } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class NetworkService {
    private _isOnline = signal<boolean>(navigator.onLine);
    private _connectionType = signal<string>('unknown');

    readonly isOnline = this._isOnline.asReadonly();
    readonly isOffline = computed(() => !this._isOnline());
    readonly connectionType = this._connectionType.asReadonly();

    /**
     * Initialize network monitoring.
     */
    initialize(): void {
        // Monitor online/offline events
        const online$ = fromEvent(window, 'online').pipe(map(() => true));
        const offline$ = fromEvent(window, 'offline').pipe(map(() => false));

        merge(online$, offline$)
            .pipe(distinctUntilChanged())
            .subscribe(isOnline => {
                this._isOnline.set(isOnline);

                if (isOnline) {
                    this.onOnline();
                } else {
                    this.onOffline();
                }
            });

        // Monitor connection type if available
        this.monitorConnection();
    }

    /**
     * Manually check network status.
     */
    async checkConnection(): Promise<boolean> {
        if (!navigator.onLine) {
            this._isOnline.set(false);
            return false;
        }

        try {
            // Try to reach a reliable endpoint
            const response = await fetch('/api/v1/health', {
                method: 'HEAD',
                cache: 'no-store'
            });

            const online = response.ok;
            this._isOnline.set(online);
            return online;
        } catch {
            this._isOnline.set(false);
            return false;
        }
    }

    /**
     * Get effective connection type.
     */
    getEffectiveType(): string {
        const connection = (navigator as any).connection;
        return connection?.effectiveType || 'unknown';
    }

    /**
     * Check if connection is slow (2G or slow-2g).
     */
    isSlowConnection(): boolean {
        const type = this.getEffectiveType();
        return type === '2g' || type === 'slow-2g';
    }

    private monitorConnection(): void {
        const connection = (navigator as any).connection;

        if (connection) {
            this._connectionType.set(connection.effectiveType || 'unknown');

            connection.addEventListener('change', () => {
                this._connectionType.set(connection.effectiveType || 'unknown');
            });
        }
    }

    private onOnline(): void {
        console.log('Network: Back online');
        // Dispatch custom event for other services to listen
        window.dispatchEvent(new CustomEvent('network:online'));
    }

    private onOffline(): void {
        console.log('Network: Gone offline');
        window.dispatchEvent(new CustomEvent('network:offline'));
    }
}
