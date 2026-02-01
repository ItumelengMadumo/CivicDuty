import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { ReportService } from '../../core/services/report.service';
import { StorageService } from '../../core/services/storage.service';
import { NetworkService } from '../../core/services/network.service';
import { SyncService } from '../../core/services/sync.service';
import { ToastService } from '../../core/services/toast.service';
import { LocalReport, CATEGORY_META, STATUS_META } from '../../core/models';
import {
    LoadingSpinnerComponent,
    CategoryBadgeComponent,
    StatusBadgeComponent
} from '../../shared/components';

type FilterTab = 'all' | 'pending' | 'synced' | 'draft';

@Component({
    selector: 'app-my-reports',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, CategoryBadgeComponent, StatusBadgeComponent],
    template: `
    <div class="my-reports-container">
      <header class="page-header">
        <h1>My Reports</h1>
        @if (pendingCount() > 0) {
          <button class="sync-btn" (click)="syncAll()" [disabled]="isSyncing() || !isOnline()">
            @if (isSyncing()) {
              <app-loading-spinner size="sm" />
            } @else {
              🔄 Sync ({{ pendingCount() }})
            }
          </button>
        }
      </header>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        @for (tab of tabs; track tab.value) {
          <button 
            class="tab"
            [class.active]="activeTab() === tab.value"
            (click)="setTab(tab.value)"
          >
            {{ tab.label }}
            @if (tab.count > 0) {
              <span class="tab-count">{{ tab.count }}</span>
            }
          </button>
        }
      </div>

      <!-- Reports List -->
      <div class="reports-list">
        @if (isLoading()) {
          <app-loading-spinner message="Loading your reports..." />
        } @else if (filteredReports().length === 0) {
          <div class="empty-state">
            <span class="empty-icon">📋</span>
            <h3>No reports yet</h3>
            <p>Start documenting issues in your community.</p>
            <a routerLink="/report/new" class="btn btn-primary">Create Report</a>
          </div>
        } @else {
          @for (report of filteredReports(); track report.clientId || report.id) {
            <a 
              [routerLink]="report.id ? ['/report', report.id] : null"
              class="report-card"
              [class.clickable]="!!report.id"
              [class.pending]="!report.synced"
            >
              <!-- Thumbnail -->
              <div class="report-thumb">
                @if (report.thumbnailUrl) {
                  <img [src]="report.thumbnailUrl" [alt]="report.title" />
                } @else {
                  <span class="thumb-placeholder">
                    {{ CATEGORY_META[report.category]?.icon || '📌' }}
                  </span>
                }
              </div>

              <!-- Content -->
              <div class="report-content">
                <div class="report-header">
                  <app-category-badge [category]="report.category" [showLabel]="false" />
                  <app-status-badge [status]="report.status" />
                </div>
                <h3 class="report-title">{{ report.title }}</h3>
                <p class="report-description">{{ report.description | slice:0:80 }}...</p>
                <div class="report-meta">
                  <span>{{ report.createdAt | date:'shortDate' }}</span>
                  @if (!report.synced) {
                    <span class="sync-status">
                      @if (report.syncError) {
                        <span class="sync-error">⚠️ {{ report.syncError }}</span>
                      } @else {
                        <span class="sync-pending">⏳ Pending sync</span>
                      }
                    </span>
                  }
                </div>
              </div>

              <!-- Actions -->
              <div class="report-actions">
                @if (!report.synced && report.status === 'draft') {
                  <button class="action-btn" (click)="submitDraft($event, report)">
                    📤
                  </button>
                }
                <button class="action-btn" (click)="deleteReport($event, report)">
                  🗑️
                </button>
              </div>
            </a>
          }
        }
      </div>

      <!-- FAB -->
      <a routerLink="/report/new" class="fab">+</a>
    </div>
  `,
    styles: [`
    .my-reports-container {
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--background);
      padding-bottom: 5rem;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .page-header h1 {
      margin: 0;
      font-size: 1.25rem;
    }

    .sync-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      cursor: pointer;
    }

    .sync-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .filter-tabs {
      display: flex;
      padding: 0 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      font-size: 0.875rem;
      color: var(--text-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
    }

    .tab:hover {
      color: var(--text);
    }

    .tab.active {
      color: var(--primary);
      border-color: var(--primary);
    }

    .tab-count {
      padding: 0.125rem 0.375rem;
      background: var(--border);
      border-radius: 999px;
      font-size: 0.75rem;
    }

    .tab.active .tab-count {
      background: var(--primary);
      color: white;
    }

    .reports-list {
      padding: 1rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem;
    }

    .empty-state p {
      color: var(--text-secondary);
      margin: 0 0 1.5rem;
    }

    .report-card {
      display: flex;
      gap: 0.75rem;
      padding: 0.875rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      margin-bottom: 0.75rem;
      text-decoration: none;
      color: inherit;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .report-card.clickable:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .report-card.pending {
      border-left: 3px solid var(--warning);
    }

    .report-thumb {
      width: 4rem;
      height: 4rem;
      border-radius: var(--radius-md);
      overflow: hidden;
      flex-shrink: 0;
      background: var(--background);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .report-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumb-placeholder {
      font-size: 1.5rem;
    }

    .report-content {
      flex: 1;
      min-width: 0;
    }

    .report-header {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }

    .report-title {
      margin: 0 0 0.25rem;
      font-size: 0.9375rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .report-description {
      margin: 0 0 0.375rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .report-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .sync-status {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .sync-pending {
      color: var(--warning);
    }

    .sync-error {
      color: var(--danger);
    }

    .report-actions {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .action-btn {
      width: 2rem;
      height: 2rem;
      border: none;
      background: none;
      font-size: 1rem;
      cursor: pointer;
      border-radius: var(--radius-sm);
      transition: background 0.2s ease;
    }

    .action-btn:hover {
      background: var(--background);
    }

    .fab {
      position: fixed;
      bottom: 5.5rem;
      right: 1rem;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      text-decoration: none;
      box-shadow: var(--shadow-lg);
      z-index: 100;
    }
  `]
})
export class MyReportsComponent implements OnInit {
    private reportService = inject(ReportService);
    private storageService = inject(StorageService);
    private networkService = inject(NetworkService);
    private syncService = inject(SyncService);
    private toastService = inject(ToastService);

    CATEGORY_META = CATEGORY_META;

    reports = signal<LocalReport[]>([]);
    isLoading = signal(true);
    isSyncing = signal(false);
    activeTab = signal<FilterTab>('all');

    isOnline = this.networkService.isOnline;
    pendingCount = this.reportService.pendingCount;

    tabs = computed(() => {
        const all = this.reports();
        const pending = all.filter(r => !r.synced && r.status !== 'draft');
        const synced = all.filter(r => r.synced);
        const drafts = all.filter(r => r.status === 'draft');

        return [
            { value: 'all' as FilterTab, label: 'All', count: all.length },
            { value: 'pending' as FilterTab, label: 'Pending', count: pending.length },
            { value: 'synced' as FilterTab, label: 'Synced', count: synced.length },
            { value: 'draft' as FilterTab, label: 'Drafts', count: drafts.length }
        ];
    });

    filteredReports = computed(() => {
        const all = this.reports();
        const tab = this.activeTab();

        switch (tab) {
            case 'pending':
                return all.filter(r => !r.synced && r.status !== 'draft');
            case 'synced':
                return all.filter(r => r.synced);
            case 'draft':
                return all.filter(r => r.status === 'draft');
            default:
                return all;
        }
    });

    ngOnInit(): void {
        this.loadReports();
    }

    async loadReports(): Promise<void> {
        this.isLoading.set(true);

        try {
            const reports = await this.storageService.getAllReports();
            // Sort by date, newest first
            reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            this.reports.set(reports);
        } catch (error) {
            console.error('Failed to load reports:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    setTab(tab: FilterTab): void {
        this.activeTab.set(tab);
    }

    async syncAll(): Promise<void> {
        if (this.isSyncing() || !this.isOnline()) return;

        this.isSyncing.set(true);

        try {
            await this.syncService.sync();
            await this.loadReports();
            this.toastService.success('Sync complete!');
        } catch (error) {
            this.toastService.error('Sync failed');
        } finally {
            this.isSyncing.set(false);
        }
    }

    async submitDraft(event: Event, report: LocalReport): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        try {
            await this.storageService.updateReportStatus(report.clientId, 'pending');
            await this.reportService.submitReport(report.clientId);
            await this.loadReports();
            this.toastService.success('Report submitted!');
        } catch (error: any) {
            this.toastService.info('Will sync when online');
            await this.loadReports();
        }
    }

    async deleteReport(event: Event, report: LocalReport): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        if (!confirm('Delete this report?')) return;

        try {
            await this.storageService.deleteReport(report.clientId);
            await this.loadReports();
            this.toastService.success('Report deleted');
        } catch (error) {
            this.toastService.error('Failed to delete report');
        }
    }
}
