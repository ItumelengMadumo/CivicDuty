import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReportCategory, CATEGORY_META } from '../../core/models';

@Component({
    selector: 'app-category-badge',
    standalone: true,
    imports: [CommonModule],
    template: `
    <span 
      class="category-badge"
      [style.background-color]="meta().color + '15'"
      [style.color]="meta().color"
    >
      <span class="category-icon">{{ meta().icon }}</span>
      @if (showLabel) {
        <span class="category-label">{{ meta().label }}</span>
      }
    </span>
  `,
    styles: [`
    .category-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-md);
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .category-icon {
      font-size: 1rem;
    }
  `]
})
export class CategoryBadgeComponent {
    @Input({ required: true }) category!: ReportCategory;
    @Input() showLabel = true;

    meta = computed(() => {
        return CATEGORY_META[this.category] || {
            label: this.category,
            icon: '📌',
            color: '#6b7280',
            description: ''
        };
    });
}
