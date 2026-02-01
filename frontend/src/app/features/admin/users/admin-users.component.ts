import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../../environments/environment';
import { User } from '../../../core/models';
import { LoadingSpinnerComponent } from '../../../shared/components';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-admin-users',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, LoadingSpinnerComponent],
    template: `
    <div class="admin-container">
      <header class="admin-header">
        <a routerLink="/admin" class="back-btn">←</a>
        <h1>Manage Users</h1>
      </header>

      <!-- Search -->
      <div class="search-bar">
        <input 
          type="text" 
          [(ngModel)]="searchQuery"
          placeholder="Search by email or name..."
          (keyup.enter)="searchUsers()"
        />
        <button class="btn btn-primary" (click)="searchUsers()">Search</button>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Loading users..." />
      } @else if (users().length === 0) {
        <div class="empty">
          <p>No users found</p>
        </div>
      } @else {
        <div class="users-list">
          @for (user of users(); track user.id) {
            <div class="user-card">
              <div class="user-avatar">
                {{ getInitials(user) }}
              </div>
              <div class="user-info">
                <h3>{{ user.displayName || 'Anonymous' }}</h3>
                <p>{{ user.email || 'No email' }}</p>
                <div class="user-meta">
                  <span class="badge" [class.anon]="user.isAnonymous">
                    {{ user.isAnonymous ? 'Anonymous' : 'Registered' }}
                  </span>
                  <span class="badge role">{{ user.role }}</span>
                  <span>Trust: {{ user.trustScore?.toFixed(1) || '1.0' }}</span>
                </div>
              </div>
              <div class="user-actions">
                <select (change)="updateRole(user.id, $event)">
                  <option value="user" [selected]="user.role === 'user'">User</option>
                  <option value="moderator" [selected]="user.role === 'moderator'">Moderator</option>
                  <option value="admin" [selected]="user.role === 'admin'">Admin</option>
                </select>
                @if (!user.isBanned) {
                  <button class="btn btn-sm btn-danger" (click)="banUser(user.id)">Ban</button>
                } @else {
                  <button class="btn btn-sm btn-success" (click)="unbanUser(user.id)">Unban</button>
                }
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

    .search-bar {
      display: flex;
      gap: 0.5rem;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .search-bar input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
    }

    .users-list {
      padding: 1rem;
    }

    .user-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      margin-bottom: 0.75rem;
    }

    .user-avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      flex-shrink: 0;
    }

    .user-info {
      flex: 1;
      min-width: 0;
    }

    .user-info h3 {
      margin: 0;
      font-size: 0.9375rem;
    }

    .user-info p {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .user-meta {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.375rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .badge {
      padding: 0.125rem 0.5rem;
      background: var(--primary-light);
      border-radius: 999px;
    }

    .badge.anon {
      background: var(--border);
    }

    .badge.role {
      background: var(--warning);
      color: black;
    }

    .user-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .user-actions select {
      padding: 0.375rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
    }

    .btn-success {
      background: var(--success);
      color: white;
      border: none;
    }

    .btn-danger {
      background: var(--danger);
      color: white;
      border: none;
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
export class AdminUsersComponent implements OnInit {
    private http = inject(HttpClient);
    private toastService = inject(ToastService);

    users = signal<User[]>([]);
    isLoading = signal(true);
    currentPage = signal(1);
    totalPages = signal(1);
    searchQuery = '';

    ngOnInit(): void {
        this.loadUsers();
    }

    async loadUsers(): Promise<void> {
        this.isLoading.set(true);

        try {
            const params: any = { page: this.currentPage(), limit: 20 };
            if (this.searchQuery) params.search = this.searchQuery;

            const response = await this.http.get<{ items: User[]; total: number; pages: number }>(
                `${environment.apiUrl}/admin/users`,
                { params }
            ).toPromise();

            if (response) {
                this.users.set(response.items);
                this.totalPages.set(response.pages);
            }
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    searchUsers(): void {
        this.currentPage.set(1);
        this.loadUsers();
    }

    getInitials(user: User): string {
        if (user.isAnonymous) return 'A';
        if (user.displayName) {
            return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        return user.email?.[0]?.toUpperCase() || '?';
    }

    async updateRole(userId: string, event: Event): Promise<void> {
        const select = event.target as HTMLSelectElement;
        const newRole = select.value;

        try {
            await this.http.patch(`${environment.apiUrl}/admin/users/${userId}/role`, {
                role: newRole
            }).toPromise();

            this.toastService.success('Role updated');
            this.loadUsers();
        } catch (error) {
            this.toastService.error('Failed to update role');
        }
    }

    async banUser(userId: string): Promise<void> {
        if (!confirm('Ban this user?')) return;

        try {
            await this.http.post(`${environment.apiUrl}/admin/users/${userId}/ban`, {}).toPromise();
            this.toastService.success('User banned');
            this.loadUsers();
        } catch (error) {
            this.toastService.error('Failed to ban user');
        }
    }

    async unbanUser(userId: string): Promise<void> {
        try {
            await this.http.post(`${environment.apiUrl}/admin/users/${userId}/unban`, {}).toPromise();
            this.toastService.success('User unbanned');
            this.loadUsers();
        } catch (error) {
            this.toastService.error('Failed to unban user');
        }
    }

    goToPage(page: number): void {
        this.currentPage.set(page);
        this.loadUsers();
    }
}
