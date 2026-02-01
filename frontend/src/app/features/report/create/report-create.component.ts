import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ReportService } from '../../../core/services/report.service';
import { LocationService, Position } from '../../../core/services/location.service';
import { MediaService, MediaFile } from '../../../core/services/media.service';
import { ToastService } from '../../../core/services/toast.service';
import { StorageService } from '../../../core/services/storage.service';
import { ReportCategory, CATEGORY_META, LocalReport } from '../../../core/models';
import { LoadingSpinnerComponent, CategoryBadgeComponent } from '../../../shared/components';

type CreateStep = 'location' | 'category' | 'details' | 'media' | 'review';

@Component({
    selector: 'app-report-create',
    standalone: true,
    imports: [CommonModule, RouterModule, ReactiveFormsModule, LoadingSpinnerComponent, CategoryBadgeComponent],
    template: `
    <div class="create-container">
      <!-- Header -->
      <header class="create-header">
        <button class="back-btn" (click)="goBack()">←</button>
        <h1>New Report</h1>
        <span class="step-indicator">{{ currentStepIndex() + 1 }} / 5</span>
      </header>

      <!-- Progress -->
      <div class="progress-bar">
        <div class="progress-fill" [style.width.%]="progressPercent()"></div>
      </div>

      <!-- Steps -->
      <div class="step-content">
        <!-- Step 1: Location -->
        @if (currentStep() === 'location') {
          <div class="step location-step">
            <h2>📍 Where is the issue?</h2>
            <p class="step-description">We'll use your current location or you can adjust it on the map.</p>
            
            <div class="location-card">
              @if (position()) {
                <div class="location-info">
                  <span class="location-icon">📍</span>
                  <div class="location-details">
                    <span class="location-coords">{{ locationService.formatPosition(position()!) }}</span>
                    <span class="location-accuracy">
                      Accuracy: {{ locationService.formatAccuracy(position()!.accuracy) }}
                      ({{ position()!.accuracy.toFixed(0) }}m)
                    </span>
                  </div>
                </div>
                <button class="btn btn-outline" (click)="refreshLocation()">
                  🔄 Refresh
                </button>
              } @else {
                <div class="location-loading">
                  <app-loading-spinner size="sm" />
                  <span>Getting your location...</span>
                </div>
              }
            </div>

            @if (locationError()) {
              <div class="error-message">
                {{ locationError() }}
              </div>
            }
          </div>
        }

        <!-- Step 2: Category -->
        @if (currentStep() === 'category') {
          <div class="step category-step">
            <h2>📋 What type of issue?</h2>
            <p class="step-description">Select the category that best describes the problem.</p>

            <div class="category-grid">
              @for (cat of categoryOptions; track cat.value) {
                <button 
                  class="category-card"
                  [class.selected]="selectedCategory() === cat.value"
                  [style.border-color]="selectedCategory() === cat.value ? cat.color : 'var(--border)'"
                  (click)="selectCategory(cat.value)"
                >
                  <span class="category-icon">{{ cat.icon }}</span>
                  <span class="category-label">{{ cat.label }}</span>
                  <span class="category-description">{{ cat.description }}</span>
                </button>
              }
            </div>
          </div>
        }

        <!-- Step 3: Details -->
        @if (currentStep() === 'details') {
          <div class="step details-step">
            <h2>✏️ Describe the issue</h2>
            <p class="step-description">Provide details to help others understand the problem.</p>

            <form [formGroup]="detailsForm">
              <div class="form-group">
                <label for="title">Title *</label>
                <input 
                  type="text" 
                  id="title" 
                  formControlName="title"
                  placeholder="Brief summary of the issue"
                  maxlength="100"
                />
                <span class="char-count">{{ detailsForm.get('title')?.value?.length || 0 }}/100</span>
              </div>

              <div class="form-group">
                <label for="description">Description *</label>
                <textarea 
                  id="description" 
                  formControlName="description"
                  placeholder="Describe the issue in detail. Include any relevant information that could help address it."
                  rows="5"
                  maxlength="2000"
                ></textarea>
                <span class="char-count">{{ detailsForm.get('description')?.value?.length || 0 }}/2000</span>
              </div>

              <div class="form-group">
                <label for="address">Address (optional)</label>
                <input 
                  type="text" 
                  id="address" 
                  formControlName="address"
                  placeholder="Street address or landmark"
                />
              </div>
            </form>
          </div>
        }

        <!-- Step 4: Media -->
        @if (currentStep() === 'media') {
          <div class="step media-step">
            <h2>📷 Add Evidence</h2>
            <p class="step-description">Photos and videos help verify the issue (optional but recommended).</p>

            <div class="media-upload">
              <input 
                #fileInput
                type="file" 
                accept="image/*,video/*" 
                multiple
                (change)="onFilesSelected($event)"
                style="display: none"
              />
              
              <button class="upload-btn" (click)="fileInput.click()">
                <span class="upload-icon">📁</span>
                <span>Select Files</span>
              </button>

              <button class="upload-btn camera" (click)="openCamera()">
                <span class="upload-icon">📸</span>
                <span>Take Photo</span>
              </button>
            </div>

            @if (mediaFiles().length > 0) {
              <div class="media-grid">
                @for (file of mediaFiles(); track file.id) {
                  <div class="media-item">
                    @if (file.type === 'image') {
                      <img [src]="file.thumbnailUrl || file.url" [alt]="file.name" />
                    } @else {
                      <div class="video-placeholder">
                        <span>🎬</span>
                        <span class="video-duration">{{ file.duration }}s</span>
                      </div>
                    }
                    <button class="media-remove" (click)="removeMedia(file.id)">×</button>
                    @if (file.isProcessing) {
                      <div class="media-processing">
                        <app-loading-spinner size="sm" />
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <p class="media-hint">
              Up to 5 files. Images will be compressed to save space.
            </p>
          </div>
        }

        <!-- Step 5: Review -->
        @if (currentStep() === 'review') {
          <div class="step review-step">
            <h2>✅ Review Your Report</h2>
            <p class="step-description">Make sure everything looks correct before submitting.</p>

            <div class="review-card">
              <div class="review-header">
                @if (selectedCategory()) {
                  <app-category-badge [category]="selectedCategory()!" />
                }
              </div>
              
              <h3 class="review-title">{{ detailsForm.get('title')?.value }}</h3>
              <p class="review-description">{{ detailsForm.get('description')?.value }}</p>
              
              <div class="review-location">
                <span class="review-icon">📍</span>
                <span>{{ detailsForm.get('address')?.value || locationService.formatPosition(position()!) }}</span>
              </div>

              @if (mediaFiles().length > 0) {
                <div class="review-media">
                  <span class="review-icon">📷</span>
                  <span>{{ mediaFiles().length }} file(s) attached</span>
                </div>
              }
            </div>

            <div class="submission-options">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="saveAsDraft" />
                <span>Save as draft (submit later)</span>
              </label>
            </div>
          </div>
        }
      </div>

      <!-- Navigation -->
      <div class="step-navigation">
        @if (currentStepIndex() > 0) {
          <button class="btn btn-outline" (click)="prevStep()">
            ← Back
          </button>
        } @else {
          <div></div>
        }

        @if (currentStep() !== 'review') {
          <button 
            class="btn btn-primary" 
            (click)="nextStep()"
            [disabled]="!canProceed()"
          >
            Next →
          </button>
        } @else {
          <button 
            class="btn btn-primary submit-btn" 
            (click)="submit()"
            [disabled]="isSubmitting()"
          >
            @if (isSubmitting()) {
              <app-loading-spinner size="sm" />
            } @else {
              {{ saveAsDraft ? 'Save Draft' : 'Submit Report' }}
            }
          </button>
        }
      </div>
    </div>
  `,
    styles: [`
    .create-container {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--background);
    }

    .create-header {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .back-btn {
      width: 2.5rem;
      height: 2.5rem;
      border: none;
      background: none;
      font-size: 1.25rem;
      cursor: pointer;
      border-radius: var(--radius-md);
    }

    .back-btn:hover {
      background: var(--background);
    }

    .create-header h1 {
      flex: 1;
      margin: 0 1rem;
      font-size: 1.125rem;
    }

    .step-indicator {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .progress-bar {
      height: 4px;
      background: var(--border);
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      transition: width 0.3s ease;
    }

    .step-content {
      flex: 1;
      padding: 1.5rem 1rem;
      overflow-y: auto;
    }

    .step h2 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .step-description {
      margin: 0 0 1.5rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    /* Location Step */
    .location-card {
      background: var(--surface);
      border-radius: var(--radius-lg);
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .location-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .location-icon {
      font-size: 1.5rem;
    }

    .location-details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .location-coords {
      font-family: monospace;
      font-size: 0.875rem;
    }

    .location-accuracy {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .location-loading {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-secondary);
    }

    .error-message {
      margin-top: 1rem;
      padding: 0.75rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: var(--radius-md);
      color: var(--danger);
      font-size: 0.875rem;
    }

    /* Category Step */
    .category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .category-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background: var(--surface);
      border: 2px solid var(--border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
    }

    .category-card:hover {
      border-color: var(--primary);
    }

    .category-card.selected {
      background: var(--primary-light);
    }

    .category-icon {
      font-size: 2rem;
    }

    .category-label {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .category-description {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.3;
    }

    /* Details Step */
    .form-group {
      margin-bottom: 1.25rem;
      position: relative;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 1rem;
      background: var(--surface);
      transition: border-color 0.2s ease;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 120px;
    }

    .char-count {
      position: absolute;
      right: 0.5rem;
      bottom: -1.25rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    /* Media Step */
    .media-upload {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .upload-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      background: var(--surface);
      border: 2px dashed var(--border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .upload-btn:hover {
      border-color: var(--primary);
      background: var(--primary-light);
    }

    .upload-icon {
      font-size: 2rem;
    }

    .media-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .media-item {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--surface);
    }

    .media-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--text);
      color: white;
    }

    .video-placeholder span:first-child {
      font-size: 2rem;
    }

    .video-duration {
      font-size: 0.75rem;
    }

    .media-remove {
      position: absolute;
      top: 0.25rem;
      right: 0.25rem;
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      line-height: 1;
    }

    .media-processing {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
    }

    .media-hint {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-align: center;
    }

    /* Review Step */
    .review-card {
      background: var(--surface);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .review-header {
      margin-bottom: 1rem;
    }

    .review-title {
      margin: 0 0 0.5rem;
      font-size: 1.125rem;
    }

    .review-description {
      margin: 0 0 1rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      line-height: 1.6;
    }

    .review-location,
    .review-media {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }

    .review-icon {
      font-size: 1rem;
    }

    .submission-options {
      margin-bottom: 1rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .checkbox-label input {
      width: 1.25rem;
      height: 1.25rem;
      accent-color: var(--primary);
    }

    /* Navigation */
    .step-navigation {
      display: flex;
      justify-content: space-between;
      padding: 1rem;
      background: var(--surface);
      border-top: 1px solid var(--border);
    }

    .submit-btn {
      min-width: 140px;
    }
  `]
})
export class ReportCreateComponent implements OnInit {
    private router = inject(Router);
    private reportService = inject(ReportService);
    locationService = inject(LocationService);
    private mediaService = inject(MediaService);
    private toastService = inject(ToastService);
    private storageService = inject(StorageService);
    private fb = inject(FormBuilder);

    private steps: CreateStep[] = ['location', 'category', 'details', 'media', 'review'];

    currentStep = signal<CreateStep>('location');
    currentStepIndex = computed(() => this.steps.indexOf(this.currentStep()));
    progressPercent = computed(() => ((this.currentStepIndex() + 1) / this.steps.length) * 100);

    position = signal<Position | null>(null);
    locationError = signal<string | null>(null);
    selectedCategory = signal<ReportCategory | null>(null);
    mediaFiles = signal<MediaFile[]>([]);
    isSubmitting = signal(false);
    saveAsDraft = false;

    detailsForm: FormGroup;

    categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({
        value: value as ReportCategory,
        ...meta
    }));

    constructor() {
        this.detailsForm = this.fb.group({
            title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
            description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
            address: ['']
        });
    }

    async ngOnInit(): Promise<void> {
        await this.getLocation();
    }

    async getLocation(): Promise<void> {
        try {
            const pos = await this.locationService.getCurrentPosition();
            this.position.set(pos);
            this.locationError.set(null);
        } catch (error: any) {
            this.locationError.set(error.message || 'Failed to get location');
        }
    }

    async refreshLocation(): Promise<void> {
        await this.getLocation();
    }

    selectCategory(category: ReportCategory): void {
        this.selectedCategory.set(category);
    }

    async onFilesSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        if (!input.files) return;

        const files = Array.from(input.files);

        for (const file of files) {
            if (this.mediaFiles().length >= 5) {
                this.toastService.warning('Maximum 5 files allowed');
                break;
            }

            try {
                const mediaFile = await this.mediaService.processMedia(file);
                this.mediaFiles.update(files => [...files, mediaFile]);
            } catch (error: any) {
                this.toastService.error(error.message || 'Failed to process file');
            }
        }

        input.value = '';
    }

    openCamera(): void {
        // Create a hidden file input for camera capture
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => this.onFilesSelected(e);
        input.click();
    }

    removeMedia(id: string): void {
        this.mediaFiles.update(files => files.filter(f => f.id !== id));
    }

    canProceed(): boolean {
        switch (this.currentStep()) {
            case 'location':
                return this.position() !== null;
            case 'category':
                return this.selectedCategory() !== null;
            case 'details':
                return this.detailsForm.valid;
            case 'media':
                return true; // Media is optional
            default:
                return true;
        }
    }

    nextStep(): void {
        const currentIndex = this.currentStepIndex();
        if (currentIndex < this.steps.length - 1) {
            this.currentStep.set(this.steps[currentIndex + 1]);
        }
    }

    prevStep(): void {
        const currentIndex = this.currentStepIndex();
        if (currentIndex > 0) {
            this.currentStep.set(this.steps[currentIndex - 1]);
        }
    }

    goBack(): void {
        if (this.currentStepIndex() > 0) {
            this.prevStep();
        } else {
            this.router.navigate(['/']);
        }
    }

    async submit(): Promise<void> {
        if (this.isSubmitting()) return;

        this.isSubmitting.set(true);

        try {
            const pos = this.position()!;
            const formValue = this.detailsForm.value;

            const report: Partial<LocalReport> = {
                clientId: crypto.randomUUID(),
                title: formValue.title,
                description: formValue.description,
                category: this.selectedCategory()!,
                latitude: pos.latitude,
                longitude: pos.longitude,
                address: formValue.address || undefined,
                status: this.saveAsDraft ? 'draft' : 'pending',
                mediaCount: this.mediaFiles().length,
                createdAt: new Date().toISOString()
            };

            // Save to local storage
            const saved = await this.reportService.createReport(report as LocalReport, this.mediaFiles());

            if (!this.saveAsDraft) {
                // Try to submit immediately
                try {
                    await this.reportService.submitReport(saved.clientId);
                    this.toastService.success('Report submitted successfully!');
                } catch {
                    this.toastService.info('Report saved. Will sync when online.');
                }
            } else {
                this.toastService.success('Draft saved!');
            }

            this.router.navigate(['/my-reports']);
        } catch (error: any) {
            this.toastService.error(error.message || 'Failed to save report');
        } finally {
            this.isSubmitting.set(false);
        }
    }
}
