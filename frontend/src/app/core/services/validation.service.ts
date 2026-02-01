import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Validation, ValidationCreate, ValidationType } from '../models';
import { StorageService } from './storage.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';

export interface ValidationStats {
    total: number;
    confirmations: number;
    flags: number;
    spam: number;
    uniqueUsers: number;
}

@Injectable({
    providedIn: 'root'
})
export class ValidationService {
    private http = inject(HttpClient);
    private storage = inject(StorageService);
    private network = inject(NetworkService);
    private auth = inject(AuthService);

    private readonly baseUrl = `${environment.apiUrl}/validations`;

    /**
     * Create a validation for a report.
     */
    async createValidation(validation: ValidationCreate): Promise<Validation | null> {
        // Check if user has already validated this report
        const existing = await this.getUserValidation(validation.reportId);
        if (existing) {
            throw new Error('You have already validated this report');
        }

        if (this.network.isOnline()) {
            try {
                const result = await this.http.post<Validation>(this.baseUrl, validation).toPromise();
                return result || null;
            } catch (error: any) {
                // Queue for later sync if offline
                await this.queueValidation(validation);
                return null;
            }
        } else {
            // Queue for later sync
            await this.queueValidation(validation);
            return null;
        }
    }

    /**
     * Get validations for a report.
     */
    getReportValidations(reportId: string): Observable<Validation[]> {
        return this.http.get<Validation[]>(`${this.baseUrl}/report/${reportId}`);
    }

    /**
     * Get validation statistics for a report.
     */
    getReportStats(reportId: string): Observable<ValidationStats> {
        return this.http.get<ValidationStats>(`${this.baseUrl}/report/${reportId}/stats`);
    }

    /**
     * Get user's validation for a specific report.
     */
    async getUserValidation(reportId: string): Promise<Validation | null> {
        const user = this.auth.user();
        if (!user) return null;

        try {
            const validation = await this.http.get<Validation | null>(
                `${this.baseUrl}/user/${user.id}/report/${reportId}`
            ).toPromise();
            return validation || null;
        } catch {
            return null;
        }
    }

    /**
     * Delete a validation.
     */
    async deleteValidation(validationId: string): Promise<void> {
        await this.http.delete(`${this.baseUrl}/${validationId}`).toPromise();
    }

    /**
     * Queue validation for offline sync.
     */
    private async queueValidation(validation: ValidationCreate): Promise<void> {
        await this.storage.addToSyncQueue({
            id: crypto.randomUUID(),
            type: 'validation',
            action: 'create',
            data: validation,
            timestamp: Date.now(),
            attempts: 0
        });
    }

    /**
     * Check if user can validate a report.
     */
    async canValidate(reportId: string, reporterId: string): Promise<boolean> {
        const user = this.auth.user();

        // Must be logged in
        if (!user) return false;

        // Cannot validate own reports
        if (user.id === reporterId) return false;

        // Cannot validate twice
        const existing = await this.getUserValidation(reportId);
        if (existing) return false;

        return true;
    }

    /**
     * Get validation type options with descriptions.
     */
    getValidationTypes(): { value: ValidationType; label: string; description: string }[] {
        return [
            {
                value: 'confirmation',
                label: 'Confirm',
                description: 'I can verify this issue exists'
            },
            {
                value: 'flag',
                label: 'Flag',
                description: 'This report seems inaccurate or misleading'
            },
            {
                value: 'spam',
                label: 'Report Spam',
                description: 'This is spam or inappropriate content'
            }
        ];
    }

    /**
     * Calculate weighted validation score.
     */
    calculateScore(validations: Validation[]): number {
        if (validations.length === 0) return 0;

        let weightedSum = 0;
        let totalWeight = 0;

        for (const v of validations) {
            const weight = v.validatorTrustScore || 1;
            let value: number;

            switch (v.type) {
                case 'confirmation':
                    value = 1;
                    break;
                case 'flag':
                    value = -1;
                    break;
                case 'spam':
                    value = -2;
                    break;
                default:
                    value = 0;
            }

            // Add proximity bonus
            const proximityBonus = v.proximityMeters && v.proximityMeters < 100 ? 0.5 : 0;
            const mediaBonus = v.mediaCount && v.mediaCount > 0 ? 0.25 : 0;

            weightedSum += value * weight * (1 + proximityBonus + mediaBonus);
            totalWeight += weight;
        }

        return weightedSum / totalWeight;
    }
}
