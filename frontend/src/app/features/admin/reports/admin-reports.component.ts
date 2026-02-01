import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../../environments/environment';
import { Report, STATUS_META, CATEGORY_META } from '../../../core/models';
import { LoadingSpinnerComponent, StatusBadgeComponent, CategoryBadgeComponent } from '../../../shared/components';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-admin-reports',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, LoadingSpinnerComponent, StatusBadgeComponent, CategoryBadgeComponent],
    template: `
    <div class="admin-container">
      <header class="admin-header">
        <a routerLink="/admin" class="back-btn">←</a>
        <h1>Manage Reports</h1>
      </header>

      <!-- Filters -->
      <div class="filters">
        <select [(ngModel)]="statusFilter" (change)="loadReports()">
          <option value="">All Statuses</option>
          @for (status of statusOptions; track status.value) {
            <option [value]="status.value">{{ status.label }}</option>
          }
        </select>
        <select [(ngModel)]="categoryFilter" (change)="loadReports()">
          <option value="">All Categories</option>
          @for (cat of categoryOptions; track cat.value) {
            <option [value]="cat.value">{{ cat.label }}</option>
          }
        </select>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Loading reports..." />
      } @else if (reports().length === 0) {
        <div class="empty">
          <p>No reports found</p>
        </div>
      } @else {
        <div class="reports-list">
          @for (report of reports(); track report.id) {
            <div class="report-card">
              <div class="report-header">
                <app-category-badge [category]="report.category" [showLabel]="false" />
                <app-status-badge [status]="report.status" />
              </div>
              <h3>{{ report.title }}</h3>
              <p class="report-desc">{{ report.description | slice:0:100 }}...</p>
              <div class="report-meta">
                <span>📅 {{ report.createdAt | date:'shortDate' }}</span>
                <span>📍 {{ report.address || 'N/A' }}</span>
              </div>
              <div class="report-stats">
                <span>✓ {{ report.confirmationCount || 0 }}</span>
                <span>⚠ {{ report.flagCount || 0 }}</span>
                <span>Score: {{ (report.verificationScore || 0).toFixed(1) }}</span>
              </div>
              <div class="report-actions">
                <a [routerLink]="['/report', report.id]" class="btn btn-sm btn-outline">View</a>
                <select (change)="updateStatus(report.id, $event)">
                  <option value="" disabled selected>Change Status</option>
                  @for (status of statusOptions; track status.value) {
                    <option [value]="status.value" [selected]="report.status === status.value">
                      {{ status.label }}
                    </option>
                  }
                </select>
              </div>
            </div>
          }
        </div>

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <div class="pagination">
            <button 
              class="btn btn-sm btn-outline"
              [disabled]="currentPage() === 1"
              (click)="goToPage(currentPage() - 1)"
            >
              Previous
            </button>
            <span>Page {{ currentPage() }} of {{ totalPages() }}</span>
            <button 
              class="btn btn-sm btn-outline"
              [disabled]="currentPage() === totalPages()"
              (click)="goToPage(currentPage() + 1)"
            >
              Next
            </button>
          </div>
        }
      }
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

    .filters {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .filters select {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--background);
      font-size: 0.875rem;
    }

    .reports-list {
      padding: 1rem;
    }

    .report-card {
      background: var(--surface);
      border-radius: var(--radius-lg);
      padding: 1rem;
      margin-bottom: 0.75rem;
    }

    .report-header {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .report-card h3 {
      margin: 0 0 0.375rem;
      font-size: 1rem;
    }

    .report-desc {
      margin: 0 0 0.75rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .report-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }

    .report-stats {
      display: flex;
      gap: 1rem;
      font-size: 0.8125rem;
      margin-bottom: 0.75rem;
    }

    .report-actions {
      display: flex;
      gap: 0.5rem;
    }

    .report-actions select {
      flex: 1;
      padding: 0.375rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
    }

    .empty {
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
    }
  `]
})
export class AdminReportsComponent implements OnInit {
    private http = inject(HttpClient);
    private toastService = inject(ToastService);

    reports = signal<Report[]>([]);
    isLoading = signal(true);
    currentPage = signal(1);
    totalPages = signal(1);
    statusFilter = '';
    categoryFilter = '';

    statusOptions = Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }));
    categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }));

    ngOnInit(): void {
        this.loadReports();
    }

    async loadReports(): Promise<void> {
        this.isLoading.set(true);

        try {
            const params: any = { page: this.currentPage(), limit: 20 };
            if (this.statusFilter) params.status = this.statusFilter;
            if (this.categoryFilter) params.category = this.categoryFilter;

            const response = await this.http.get<{ items: Report[]; total: number; pages: number }>(
                `${environment.apiUrl}/admin/reports`,
                { params }
            ).toPromise();

            if (response) {
                this.reports.set(response.items);
                this.totalPages.set(response.pages);
            }
        } catch (error) {
            console.error('Failed to load reports:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    async updateStatus(reportId: string, event: Event): Promise<void> {
        const select = event.target as HTMLSelectElement;
        const newStatus = select.value;
        if (!newStatus) return;

        try {
            await this.http.patch(`${environment.apiUrl}/admin/reports/${reportId}/status`, {
                status: newStatus
            }).toPromise();

            this.toastService.success('Status updated');
            this.loadReports();
        } catch (error) {
            this.toastService.error('Failed to update status');
        }
    }

    goToPage(page: number): void {
        this.currentPage.set(page);
        this.loadReports();
    }
}
