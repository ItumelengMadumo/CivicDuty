import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { StorageService } from '../../core/services/storage.service';
import { User } from '../../core/models';
import { LoadingSpinnerComponent } from '../../shared/components';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, RouterModule, ReactiveFormsModule, LoadingSpinnerComponent],
    template: `
    <div class="profile-container">
      <header class="page-header">
        <h1>Profile</h1>
      </header>

      @if (user()) {
        <!-- User Info Card -->
        <div class="user-card">
          <div class="user-avatar">
            {{ getInitials() }}
          </div>
          <div class="user-info">
            @if (user()!.isAnonymous) {
              <h2>Anonymous User</h2>
              <p class="user-type">Limited features available</p>
            } @else {
              <h2>{{ user()!.displayName || user()!.email }}</h2>
              <p class="user-email">{{ user()!.email }}</p>
            }
          </div>
          <span class="trust-badge" [style.background]="getTrustColor()">
            Trust: {{ user()!.trustScore?.toFixed(1) || '1.0' }}
          </span>
        </div>

        <!-- Anonymous User Prompt -->
        @if (user()!.isAnonymous) {
          <div class="cta-card">
            <h3>🔓 Unlock Full Features</h3>
            <p>Create an account to build trust, track your impact, and access more features.</p>
            <a routerLink="/auth/register" class="btn btn-primary btn-block">Create Account</a>
          </div>
        }

        <!-- Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon">📝</span>
            <span class="stat-value">{{ stats().reportsCount }}</span>
            <span class="stat-label">Reports</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">✓</span>
            <span class="stat-value">{{ stats().validationsCount }}</span>
            <span class="stat-label">Validations</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">⭐</span>
            <span class="stat-value">{{ stats().verifiedCount }}</span>
            <span class="stat-label">Verified</span>
          </div>
        </div>

        <!-- Settings -->
        <div class="settings-section">
          <h3>Settings</h3>
          
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Push Notifications</span>
              <span class="setting-description">Get notified about your reports</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [(ngModel)]="notificationsEnabled" (change)="updateNotifications()" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Location Sharing</span>
              <span class="setting-description">Required for creating reports</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [checked]="locationEnabled()" disabled />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">Dark Mode</span>
              <span class="setting-description">Reduce eye strain</span>
            </div>
            <label class="toggle">
              <input type="checkbox" [(ngModel)]="darkMode" (change)="updateTheme()" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Storage -->
        <div class="settings-section">
          <h3>Storage</h3>
          <div class="storage-info">
            <span>Local data: {{ getStorageSize() }}</span>
            <button class="btn btn-outline btn-sm" (click)="clearCache()">Clear Cache</button>
          </div>
        </div>

        <!-- Account Actions -->
        @if (!user()!.isAnonymous) {
          <div class="settings-section">
            <h3>Account</h3>
            <button class="btn btn-outline btn-block" (click)="editProfile()">
              Edit Profile
            </button>
            <button class="btn btn-outline btn-danger btn-block" (click)="logout()">
              Sign Out
            </button>
          </div>
        }

        <!-- About -->
        <div class="about-section">
          <p class="version">CivicDuty v1.0.0</p>
          <div class="links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Help & Support</a>
          </div>
        </div>
      }
    </div>
  `,
    styles: [`
    .profile-container {
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--background);
      padding-bottom: 5rem;
    }

    .page-header {
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .page-header h1 {
      margin: 0;
      font-size: 1.25rem;
    }

    .user-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .user-avatar {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      font-weight: 700;
    }

    .user-info {
      flex: 1;
    }

    .user-info h2 {
      margin: 0 0 0.25rem;
      font-size: 1.125rem;
    }

    .user-type,
    .user-email {
      margin: 0;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .trust-badge {
      padding: 0.375rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
    }

    .cta-card {
      margin: 1rem;
      padding: 1.25rem;
      background: linear-gradient(135deg, var(--primary-light) 0%, var(--surface) 100%);
      border-radius: var(--radius-lg);
      border: 1px solid var(--primary);
    }

    .cta-card h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .cta-card p {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      padding: 1rem;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      text-align: center;
    }

    .stat-icon {
      font-size: 1.5rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .settings-section {
      margin: 1rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
    }

    .settings-section h3 {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }

    .setting-item:last-child {
      border-bottom: none;
    }

    .setting-label {
      display: block;
      font-weight: 500;
    }

    .setting-description {
      display: block;
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.125rem;
    }

    .toggle {
      position: relative;
      width: 3rem;
      height: 1.75rem;
      cursor: pointer;
    }

    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--border);
      border-radius: 999px;
      transition: background 0.2s ease;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 1.25rem;
      height: 1.25rem;
      left: 0.25rem;
      top: 0.25rem;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s ease;
    }

    .toggle input:checked + .toggle-slider {
      background: var(--primary);
    }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(1.25rem);
    }

    .storage-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .btn-danger {
      color: var(--danger);
      border-color: var(--danger);
    }

    .btn-danger:hover {
      background: var(--danger);
      color: white;
    }

    .btn-block + .btn-block {
      margin-top: 0.75rem;
    }

    .about-section {
      text-align: center;
      padding: 2rem 1rem;
    }

    .version {
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin: 0 0 1rem;
    }

    .links {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
    }

    .links a {
      color: var(--text-secondary);
      font-size: 0.8125rem;
      text-decoration: none;
    }

    .links a:hover {
      color: var(--primary);
    }
  `]
})
export class ProfileComponent implements OnInit {
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private storageService = inject(StorageService);
    private router = inject(Router);

    user = this.authService.user;

    notificationsEnabled = true;
    darkMode = false;
    locationEnabled = signal(false);

    stats = signal({
        reportsCount: 0,
        validationsCount: 0,
        verifiedCount: 0
    });

    ngOnInit(): void {
        this.loadStats();
        this.checkLocationPermission();
        this.loadThemePreference();
    }

    async loadStats(): Promise<void> {
        try {
            const reports = await this.storageService.getAllReports();
            this.stats.set({
                reportsCount: reports.length,
                validationsCount: 0, // TODO: Load from server
                verifiedCount: reports.filter(r => r.status === 'verified').length
            });
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    async checkLocationPermission(): Promise<void> {
        if ('permissions' in navigator) {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            this.locationEnabled.set(result.state === 'granted');
        }
    }

    loadThemePreference(): void {
        this.darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    }

    getInitials(): string {
        const user = this.user();
        if (!user) return '?';
        if (user.isAnonymous) return 'A';
        if (user.displayName) {
            return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        return user.email?.[0]?.toUpperCase() || '?';
    }

    getTrustColor(): string {
        const score = this.user()?.trustScore || 1;
        if (score >= 4) return 'var(--success)';
        if (score >= 2.5) return 'var(--primary)';
        if (score >= 1.5) return 'var(--warning)';
        return 'var(--danger)';
    }

    updateNotifications(): void {
        // TODO: Implement push notification toggle
        this.toastService.info(this.notificationsEnabled ? 'Notifications enabled' : 'Notifications disabled');
    }

    updateTheme(): void {
        document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
        localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
    }

    getStorageSize(): string {
        // Estimate storage usage
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            navigator.storage.estimate().then(estimate => {
                const used = estimate.usage || 0;
                console.log('Storage used:', this.formatBytes(used));
            });
        }
        return 'Calculating...';
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async clearCache(): Promise<void> {
        if (!confirm('Clear all cached data?')) return;

        try {
            await this.storageService.clearCache();
            this.toastService.success('Cache cleared');
        } catch (error) {
            this.toastService.error('Failed to clear cache');
        }
    }

    editProfile(): void {
        // TODO: Implement profile edit
        this.toastService.info('Coming soon!');
    }

    logout(): void {
        if (confirm('Sign out?')) {
            this.authService.logout();
            this.router.navigate(['/']);
        }
    }
}
