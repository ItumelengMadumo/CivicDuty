import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-loading-spinner',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="spinner-container" [class.fullscreen]="fullscreen" [class.overlay]="overlay">
      <div class="spinner" [class]="'spinner-' + size"></div>
      @if (message) {
        <p class="spinner-message">{{ message }}</p>
      }
    </div>
  `,
    styles: [`
    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }

    .spinner-container.fullscreen {
      position: fixed;
      inset: 0;
      background: var(--background);
      z-index: 9999;
    }

    .spinner-container.overlay {
      position: absolute;
      inset: 0;
      background: rgba(var(--background-rgb), 0.8);
      backdrop-filter: blur(2px);
      z-index: 100;
    }

    .spinner {
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .spinner-sm {
      width: 1.5rem;
      height: 1.5rem;
      border-width: 2px;
    }

    .spinner-md {
      width: 2.5rem;
      height: 2.5rem;
    }

    .spinner-lg {
      width: 3.5rem;
      height: 3.5rem;
      border-width: 4px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .spinner-message {
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-align: center;
    }
  `]
})
export class LoadingSpinnerComponent {
    @Input() size: 'sm' | 'md' | 'lg' = 'md';
    @Input() message?: string;
    @Input() fullscreen = false;
    @Input() overlay = false;
}
