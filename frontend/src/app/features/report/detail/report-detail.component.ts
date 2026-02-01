import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as L from 'leaflet';

import { ReportService } from '../../../core/services/report.service';
import { ValidationService } from '../../../core/services/validation.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Report, Validation, CATEGORY_META, ValidationType } from '../../../core/models';
import {
    LoadingSpinnerComponent,
    CategoryBadgeComponent,
    StatusBadgeComponent
} from '../../../shared/components';

@Component({
    selector: 'app-report-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, CategoryBadgeComponent, StatusBadgeComponent],
    template: `
    <div class="detail-container">
      @if (isLoading()) {
        <app-loading-spinner [fullscreen]="true" message="Loading report..." />
      } @else if (report()) {
        <!-- Header -->
        <header class="detail-header">
          <button class="back-btn" (click)="goBack()">←</button>
          <h1>Report Details</h1>
          @if (isOwner()) {
            <button class="menu-btn" (click)="toggleMenu()">⋮</button>
          }
        </header>

        @if (showMenu()) {
          <div class="menu-overlay" (click)="toggleMenu()"></div>
          <div class="menu-dropdown">
            <button (click)="editReport()">✏️ Edit</button>
            <button class="danger" (click)="deleteReport()">🗑️ Delete</button>
          </div>
        }

        <!-- Hero Image -->
        @if (report()!.media && report()!.media!.length > 0) {
          <div class="media-carousel">
            <div class="carousel-track" [style.transform]="'translateX(-' + currentMediaIndex() * 100 + '%)'">
              @for (media of report()!.media; track media.id) {
                <div class="carousel-slide">
                  @if (media.mediaType === 'image') {
                    <img [src]="media.url" [alt]="report()!.title" />
                  } @else {
                    <video [src]="media.url" controls></video>
                  }
                </div>
              }
            </div>
            @if (report()!.media!.length > 1) {
              <div class="carousel-dots">
                @for (media of report()!.media; track media.id; let i = $index) {
                  <button 
                    class="dot"
                    [class.active]="i === currentMediaIndex()"
                    (click)="goToMedia(i)"
                  ></button>
                }
              </div>
            }
          </div>
        }

        <!-- Content -->
        <div class="detail-content">
          <div class="badges">
            <app-category-badge [category]="report()!.category" />
            <app-status-badge [status]="report()!.status" />
          </div>

          <h2 class="report-title">{{ report()!.title }}</h2>
          
          <div class="meta">
            <span>📍 {{ report()!.address || 'Location on map' }}</span>
            <span>📅 {{ report()!.createdAt | date:'mediumDate' }}</span>
          </div>

          <p class="description">{{ report()!.description }}</p>

          <!-- Stats -->
          <div class="stats-card">
            <div class="stat">
              <span class="stat-value">{{ report()!.confirmationCount || 0 }}</span>
              <span class="stat-label">Confirmations</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ report()!.flagCount || 0 }}</span>
              <span class="stat-label">Flags</span>
            </div>
            <div class="stat">
              <span class="stat-value" [style.color]="getScoreColor()">
                {{ (report()!.verificationScore || 0).toFixed(1) }}
              </span>
              <span class="stat-label">Score</span>
            </div>
          </div>

          <!-- Mini Map -->
          <div class="map-card">
            <div id="detail-map" class="mini-map"></div>
          </div>

          <!-- Validation Section -->
          @if (canValidate()) {
            <div class="validation-section">
              <h3>Validate This Report</h3>
              <p class="validation-hint">Help verify this issue by confirming or flagging it.</p>
              
              <div class="validation-buttons">
                @for (type of validationTypes; track type.value) {
                  <button 
                    class="validation-btn"
                    [class]="'validation-' + type.value"
                    (click)="submitValidation(type.value)"
                    [disabled]="isValidating()"
                  >
                    {{ type.label }}
                  </button>
                }
              </div>
            </div>
          }

          <!-- Validations List -->
          @if (validations().length > 0) {
            <div class="validations-list">
              <h3>Community Validations ({{ validations().length }})</h3>
              @for (v of validations().slice(0, showAllValidations() ? undefined : 5); track v.id) {
                <div class="validation-item" [class]="'type-' + v.type">
                  <span class="validation-icon">
                    {{ v.type === 'confirmation' ? '✓' : v.type === 'flag' ? '⚠' : '🚫' }}
                  </span>
                  <div class="validation-content">
                    @if (v.comment) {
                      <p class="validation-comment">{{ v.comment }}</p>
                    }
                    <span class="validation-meta">
                      {{ v.createdAt | date:'shortDate' }}
                      @if (v.proximityMeters) {
                        · {{ v.proximityMeters < 100 ? 'Nearby' : v.proximityMeters + 'm away' }}
                      }
                    </span>
                  </div>
                </div>
              }
              @if (validations().length > 5 && !showAllValidations()) {
                <button class="show-more" (click)="showAllValidations.set(true)">
                  Show all {{ validations().length }} validations
                </button>
              }
            </div>
          }
        </div>
      } @else {
        <div class="not-found">
          <span class="not-found-icon">🔍</span>
          <h2>Report Not Found</h2>
          <p>This report may have been removed or doesn't exist.</p>
          <a routerLink="/" class="btn btn-primary">Back to Map</a>
        </div>
      }
    </div>
  `,
    styles: [`
    .detail-container {
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--background);
    }

    .detail-header {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .back-btn,
    .menu-btn {
      width: 2.5rem;
      height: 2.5rem;
      border: none;
      background: none;
      font-size: 1.25rem;
      cursor: pointer;
      border-radius: var(--radius-md);
    }

    .back-btn:hover,
    .menu-btn:hover {
      background: var(--background);
    }

    .detail-header h1 {
      flex: 1;
      margin: 0 1rem;
      font-size: 1.125rem;
    }

    .menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 200;
    }

    .menu-dropdown {
      position: absolute;
      top: 3.5rem;
      right: 1rem;
      background: var(--surface);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      z-index: 201;
    }

    .menu-dropdown button {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .menu-dropdown button:hover {
      background: var(--background);
    }

    .menu-dropdown button.danger {
      color: var(--danger);
    }

    .media-carousel {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      overflow: hidden;
      background: var(--text);
    }

    .carousel-track {
      display: flex;
      height: 100%;
      transition: transform 0.3s ease;
    }

    .carousel-slide {
      flex: 0 0 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .carousel-slide img,
    .carousel-slide video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .carousel-dots {
      position: absolute;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 0.5rem;
    }

    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.5);
      cursor: pointer;
    }

    .dot.active {
      background: white;
      width: 1.5rem;
      border-radius: 999px;
    }

    .detail-content {
      padding: 1.25rem 1rem 6rem;
    }

    .badges {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .report-title {
      margin: 0 0 0.75rem;
      font-size: 1.5rem;
      line-height: 1.3;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }

    .description {
      margin: 0 0 1.5rem;
      line-height: 1.7;
      color: var(--text);
    }

    .stats-card {
      display: flex;
      justify-content: space-around;
      padding: 1rem;
      background: var(--surface);
      border-radius: var(--radius-lg);
      margin-bottom: 1.5rem;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .map-card {
      margin-bottom: 1.5rem;
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .mini-map {
      height: 200px;
      width: 100%;
    }

    .validation-section {
      background: var(--surface);
      padding: 1.25rem;
      border-radius: var(--radius-lg);
      margin-bottom: 1.5rem;
    }

    .validation-section h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .validation-hint {
      margin: 0 0 1rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .validation-buttons {
      display: flex;
      gap: 0.75rem;
    }

    .validation-btn {
      flex: 1;
      padding: 0.75rem;
      border-radius: var(--radius-md);
      border: 2px solid;
      background: transparent;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .validation-confirmation {
      border-color: var(--success);
      color: var(--success);
    }

    .validation-confirmation:hover {
      background: var(--success);
      color: white;
    }

    .validation-flag {
      border-color: var(--warning);
      color: var(--warning);
    }

    .validation-flag:hover {
      background: var(--warning);
      color: white;
    }

    .validation-spam {
      border-color: var(--danger);
      color: var(--danger);
    }

    .validation-spam:hover {
      background: var(--danger);
      color: white;
    }

    .validations-list {
      background: var(--surface);
      padding: 1.25rem;
      border-radius: var(--radius-lg);
    }

    .validations-list h3 {
      margin: 0 0 1rem;
      font-size: 1rem;
    }

    .validation-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }

    .validation-item:last-child {
      border-bottom: none;
    }

    .validation-icon {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
    }

    .type-confirmation .validation-icon {
      background: rgba(34, 197, 94, 0.1);
      color: var(--success);
    }

    .type-flag .validation-icon {
      background: rgba(234, 179, 8, 0.1);
      color: var(--warning);
    }

    .type-spam .validation-icon {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
    }

    .validation-content {
      flex: 1;
    }

    .validation-comment {
      margin: 0 0 0.25rem;
      font-size: 0.875rem;
    }

    .validation-meta {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .show-more {
      display: block;
      width: 100%;
      padding: 0.75rem;
      margin-top: 0.5rem;
      background: none;
      border: none;
      color: var(--primary);
      font-weight: 500;
      cursor: pointer;
    }

    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem;
      text-align: center;
    }

    .not-found-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    .not-found h2 {
      margin: 0 0 0.5rem;
    }

    .not-found p {
      color: var(--text-secondary);
      margin: 0 0 1.5rem;
    }
  `]
})
export class ReportDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private reportService = inject(ReportService);
    private validationService = inject(ValidationService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);

    report = signal<Report | null>(null);
    validations = signal<Validation[]>([]);
    isLoading = signal(true);
    isValidating = signal(false);
    showMenu = signal(false);
    showAllValidations = signal(false);
    currentMediaIndex = signal(0);

    private map?: L.Map;

    validationTypes = this.validationService.getValidationTypes();

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.loadReport(id);
        }
    }

    async loadReport(id: string): Promise<void> {
        this.isLoading.set(true);

        try {
            const report = await this.reportService.getReport(id);
            this.report.set(report);

            if (report) {
                this.loadValidations(id);
                setTimeout(() => this.initMap(), 100);
            }
        } catch (error) {
            console.error('Failed to load report:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    async loadValidations(reportId: string): Promise<void> {
        try {
            const validations = await this.validationService.getReportValidations(reportId).toPromise();
            this.validations.set(validations || []);
        } catch (error) {
            console.error('Failed to load validations:', error);
        }
    }

    private initMap(): void {
        const report = this.report();
        if (!report) return;

        this.map = L.map('detail-map', {
            center: [report.latitude, report.longitude],
            zoom: 15,
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
        }).addTo(this.map);

        const meta = CATEGORY_META[report.category];
        const icon = L.divIcon({
            className: 'report-marker',
            html: `<div class="marker-content" style="background: ${meta?.color || '#6b7280'}">${meta?.icon || '📌'}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        L.marker([report.latitude, report.longitude], { icon }).addTo(this.map);
    }

    isOwner(): boolean {
        const user = this.authService.user();
        const report = this.report();
        return user !== null && report !== null && user.id === report.reporterId;
    }

    canValidate(): boolean {
        const user = this.authService.user();
        const report = this.report();
        if (!user || !report) return false;
        return user.id !== report.reporterId;
    }

    async submitValidation(type: ValidationType): Promise<void> {
        const report = this.report();
        if (!report || this.isValidating()) return;

        this.isValidating.set(true);

        try {
            await this.validationService.createValidation({
                reportId: report.id,
                type
            });

            this.toastService.success('Validation submitted!');
            this.loadReport(report.id);
        } catch (error: any) {
            this.toastService.error(error.message || 'Failed to submit validation');
        } finally {
            this.isValidating.set(false);
        }
    }

    getScoreColor(): string {
        const score = this.report()?.verificationScore || 0;
        if (score >= 3) return 'var(--success)';
        if (score >= 1) return 'var(--warning)';
        return 'var(--danger)';
    }

    goToMedia(index: number): void {
        this.currentMediaIndex.set(index);
    }

    toggleMenu(): void {
        this.showMenu.update(v => !v);
    }

    editReport(): void {
        const report = this.report();
        if (report) {
            this.router.navigate(['/report', report.id, 'edit']);
        }
    }

    async deleteReport(): Promise<void> {
        const report = this.report();
        if (!report) return;

        if (confirm('Are you sure you want to delete this report?')) {
            try {
                await this.reportService.deleteReport(report.id);
                this.toastService.success('Report deleted');
                this.router.navigate(['/my-reports']);
            } catch (error) {
                this.toastService.error('Failed to delete report');
            }
        }
    }

    goBack(): void {
        history.back();
    }
}
