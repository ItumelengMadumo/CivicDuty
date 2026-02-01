import { Component, OnInit, OnDestroy, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import * as L from 'leaflet';

import { ReportService } from '../../core/services/report.service';
import { LocationService } from '../../core/services/location.service';
import { NetworkService } from '../../core/services/network.service';
import { Report, CATEGORY_META, STATUS_META } from '../../core/models';
import { LoadingSpinnerComponent, CategoryBadgeComponent, StatusBadgeComponent } from '../../shared/components';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, CategoryBadgeComponent, StatusBadgeComponent],
    template: `
    <div class="map-container">
      <!-- Map -->
      <div #mapContainer class="map" id="map"></div>

      <!-- Controls -->
      <div class="map-controls">
        <button class="control-btn" (click)="centerOnUser()" [disabled]="!locationService.hasLocation()">
          📍
        </button>
        <button class="control-btn" (click)="toggleFilters()">
          🔍
        </button>
        <button class="control-btn refresh" (click)="refreshReports()" [disabled]="isLoading()">
          🔄
        </button>
      </div>

      <!-- Filters Panel -->
      @if (showFilters()) {
        <div class="filters-panel">
          <h3>Filter Reports</h3>
          <div class="filter-group">
            <label>Categories</label>
            <div class="filter-chips">
              @for (cat of categoryOptions; track cat.value) {
                <button 
                  class="filter-chip"
                  [class.active]="selectedCategories().includes(cat.value)"
                  (click)="toggleCategory(cat.value)"
                >
                  {{ cat.icon }} {{ cat.label }}
                </button>
              }
            </div>
          </div>
          <div class="filter-group">
            <label>Status</label>
            <div class="filter-chips">
              @for (status of statusOptions; track status.value) {
                <button 
                  class="filter-chip"
                  [class.active]="selectedStatuses().includes(status.value)"
                  (click)="toggleStatus(status.value)"
                >
                  {{ status.icon }} {{ status.label }}
                </button>
              }
            </div>
          </div>
          <button class="btn btn-primary btn-block" (click)="applyFilters()">Apply Filters</button>
        </div>
      }

      <!-- Selected Report Panel -->
      @if (selectedReport()) {
        <div class="report-panel">
          <button class="panel-close" (click)="clearSelection()">×</button>
          <div class="report-header">
            <app-category-badge [category]="selectedReport()!.category" />
            <app-status-badge [status]="selectedReport()!.status" />
          </div>
          <h3 class="report-title">{{ selectedReport()!.title }}</h3>
          <p class="report-description">{{ selectedReport()!.description | slice:0:150 }}...</p>
          <div class="report-meta">
            <span>📍 {{ selectedReport()!.address || 'Unknown location' }}</span>
            <span>📅 {{ selectedReport()!.createdAt | date:'shortDate' }}</span>
          </div>
          <div class="report-stats">
            <span class="stat">
              <span class="stat-icon">✓</span>
              {{ selectedReport()!.confirmationCount || 0 }} confirmations
            </span>
            <span class="stat">
              <span class="stat-icon">📷</span>
              {{ selectedReport()!.mediaCount || 0 }} media
            </span>
          </div>
          <a [routerLink]="['/report', selectedReport()!.id]" class="btn btn-primary btn-block">
            View Details
          </a>
        </div>
      }

      <!-- Loading Overlay -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Loading reports..." />
      }

      <!-- FAB for new report -->
      <button class="fab" routerLink="/report/new">
        <span class="fab-icon">+</span>
      </button>
    </div>
  `,
    styles: [`
    .map-container {
      position: relative;
      width: 100%;
      height: calc(100vh - 4rem);
      height: calc(100dvh - 4rem);
    }

    .map {
      width: 100%;
      height: 100%;
      z-index: 1;
    }

    .map-controls {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 1000;
    }

    .control-btn {
      width: 3rem;
      height: 3rem;
      border-radius: var(--radius-md);
      background: var(--surface);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-md);
      font-size: 1.25rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .control-btn:hover:not(:disabled) {
      background: var(--background);
    }

    .control-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .control-btn.refresh:not(:disabled):active {
      animation: spin 0.5s ease;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .filters-panel {
      position: absolute;
      top: 1rem;
      left: 1rem;
      right: 5rem;
      max-width: 400px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 1rem;
      z-index: 1000;
    }

    .filters-panel h3 {
      margin: 0 0 1rem;
      font-size: 1rem;
    }

    .filter-group {
      margin-bottom: 1rem;
    }

    .filter-group label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-chip {
      padding: 0.375rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--background);
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-chip:hover {
      border-color: var(--primary);
    }

    .filter-chip.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .report-panel {
      position: absolute;
      bottom: 5rem;
      left: 1rem;
      right: 1rem;
      max-width: 400px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 1rem;
      z-index: 1000;
    }

    .panel-close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 2rem;
      height: 2rem;
      border: none;
      background: none;
      font-size: 1.5rem;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .report-header {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .report-title {
      margin: 0 0 0.5rem;
      font-size: 1.125rem;
    }

    .report-description {
      margin: 0 0 0.75rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .report-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }

    .report-stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .stat-icon {
      font-size: 1rem;
    }

    .fab {
      position: absolute;
      bottom: 5.5rem;
      right: 1rem;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      border: none;
      box-shadow: var(--shadow-lg);
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 1000;
      transition: transform 0.2s ease;
    }

    .fab:hover {
      transform: scale(1.1);
    }

    .fab-icon {
      display: block;
      line-height: 1;
    }

    @media (min-width: 768px) {
      .map-container {
        height: 100vh;
      }

      .fab {
        bottom: 2rem;
        right: 2rem;
      }

      .report-panel {
        bottom: 2rem;
        left: 2rem;
      }
    }
  `]
})
export class MapComponent implements OnInit, OnDestroy {
    @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

    private router = inject(Router);
    private reportService = inject(ReportService);
    locationService = inject(LocationService);
    private networkService = inject(NetworkService);

    private map!: L.Map;
    private markersLayer!: L.LayerGroup;
    private userMarker?: L.Marker;

    isLoading = signal(false);
    showFilters = signal(false);
    selectedReport = signal<Report | null>(null);
    reports = signal<Report[]>([]);

    selectedCategories = signal<string[]>([]);
    selectedStatuses = signal<string[]>(['pending', 'verified', 'in_progress']);

    categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({
        value,
        label: meta.label,
        icon: meta.icon
    }));

    statusOptions = Object.entries(STATUS_META)
        .filter(([value]) => !['draft', 'archived'].includes(value))
        .map(([value, meta]) => ({
            value,
            label: meta.label,
            icon: meta.icon
        }));

    ngOnInit(): void {
        this.initMap();
        this.loadReports();
        this.initLocation();
    }

    ngOnDestroy(): void {
        this.map?.remove();
        this.locationService.stopWatching();
    }

    private initMap(): void {
        // Initialize map centered on a default location
        this.map = L.map(this.mapContainer.nativeElement, {
            center: [-26.2041, 28.0473], // Johannesburg
            zoom: 13,
            zoomControl: false
        });

        // Add tile layer with offline fallback
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Add zoom control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Initialize markers layer
        this.markersLayer = L.layerGroup().addTo(this.map);

        // Handle map clicks
        this.map.on('click', () => {
            this.selectedReport.set(null);
        });
    }

    private async initLocation(): Promise<void> {
        const permission = await this.locationService.checkPermission();

        if (permission === 'granted') {
            this.locationService.startWatching();
            this.updateUserMarker();
        }
    }

    private updateUserMarker(): void {
        const position = this.locationService.currentPosition();
        if (!position) return;

        const latLng = L.latLng(position.latitude, position.longitude);

        if (this.userMarker) {
            this.userMarker.setLatLng(latLng);
        } else {
            const userIcon = L.divIcon({
                className: 'user-marker',
                html: '<div class="user-marker-dot"></div><div class="user-marker-pulse"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            this.userMarker = L.marker(latLng, { icon: userIcon }).addTo(this.map);
        }
    }

    async loadReports(): Promise<void> {
        this.isLoading.set(true);

        try {
            const bounds = this.map.getBounds();
            const reports = await this.reportService.getMapReports(bounds);
            this.reports.set(reports);
            this.renderMarkers(reports);
        } catch (error) {
            console.error('Failed to load reports:', error);
        } finally {
            this.isLoading.set(false);
        }
    }

    private renderMarkers(reports: Report[]): void {
        this.markersLayer.clearLayers();

        for (const report of reports) {
            // Apply filters
            if (this.selectedCategories().length > 0 && !this.selectedCategories().includes(report.category)) {
                continue;
            }
            if (this.selectedStatuses().length > 0 && !this.selectedStatuses().includes(report.status)) {
                continue;
            }

            const meta = CATEGORY_META[report.category];
            const icon = L.divIcon({
                className: 'report-marker',
                html: `<div class="marker-content" style="background: ${meta?.color || '#6b7280'}">${meta?.icon || '📌'}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([report.latitude, report.longitude], { icon })
                .on('click', () => this.selectReport(report));

            this.markersLayer.addLayer(marker);
        }
    }

    selectReport(report: Report): void {
        this.selectedReport.set(report);
    }

    clearSelection(): void {
        this.selectedReport.set(null);
    }

    centerOnUser(): void {
        const position = this.locationService.currentPosition();
        if (position) {
            this.map.setView([position.latitude, position.longitude], 16);
        }
    }

    toggleFilters(): void {
        this.showFilters.update(v => !v);
    }

    toggleCategory(category: string): void {
        this.selectedCategories.update(cats => {
            if (cats.includes(category)) {
                return cats.filter(c => c !== category);
            }
            return [...cats, category];
        });
    }

    toggleStatus(status: string): void {
        this.selectedStatuses.update(statuses => {
            if (statuses.includes(status)) {
                return statuses.filter(s => s !== status);
            }
            return [...statuses, status];
        });
    }

    applyFilters(): void {
        this.renderMarkers(this.reports());
        this.showFilters.set(false);
    }

    refreshReports(): void {
        this.loadReports();
    }
}
