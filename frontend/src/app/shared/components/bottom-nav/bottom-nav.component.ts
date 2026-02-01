import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ReportService } from '../../core/services/report.service';

interface NavItem {
    path: string;
    label: string;
    icon: string;
    badge?: number;
}

@Component({
    selector: 'app-bottom-nav',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
    <nav class="bottom-nav">
      @for (item of navItems; track item.path) {
        <a 
          [routerLink]="item.path" 
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: item.path === '/' }"
          class="nav-item"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
          @if (item.badge && item.badge > 0) {
            <span class="nav-badge">{{ item.badge }}</span>
          }
        </a>
      }
    </nav>
  `,
    styles: [`
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-around;
      align-items: center;
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 0.5rem 0;
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
      z-index: 1000;
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 0.5rem 1rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.2s ease;
      position: relative;
      min-width: 4rem;
    }

    .nav-item:hover,
    .nav-item.active {
      color: var(--primary);
    }

    .nav-item.active .nav-icon {
      transform: scale(1.1);
    }

    .nav-icon {
      font-size: 1.5rem;
      transition: transform 0.2s ease;
    }

    .nav-label {
      font-size: 0.75rem;
      font-weight: 500;
    }

    .nav-badge {
      position: absolute;
      top: 0;
      right: 0.5rem;
      background: var(--danger);
      color: white;
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.375rem;
      border-radius: 999px;
      min-width: 1rem;
      text-align: center;
    }

    @media (min-width: 768px) {
      .bottom-nav {
        display: none;
      }
    }
  `]
})
export class BottomNavComponent {
    private auth = inject(AuthService);
    private reportService = inject(ReportService);

    get navItems(): NavItem[] {
        const items: NavItem[] = [
            { path: '/', label: 'Map', icon: '🗺️' },
            { path: '/report/new', label: 'Report', icon: '📝' },
            { path: '/my-reports', label: 'My Reports', icon: '📋', badge: this.reportService.pendingCount() },
            { path: '/profile', label: 'Profile', icon: '👤' }
        ];

        if (this.auth.isAdmin()) {
            items.push({ path: '/admin', label: 'Admin', icon: '⚙️' });
        }

        return items;
    }
}
