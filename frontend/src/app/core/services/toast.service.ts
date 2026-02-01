import { Injectable, signal, computed } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    action?: {
        label: string;
        callback: () => void;
    };
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toasts = signal<Toast[]>([]);

    readonly activeToasts = computed(() => this.toasts());
    readonly hasToasts = computed(() => this.toasts().length > 0);

    /**
     * Show a toast message.
     */
    show(message: string, type: ToastType = 'info', duration = 4000, action?: Toast['action']): string {
        const id = this.generateId();

        const toast: Toast = {
            id,
            message,
            type,
            duration,
            action
        };

        this.toasts.update(current => [...current, toast]);

        if (duration > 0) {
            setTimeout(() => this.dismiss(id), duration);
        }

        return id;
    }

    /**
     * Show success toast.
     */
    success(message: string, duration = 4000): string {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast.
     */
    error(message: string, duration = 6000): string {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast.
     */
    warning(message: string, duration = 5000): string {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast.
     */
    info(message: string, duration = 4000): string {
        return this.show(message, 'info', duration);
    }

    /**
     * Show toast with action button.
     */
    showWithAction(message: string, type: ToastType, actionLabel: string, actionCallback: () => void, duration = 0): string {
        return this.show(message, type, duration, {
            label: actionLabel,
            callback: actionCallback
        });
    }

    /**
     * Dismiss a specific toast.
     */
    dismiss(id: string): void {
        this.toasts.update(current => current.filter(t => t.id !== id));
    }

    /**
     * Dismiss all toasts.
     */
    dismissAll(): void {
        this.toasts.set([]);
    }

    /**
     * Get icon for toast type.
     */
    getIcon(type: ToastType): string {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✕';
            case 'warning':
                return '⚠';
            case 'info':
                return 'ℹ';
        }
    }

    /**
     * Get color for toast type.
     */
    getColor(type: ToastType): string {
        switch (type) {
            case 'success':
                return 'var(--success)';
            case 'error':
                return 'var(--danger)';
            case 'warning':
                return 'var(--warning)';
            case 'info':
                return 'var(--primary)';
        }
    }

    /**
     * Generate unique ID for toast.
     */
    private generateId(): string {
        return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
