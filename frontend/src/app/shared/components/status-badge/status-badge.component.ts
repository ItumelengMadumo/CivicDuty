import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReportStatus, STATUS_META } from '../../core/models';

@Component({
    selector: 'app-status-badge',
    standalone: true,
    imports: [CommonModule],
    template: `
    <span 
      class="status-badge"
      [style.background-color]="meta().color + '20'"
      [style.color]="meta().color"
      [style.border-color]="meta().color"
    >
      <span class="status-icon">{{ meta().icon }}</span>
      <span class="status-label">{{ meta().label }}</span>
    </span>
  `,
    styles: [`
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid;
    }

    .status-icon {
      font-size: 0.875rem;
    }
  `]
})
export class StatusBadgeComponent {
    @Input({ required: true }) status!: ReportStatus;

    meta = computed(() => {
        return STATUS_META[this.status] || { label: this.status, color: '#6b7280', icon: '❓' };
    });
}
