import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { StorageService } from './storage.service';
import { NetworkService } from './network.service';
import { ReportService } from './report.service';
import { ToastService } from './toast.service';

@Injectable({
    providedIn: 'root'
})
export class SyncService {
    private storage = inject(StorageService);
    private network = inject(NetworkService);
    private reportService = inject(ReportService);
    private toast = inject(ToastService);

    private isSyncing = false;
    private syncInterval: number | null = null;

    /**
     * Initialize sync service.
     */
    async initialize(): Promise<void> {
        await this.storage.init();

        // Listen for online events
        window.addEventListener('network:online', () => this.onOnline());

        // Start periodic sync check
        this.startPeriodicSync();

        // Initial sync attempt
        if (this.network.isOnline()) {
            this.sync();
        }
    }

    /**
     * Perform full sync of pending items.
     */
    async sync(): Promise<void> {
        if (this.isSyncing || !this.network.isOnline()) {
            return;
        }

        this.isSyncing = true;

        try {
            // Sync pending reports
            await this.syncPendingReports();

            // Process sync queue
            await this.processSyncQueue();

        } catch (error) {
            console.error('Sync error:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync all pending reports.
     */
    private async syncPendingReports(): Promise<void> {
        const pendingReports = await this.storage.getPendingReports();

        for (const report of pendingReports) {
            // Skip drafts - they need explicit submission
            if (report.status === 'draft') continue;

            try {
                await this.reportService.submitReport(report.clientId);
                console.log(`Synced report: ${report.clientId}`);
            } catch (error: any) {
                console.error(`Failed to sync report ${report.clientId}:`, error);

                // Revert to draft status after too many failures
                if (report.syncError && report.syncError.includes('attempts')) {
                    await this.storage.updateReportStatus(report.clientId, 'draft', 'Sync failed after multiple attempts');
                }
            }
        }
    }

    /**
     * Process items in the sync queue.
     */
    private async processSyncQueue(): Promise<void> {
        const queue = await this.storage.getSyncQueue();

        for (const item of queue) {
            if (item.attempts >= 5) {
                // Remove items that have failed too many times
                await this.storage.removeSyncQueueItem(item.id);
                continue;
            }

            try {
                await this.processQueueItem(item);
                await this.storage.removeSyncQueueItem(item.id);
            } catch (error: any) {
                await this.storage.updateSyncQueueItem(item.id, error.message);
            }
        }
    }

    /**
     * Process a single queue item.
     */
    private async processQueueItem(item: any): Promise<void> {
        switch (item.type) {
            case 'validation':
                if (item.action === 'create') {
                    // Re-submit validation
                    // await this.validationService.createValidation(item.data);
                }
                break;

            // Add other types as needed
        }
    }

    /**
     * Handle coming back online.
     */
    private async onOnline(): Promise<void> {
        this.toast.show('Back online. Syncing...', 'info');

        await this.sync();

        const pending = await this.storage.getPendingReports();
        if (pending.length === 0) {
            this.toast.show('All reports synced!', 'success');
        }
    }

    /**
     * Start periodic sync checks.
     */
    private startPeriodicSync(): void {
        // Check every 30 seconds
        this.syncInterval = window.setInterval(() => {
            if (this.network.isOnline() && !this.isSyncing) {
                this.sync();
            }
        }, 30000);
    }

    /**
     * Stop periodic sync.
     */
    stopPeriodicSync(): void {
        if (this.syncInterval) {
            window.clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Get sync status.
     */
    getStatus(): { isSyncing: boolean; pendingCount: number } {
        return {
            isSyncing: this.isSyncing,
            pendingCount: this.reportService.pendingCount()
        };
    }
}
