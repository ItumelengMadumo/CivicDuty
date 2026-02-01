import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../../environments/environment';
import { Export, CATEGORY_META } from '../../../core/models';
import { LoadingSpinnerComponent } from '../../../shared/components';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-admin-exports',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, LoadingSpinnerComponent],
    template: `
    <div class="admin-container">
      <header class="admin-header">
        <a routerLink="/admin" class="back-btn">←</a>
        <h1>Data Exports</h1>
      </header>

      <!-- Create Export -->
      <div class="create-export">
        <h2>Create New Export</h2>
        <form (ngSubmit)="createExport()">
          <div class="form-row">
            <div class="form-group">
              <label>Format</label>
              <select [(ngModel)]="exportForm.format" name="format">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="geojson">GeoJSON</option>
              </select>
            </div>
            <div class="form-group">
              <label>Category (optional)</label>
              <select [(ngModel)]="exportForm.category" name="category">
                <option value="">All Categories</option>
                @for (cat of categoryOptions; track cat.value) {
                  <option [value]="cat.value">{{ cat.label }}</option>
                }
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Date From</label>
              <input type="date" [(ngModel)]="exportForm.dateFrom" name="dateFrom" />
            </div>
            <div class="form-group">
              <label>Date To</label>
              <input type="date" [(ngModel)]="exportForm.dateTo" name="dateTo" />
            </div>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" [(ngModel)]="exportForm.includeMedia" name="includeMedia" />
              Include media files
            </label>
          </div>
          <button type="submit" class="btn btn-primary" [disabled]="isCreating()">
            @if (isCreating()) {
              Creating...
            } @else {
              Create Export
            }
          </button>
        </form>
      </div>

      <!-- Export History -->
      <div class="exports-section">
        <h2>Export History</h2>
        
        @if (isLoading()) {
          <app-loading-spinner message="Loading exports..." />
        } @else if (exports().length === 0) {
          <div class="empty">
            <p>No exports yet</p>
          </div>
        } @else {
          <div class="exports-list">
            @for (exp of exports(); track exp.id) {
              <div class="export-card">
                <div class="export-icon">
                  {{ getFormatIcon(exp.format) }}
                </div>
                <div class="export-info">
                  <h3>{{ exp.format.toUpperCase() }} Export</h3>
                  <p>{{ exp.recordCount }} records · {{ formatFileSize(exp.fileSize) }}</p>
                  <span class="export-date">{{ exp.createdAt | date:'medium' }}</span>
                </div>
                <div class="export-status" [class]="'status-' + exp.status">
                  @if (exp.status === 'pending') {
                    ⏳ Processing
                  } @else if (exp.status === 'completed') {
                    ✓ Ready
                  } @else {
                    ✕ Failed
                  }
                </div>
                @if (exp.status === 'completed' && exp.downloadUrl) {
                  <a [href]="exp.downloadUrl" class="btn btn-sm btn-primary" download>
                    Download
                  </a>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
    styles: [`
    .admin-container {
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--background);
    }

    .admin-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .back-btn {
      font-size: 1.25rem;
      text-decoration: none;
      color: inherit;
    }

    .admin-header h1 {
      margin: 0;
      font-size: 1.125rem;
    }

    .create-export {
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .create-export h2 {
      margin: 0 0 1rem;
      font-size: 1rem;
    }

    .form-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .form-group {
      flex: 1;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .form-group select,
    .form-group input[type="date"] {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
    }

    .form-group input[type="checkbox"] {
      margin-right: 0.5rem;
    }

    .exports-section {
      padding: 1rem;
    }

    .exports-section h2 {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
    }

    .export-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      margin-bottom: 0.75rem;
    }

    .export-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md);
      background: var(--primary-light);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
    }

    .export-info {
      flex: 1;
    }

    .export-info h3 {
      margin: 0;
      font-size: 0.9375rem;
    }

    .export-info p {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .export-date {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .export-status {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
    }

    .status-pending {
      background: rgba(234, 179, 8, 0.1);
      color: var(--warning);
    }

    .status-completed {
      background: rgba(34, 197, 94, 0.1);
      color: var(--success);
    }

    .status-failed {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
    }
  `]
})
export class AdminExportsComponent implements OnInit {
    private http = inject(HttpClient);
    private toastService = inject(ToastService);

    exports = signal<Export[]>([]);
    isLoading = signal(true);
    isCreating = signal(false);

    exportForm = {
        format: 'csv',
        category: '',
        dateFrom: '',
        dateTo: '',
        includeMedia: false
    };

    categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }));

    ngOnInit(): void {
        this.loadExports();
    }

    async loadExports(): Promise<void> {
        this.isLoading.set(true);

        try {
            const exports = await this.http.get<Export[]>(
                `${environment.apiUrl}/exports`
            ).toPromise();

            if (exports) {
                this.exports.set(exports);
            }
        } catch (error) {
            console.error('Failed to load exports:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    async createExport(): Promise<void> {
        this.isCreating.set(true);

        try {
            const payload: any = { format: this.exportForm.format };
            if (this.exportForm.category) payload.category = this.exportForm.category;
            if (this.exportForm.dateFrom) payload.dateFrom = this.exportForm.dateFrom;
            if (this.exportForm.dateTo) payload.dateTo = this.exportForm.dateTo;
            if (this.exportForm.includeMedia) payload.includeMedia = true;

            await this.http.post(`${environment.apiUrl}/exports`, payload).toPromise();

            this.toastService.success('Export started! Check back soon.');
            this.loadExports();
        } catch (error) {
            this.toastService.error('Failed to create export');
        } finally {
            this.isCreating.set(false);
        }
    }

    getFormatIcon(format: string): string {
        switch (format) {
            case 'csv': return '📊';
            case 'json': return '📋';
            case 'geojson': return '🗺️';
            default: return '📄';
        }
    }

    formatFileSize(bytes?: number): string {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}
