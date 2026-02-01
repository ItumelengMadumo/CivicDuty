import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { LoadingSpinnerComponent } from '../../../shared/components';

interface DashboardStats {
    totalReports: number;
    pendingReports: number;
    verifiedReports: number;
    totalUsers: number;
    reportsToday: number;
    validationsToday: number;
}

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
    template: `
    <div class="admin-container">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
      </header>

      @if (isLoading()) {
        <app-loading-spinner message="Loading stats..." />
      } @else {
        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon">📝</span>
            <div class="stat-content">
              <span class="stat-value">{{ stats().totalReports }}</span>
              <span class="stat-label">Total Reports</span>
            </div>
          </div>
          <div class="stat-card warning">
            <span class="stat-icon">⏳</span>
            <div class="stat-content">
              <span class="stat-value">{{ stats().pendingReports }}</span>
              <span class="stat-label">Pending Review</span>
            </div>
          </div>
          <div class="stat-card success">
            <span class="stat-icon">✓</span>
            <div class="stat-content">
              <span class="stat-value">{{ stats().verifiedReports }}</span>
              <span class="stat-label">Verified</span>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">👥</span>
            <div class="stat-content">
              <span class="stat-value">{{ stats().totalUsers }}</span>
              <span class="stat-label">Total Users</span>
            </div>
          </div>
        </div>

        <!-- Today's Activity -->
        <div class="section">
          <h2>Today's Activity</h2>
          <div class="activity-grid">
            <div class="activity-item">
              <span class="activity-value">{{ stats().reportsToday }}</span>
              <span class="activity-label">New Reports</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ stats().validationsToday }}</span>
              <span class="activity-label">Validations</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="section">
          <h2>Quick Actions</h2>
          <div class="actions-grid">
            <a routerLink="/admin/reports" class="action-card">
              <span class="action-icon">📋</span>
              <span class="action-label">Review Reports</span>
              @if (stats().pendingReports > 0) {
                <span class="action-badge">{{ stats().pendingReports }}</span>
              }
            </a>
            <a routerLink="/admin/users" class="action-card">
              <span class="action-icon">👥</span>
              <span class="action-label">Manage Users</span>
            </a>
            <a routerLink="/admin/exports" class="action-card">
              <span class="action-icon">📤</span>
              <span class="action-label">Export Data</span>
            </a>
          </div>
        </div>
      }
    </div>
  `,
    styles: [`
    .admin-container {
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--background);
      padding-bottom: 2rem;
    }

    .admin-header {
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .admin-header h1 {
      margin: 0;
      font-size: 1.25rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      padding: 1rem;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      border-left: 4px solid var(--primary);
    }

    .stat-card.warning {
      border-color: var(--warning);
    }

    .stat-card.success {
      border-color: var(--success);
    }

    .stat-icon {
      font-size: 1.5rem;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .section {
      padding: 0 1rem;
      margin-bottom: 1.5rem;
    }

    .section h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 1rem;
    }

    .activity-grid {
      display: flex;
      gap: 1rem;
    }

    .activity-item {
      flex: 1;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      text-align: center;
    }

    .activity-value {
      display: block;
      font-size: 2rem;
      font-weight: 700;
    }

    .activity-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }

    .action-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 0.75rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      text-decoration: none;
      color: inherit;
      position: relative;
      transition: transform 0.2s ease;
    }

    .action-card:hover {
      transform: translateY(-2px);
    }

    .action-icon {
      font-size: 1.75rem;
    }

    .action-label {
      font-size: 0.75rem;
      text-align: center;
      color: var(--text-secondary);
    }

    .action-badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: var(--danger);
      color: white;
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.375rem;
      border-radius: 999px;
    }
  `]
})
export class AdminDashboardComponent implements OnInit {
    private http = inject(HttpClient);

    isLoading = signal(true);
    stats = signal<DashboardStats>({
        totalReports: 0,
        pendingReports: 0,
        verifiedReports: 0,
        totalUsers: 0,
        reportsToday: 0,
        validationsToday: 0
    });

    ngOnInit(): void {
        this.loadStats();
    }

    async loadStats(): Promise<void> {
        try {
            const stats = await this.http.get<DashboardStats>(
                `${environment.apiUrl}/admin/stats`
            ).toPromise();

            if (stats) {
                this.stats.set(stats);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            this.isLoading.set(false);
        }
    }
}
