import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { LocalReport, LocalMedia } from '../models';

interface CivicDutyDB extends DBSchema {
    reports: {
        key: string;
        value: LocalReport;
        indexes: { 'by-status': string; 'by-created': Date };
    };
    media: {
        key: string;
        value: LocalMedia & { reportClientId: string };
        indexes: { 'by-report': string; 'by-status': string };
    };
    syncQueue: {
        key: string;
        value: {
            id: string;
            type: 'report' | 'media' | 'validation';
            action: 'create' | 'update' | 'delete';
            data: any;
            createdAt: Date;
            attempts: number;
            lastError?: string;
        };
    };
    cache: {
        key: string;
        value: {
            key: string;
            data: any;
            expiresAt: Date;
        };
    };
}

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    private db: IDBPDatabase<CivicDutyDB> | null = null;
    private dbPromise: Promise<IDBPDatabase<CivicDutyDB>> | null = null;

    /**
     * Initialize the IndexedDB database.
     */
    async init(): Promise<void> {
        if (this.db) return;

        this.db = await this.getDb();
    }

    private async getDb(): Promise<IDBPDatabase<CivicDutyDB>> {
        if (this.db) return this.db;

        if (!this.dbPromise) {
            this.dbPromise = openDB<CivicDutyDB>('civicduty', 1, {
                upgrade(db) {
                    // Reports store
                    const reportStore = db.createObjectStore('reports', { keyPath: 'clientId' });
                    reportStore.createIndex('by-status', 'status');
                    reportStore.createIndex('by-created', 'createdAt');

                    // Media store
                    const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
                    mediaStore.createIndex('by-report', 'reportClientId');
                    mediaStore.createIndex('by-status', 'uploadStatus');

                    // Sync queue
                    db.createObjectStore('syncQueue', { keyPath: 'id' });

                    // Cache store
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
            });
        }

        this.db = await this.dbPromise;
        return this.db;
    }

    // ============ Report Operations ============

    /**
     * Save a local report draft.
     */
    async saveReport(report: LocalReport): Promise<void> {
        const db = await this.getDb();
        await db.put('reports', report);
    }

    /**
     * Get a report by client ID.
     */
    async getReport(clientId: string): Promise<LocalReport | undefined> {
        const db = await this.getDb();
        return db.get('reports', clientId);
    }

    /**
     * Get all local reports.
     */
    async getAllReports(): Promise<LocalReport[]> {
        const db = await this.getDb();
        return db.getAll('reports');
    }

    /**
     * Get reports by status.
     */
    async getReportsByStatus(status: LocalReport['status']): Promise<LocalReport[]> {
        const db = await this.getDb();
        return db.getAllFromIndex('reports', 'by-status', status);
    }

    /**
     * Get pending reports (drafts and pending uploads).
     */
    async getPendingReports(): Promise<LocalReport[]> {
        const db = await this.getDb();
        const drafts = await db.getAllFromIndex('reports', 'by-status', 'draft');
        const pending = await db.getAllFromIndex('reports', 'by-status', 'pending_upload');
        return [...drafts, ...pending];
    }

    /**
     * Update report status.
     */
    async updateReportStatus(clientId: string, status: LocalReport['status'], error?: string): Promise<void> {
        const db = await this.getDb();
        const report = await db.get('reports', clientId);
        if (report) {
            report.status = status;
            if (error) report.syncError = error;
            await db.put('reports', report);
        }
    }

    /**
     * Delete a local report.
     */
    async deleteReport(clientId: string): Promise<void> {
        const db = await this.getDb();

        // Delete associated media first
        const media = await db.getAllFromIndex('media', 'by-report', clientId);
        for (const m of media) {
            await db.delete('media', m.id);
        }

        await db.delete('reports', clientId);
    }

    // ============ Media Operations ============

    /**
     * Save media for a report.
     */
    async saveMedia(media: LocalMedia, reportClientId: string): Promise<void> {
        const db = await this.getDb();
        await db.put('media', { ...media, reportClientId });
    }

    /**
     * Get media by ID.
     */
    async getMedia(id: string): Promise<(LocalMedia & { reportClientId: string }) | undefined> {
        const db = await this.getDb();
        return db.get('media', id);
    }

    /**
     * Get all media for a report.
     */
    async getMediaForReport(reportClientId: string): Promise<LocalMedia[]> {
        const db = await this.getDb();
        const items = await db.getAllFromIndex('media', 'by-report', reportClientId);
        return items.map(({ reportClientId, ...media }) => media);
    }

    /**
     * Get pending media uploads.
     */
    async getPendingMedia(): Promise<(LocalMedia & { reportClientId: string })[]> {
        const db = await this.getDb();
        return db.getAllFromIndex('media', 'by-status', 'pending');
    }

    /**
     * Update media upload status.
     */
    async updateMediaStatus(id: string, status: LocalMedia['uploadStatus'], error?: string): Promise<void> {
        const db = await this.getDb();
        const media = await db.get('media', id);
        if (media) {
            media.uploadStatus = status;
            if (error) media.uploadError = error;
            await db.put('media', media);
        }
    }

    /**
     * Delete media.
     */
    async deleteMedia(id: string): Promise<void> {
        const db = await this.getDb();
        await db.delete('media', id);
    }

    // ============ Sync Queue Operations ============

    /**
     * Add item to sync queue.
     */
    async addToSyncQueue(
        type: 'report' | 'media' | 'validation',
        action: 'create' | 'update' | 'delete',
        data: any
    ): Promise<string> {
        const db = await this.getDb();
        const id = crypto.randomUUID();
        await db.put('syncQueue', {
            id,
            type,
            action,
            data,
            createdAt: new Date(),
            attempts: 0
        });
        return id;
    }

    /**
     * Get all items in sync queue.
     */
    async getSyncQueue(): Promise<CivicDutyDB['syncQueue']['value'][]> {
        const db = await this.getDb();
        return db.getAll('syncQueue');
    }

    /**
     * Update sync queue item after attempt.
     */
    async updateSyncQueueItem(id: string, error?: string): Promise<void> {
        const db = await this.getDb();
        const item = await db.get('syncQueue', id);
        if (item) {
            item.attempts++;
            item.lastError = error;
            await db.put('syncQueue', item);
        }
    }

    /**
     * Remove item from sync queue.
     */
    async removeSyncQueueItem(id: string): Promise<void> {
        const db = await this.getDb();
        await db.delete('syncQueue', id);
    }

    // ============ Cache Operations ============

    /**
     * Set a cached value.
     */
    async setCache(key: string, data: any, ttlMinutes: number = 60): Promise<void> {
        const db = await this.getDb();
        await db.put('cache', {
            key,
            data,
            expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000)
        });
    }

    /**
     * Get a cached value.
     */
    async getCache<T>(key: string): Promise<T | null> {
        const db = await this.getDb();
        const item = await db.get('cache', key);

        if (!item) return null;
        if (new Date() > item.expiresAt) {
            await db.delete('cache', key);
            return null;
        }

        return item.data as T;
    }

    /**
     * Clear expired cache entries.
     */
    async clearExpiredCache(): Promise<void> {
        const db = await this.getDb();
        const all = await db.getAll('cache');
        const now = new Date();

        for (const item of all) {
            if (now > item.expiresAt) {
                await db.delete('cache', item.key);
            }
        }
    }

    /**
     * Clear all data (for logout/reset).
     */
    async clearAll(): Promise<void> {
        const db = await this.getDb();
        await db.clear('reports');
        await db.clear('media');
        await db.clear('syncQueue');
        await db.clear('cache');
    }
}
