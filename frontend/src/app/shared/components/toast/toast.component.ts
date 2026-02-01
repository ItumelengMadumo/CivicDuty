import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ToastService, Toast } from '../../core/services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="toast-container">
      @for (toast of toastService.activeToasts(); track toast.id) {
        <div 
          class="toast"
          [class]="'toast-' + toast.type"
          [@slideIn]
        >
          <span class="toast-icon">{{ toastService.getIcon(toast.type) }}</span>
          <span class="toast-message">{{ toast.message }}</span>
          @if (toast.action) {
            <button class="toast-action" (click)="onAction(toast)">
              {{ toast.action.label }}
            </button>
          }
          <button class="toast-close" (click)="dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
    styles: [`
    .toast-container {
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: calc(100% - 2rem);
      max-width: 400px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      background: var(--surface);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      border-left: 4px solid;
      pointer-events: auto;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-1rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .toast-success {
      border-color: var(--success);
    }

    .toast-error {
      border-color: var(--danger);
    }

    .toast-warning {
      border-color: var(--warning);
    }

    .toast-info {
      border-color: var(--primary);
    }

    .toast-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .toast-success .toast-icon { color: var(--success); }
    .toast-error .toast-icon { color: var(--danger); }
    .toast-warning .toast-icon { color: var(--warning); }
    .toast-info .toast-icon { color: var(--primary); }

    .toast-message {
      flex: 1;
      font-size: 0.875rem;
      color: var(--text);
    }

    .toast-action {
      background: none;
      border: none;
      color: var(--primary);
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
      transition: background 0.2s ease;
    }

    .toast-action:hover {
      background: var(--primary-light);
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      border-radius: var(--radius-sm);
      transition: color 0.2s ease;
    }

    .toast-close:hover {
      color: var(--text);
    }
  `]
})
export class ToastComponent {
    toastService = inject(ToastService);

    dismiss(id: string): void {
        this.toastService.dismiss(id);
    }

    onAction(toast: Toast): void {
        if (toast.action) {
            toast.action.callback();
            this.dismiss(toast.id);
        }
    }
}
