import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { NetworkService } from '../../core/services/network.service';
import { ReportService } from '../../core/services/report.service';

@Component({
    selector: 'app-offline-banner',
    standalone: true,
    imports: [CommonModule],
    template: `
    @if (!network.isOnline()) {
      <div class="offline-banner">
        <span class="offline-icon">📡</span>
        <div class="offline-content">
          <span class="offline-text">You're offline</span>
          @if (pendingCount() > 0) {
            <span class="offline-pending">{{ pendingCount() }} report(s) pending sync</span>
          }
        </div>
      </div>
    }
  `,
    styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      padding-top: calc(0.75rem + env(safe-area-inset-top));
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      z-index: 9998;
      animation: slideDown 0.3s ease;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
      }
      to {
        transform: translateY(0);
      }
    }

    .offline-icon {
      font-size: 1.25rem;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .offline-content {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .offline-text {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .offline-pending {
      font-size: 0.75rem;
      opacity: 0.9;
    }
  `]
})
export class OfflineBannerComponent {
    network = inject(NetworkService);
    private reportService = inject(ReportService);

    pendingCount = this.reportService.pendingCount;
}
