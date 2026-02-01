import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { environment } from '@env/environment';
import {
    Report,
    ReportMapItem,
    ReportScoreBreakdown,
    ReportFilters,
    PaginatedResponse,
    LocalReport,
    LocalMedia,
    ReportCategory
} from '../models';
import { StorageService } from './storage.service';
import { MediaService } from './media.service';

@Injectable({
    providedIn: 'root'
})
export class ReportService {
    private _localReports = signal<LocalReport[]>([]);
    readonly localReports = this._localReports.asReadonly();

    readonly pendingCount = computed(() =>
        this._localReports().filter(r => r.status !== 'synced').length
    );

    constructor(
        private http: HttpClient,
        private storage: StorageService,
        private mediaService: MediaService
    ) {
        this.loadLocalReports();
    }

    /**
     * Load local reports from IndexedDB.
     */
    async loadLocalReports(): Promise<void> {
        await this.storage.init();
        const reports = await this.storage.getAllReports();
        this._localReports.set(reports);
    }

    // ============ Report CRUD ============

    /**
     * Create a new report (saved locally first).
     */
    async createReport(data: {
        category: ReportCategory;
        subcategory?: string;
        description?: string;
        latitude: number;
        longitude: number;
        locationAccuracy?: number;
        media: { blob: Blob; type: 'photo' | 'video' }[];
    }): Promise<LocalReport> {
        const clientId = uuidv4();
        const now = new Date();

        // Process media
        const processedMedia: LocalMedia[] = [];
        for (const m of data.media) {
            const mediaItem = await this.mediaService.processMedia(m.blob, m.type);
            processedMedia.push(mediaItem);
            await this.storage.saveMedia(mediaItem, clientId);
        }

        // Create local report
        const localReport: LocalReport = {
            clientId,
            category: data.category,
            subcategory: data.subcategory,
            description: data.description,
            latitude: data.latitude,
            longitude: data.longitude,
            locationAccuracy: data.locationAccuracy,
            capturedAt: now,
            createdAt: now,
            status: 'draft',
            media: processedMedia
        };

        await this.storage.saveReport(localReport);

        // Update signal
        this._localReports.update(reports => [...reports, localReport]);

        return localReport;
    }

    /**
     * Submit a local report to the server.
     */
    async submitReport(clientId: string): Promise<Report | null> {
        const localReport = await this.storage.getReport(clientId);
        if (!localReport) return null;

        // Update status to pending
        await this.storage.updateReportStatus(clientId, 'pending_upload');
        this.updateLocalReportStatus(clientId, 'pending_upload');

        try {
            // Submit report to server
            const response = await this.http.post<Report>(`${environment.apiUrl}/reports`, {
                client_id: localReport.clientId,
                category: localReport.category,
                subcategory: localReport.subcategory,
                description: localReport.description,
                latitude: localReport.latitude,
                longitude: localReport.longitude,
                location_accuracy: localReport.locationAccuracy,
                captured_at: localReport.capturedAt.toISOString()
            }).toPromise();

            if (!response) throw new Error('No response from server');

            // Upload media
            const media = await this.storage.getMediaForReport(clientId);
            for (const m of media) {
                await this.uploadMedia(response.id, m);
            }

            // Mark as synced
            await this.storage.updateReportStatus(clientId, 'synced');
            this.updateLocalReportStatus(clientId, 'synced');

            return response;
        } catch (error: any) {
            await this.storage.updateReportStatus(clientId, 'draft', error.message);
            this.updateLocalReportStatus(clientId, 'draft');
            throw error;
        }
    }

    /**
     * Upload media for a report.
     */
    private async uploadMedia(reportId: string, media: LocalMedia): Promise<void> {
        if (!media.blob) return;

        // Get upload URL
        const uploadInfo = await this.http.post<{
            media_id: string;
            upload_url: string;
            expires_in: number;
            max_size: number;
        }>(`${environment.apiUrl}/reports/${reportId}/media/upload-url`, null, {
            params: {
                media_type: media.mediaType,
                mime_type: media.mimeType,
                file_size: media.fileSize.toString()
            }
        }).toPromise();

        if (!uploadInfo) throw new Error('Failed to get upload URL');

        // Upload to S3
        await fetch(uploadInfo.upload_url, {
            method: 'PUT',
            body: media.blob,
            headers: {
                'Content-Type': media.mimeType
            }
        });

        // Confirm upload
        await this.http.post(`${environment.apiUrl}/reports/${reportId}/media/${uploadInfo.media_id}/confirm`, null, {
            params: {
                media_type: media.mediaType,
                mime_type: media.mimeType,
                file_size: media.fileSize.toString(),
                ...(media.width && { width: media.width.toString() }),
                ...(media.height && { height: media.height.toString() }),
                ...(media.duration && { duration: media.duration.toString() })
            }
        }).toPromise();

        // Update local media status
        await this.storage.updateMediaStatus(media.id, 'uploaded');
    }

    /**
     * Get reports from server with filters.
     */
    getReports(filters: ReportFilters = {}): Observable<PaginatedResponse<Report>> {
        let params = new HttpParams();

        if (filters.categories?.length) {
            filters.categories.forEach(c => params = params.append('categories', c));
        }
        if (filters.statuses?.length) {
            filters.statuses.forEach(s => params = params.append('statuses', s));
        }
        if (filters.minScore !== undefined) params = params.set('min_score', filters.minScore.toString());
        if (filters.maxScore !== undefined) params = params.set('max_score', filters.maxScore.toString());
        if (filters.dateFrom) params = params.set('date_from', filters.dateFrom.toISOString());
        if (filters.dateTo) params = params.set('date_to', filters.dateTo.toISOString());
        if (filters.north !== undefined) params = params.set('north', filters.north.toString());
        if (filters.south !== undefined) params = params.set('south', filters.south.toString());
        if (filters.east !== undefined) params = params.set('east', filters.east.toString());
        if (filters.west !== undefined) params = params.set('west', filters.west.toString());
        if (filters.page) params = params.set('page', filters.page.toString());
        if (filters.pageSize) params = params.set('page_size', filters.pageSize.toString());
        if (filters.sortBy) params = params.set('sort_by', filters.sortBy);
        if (filters.sortOrder) params = params.set('sort_order', filters.sortOrder);

        return this.http.get<PaginatedResponse<Report>>(`${environment.apiUrl}/reports`, { params })
            .pipe(map(response => this.transformReportResponse(response)));
    }

    /**
     * Get reports for map display.
     */
    getMapReports(bounds: { north: number; south: number; east: number; west: number }, filters?: ReportFilters): Observable<ReportMapItem[]> {
        let params = new HttpParams()
            .set('north', bounds.north.toString())
            .set('south', bounds.south.toString())
            .set('east', bounds.east.toString())
            .set('west', bounds.west.toString());

        if (filters?.categories?.length) {
            filters.categories.forEach(c => params = params.append('categories', c));
        }
        if (filters?.statuses?.length) {
            filters.statuses.forEach(s => params = params.append('statuses', s));
        }

        return this.http.get<ReportMapItem[]>(`${environment.apiUrl}/reports/map`, { params });
    }

    /**
     * Get current user's reports.
     */
    getMyReports(page: number = 1, pageSize: number = 20): Observable<PaginatedResponse<Report>> {
        return this.http.get<PaginatedResponse<Report>>(`${environment.apiUrl}/reports/my`, {
            params: { page: page.toString(), page_size: pageSize.toString() }
        }).pipe(map(response => this.transformReportResponse(response)));
    }

    /**
     * Get a single report by ID.
     */
    getReport(id: string): Observable<Report> {
        return this.http.get<Report>(`${environment.apiUrl}/reports/${id}`)
            .pipe(map(report => this.transformReport(report)));
    }

    /**
     * Update a report.
     */
    updateReport(id: string, data: { description?: string; subcategory?: string }): Observable<Report> {
        return this.http.patch<Report>(`${environment.apiUrl}/reports/${id}`, data)
            .pipe(map(report => this.transformReport(report)));
    }

    /**
     * Get score breakdown for a report.
     */
    getScoreBreakdown(id: string): Observable<ReportScoreBreakdown> {
        return this.http.get<ReportScoreBreakdown>(`${environment.apiUrl}/reports/${id}/score`);
    }

    /**
     * Delete a local draft report.
     */
    async deleteLocalReport(clientId: string): Promise<void> {
        await this.storage.deleteReport(clientId);
        this._localReports.update(reports =>
            reports.filter(r => r.clientId !== clientId)
        );
    }

    // ============ Helpers ============

    private updateLocalReportStatus(clientId: string, status: LocalReport['status']): void {
        this._localReports.update(reports =>
            reports.map(r => r.clientId === clientId ? { ...r, status } : r)
        );
    }

    private transformReportResponse(response: PaginatedResponse<any>): PaginatedResponse<Report> {
        return {
            ...response,
            items: response.items.map((item: any) => this.transformReport(item))
        };
    }

    private transformReport(data: any): Report {
        return {
            id: data.id,
            clientId: data.client_id,
            category: data.category,
            subcategory: data.subcategory,
            description: data.description,
            latitude: data.latitude,
            longitude: data.longitude,
            locationAccuracy: data.location_accuracy,
            address: data.address,
            status: data.status,
            totalScore: data.total_score,
            confirmationCount: data.confirmation_count,
            flagCount: data.flag_count,
            isEligibleForEscalation: data.is_eligible_for_escalation,
            capturedAt: new Date(data.captured_at),
            submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
            media: data.media || [],
            statusHistory: data.status_history || [],
            reporterTrustScore: data.reporter_trust_score,
            isOwnReport: data.is_own_report
        };
    }
}
