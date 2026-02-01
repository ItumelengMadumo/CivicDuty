import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/components';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, RouterModule, ReactiveFormsModule, LoadingSpinnerComponent],
    template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1>🏛️ CivicDuty</h1>
          <p>Create an account to unlock all features.</p>
        </div>

        @if (message()) {
          <div class="info-banner">
            {{ message() }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="displayName">Display Name</label>
            <input 
              type="text" 
              id="displayName" 
              formControlName="displayName"
              placeholder="Your name"
              autocomplete="name"
            />
            @if (form.get('displayName')?.touched && form.get('displayName')?.errors) {
              <span class="error">Name must be at least 2 characters</span>
            }
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              formControlName="email"
              placeholder="your@email.com"
              autocomplete="email"
            />
            @if (form.get('email')?.touched && form.get('email')?.errors) {
              <span class="error">Please enter a valid email</span>
            }
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              formControlName="password"
              placeholder="••••••••"
              autocomplete="new-password"
            />
            @if (form.get('password')?.touched && form.get('password')?.errors) {
              <span class="error">Password must be at least 8 characters</span>
            }
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input 
              type="password" 
              id="confirmPassword" 
              formControlName="confirmPassword"
              placeholder="••••••••"
              autocomplete="new-password"
            />
            @if (form.get('confirmPassword')?.touched && passwordMismatch()) {
              <span class="error">Passwords don't match</span>
            }
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" formControlName="acceptTerms" />
              <span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span>
            </label>
          </div>

          <button 
            type="submit" 
            class="btn btn-primary btn-block"
            [disabled]="isLoading() || form.invalid || passwordMismatch()"
          >
            @if (isLoading()) {
              <app-loading-spinner size="sm" />
            } @else {
              Create Account
            }
          </button>
        </form>

        <div class="auth-divider">
          <span>or</span>
        </div>

        <button class="btn btn-outline btn-block" (click)="continueAsGuest()">
          Continue as Guest
        </button>

        <p class="auth-footer">
          Already have an account? <a routerLink="/auth/login">Sign in</a>
        </p>
      </div>
    </div>
  `,
    styles: [`
    .auth-container {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: linear-gradient(135deg, var(--primary-light) 0%, var(--background) 100%);
    }

    .auth-card {
      width: 100%;
      max-width: 400px;
      background: var(--surface);
      border-radius: var(--radius-xl);
      padding: 2rem;
      box-shadow: var(--shadow-lg);
    }

    .auth-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .auth-header h1 {
      margin: 0 0 0.5rem;
      font-size: 1.75rem;
    }

    .auth-header p {
      margin: 0;
      color: var(--text-secondary);
    }

    .info-banner {
      background: var(--primary-light);
      border: 1px solid var(--primary);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      text-align: center;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .form-group input[type="text"],
    .form-group input[type="email"],
    .form-group input[type="password"] {
      width: 100%;
      padding: 0.875rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 1rem;
      background: var(--background);
      transition: border-color 0.2s ease;
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .error {
      display: block;
      margin-top: 0.375rem;
      font-size: 0.75rem;
      color: var(--danger);
    }

    .checkbox-group {
      margin-top: 1rem;
    }

    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .checkbox-label input {
      margin-top: 0.125rem;
      width: 1rem;
      height: 1rem;
      accent-color: var(--primary);
    }

    .checkbox-label a {
      color: var(--primary);
      text-decoration: none;
    }

    .btn-block {
      width: 100%;
      padding: 0.875rem;
      font-size: 1rem;
      margin-top: 1.5rem;
    }

    .auth-divider {
      display: flex;
      align-items: center;
      margin: 1.5rem 0;
      color: var(--text-secondary);
    }

    .auth-divider::before,
    .auth-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .auth-divider span {
      padding: 0 1rem;
      font-size: 0.875rem;
    }

    .auth-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .auth-footer a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
    }
  `]
})
export class RegisterComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    isLoading = signal(false);
    message = signal<string | null>(null);

    form: FormGroup = this.fb.group({
        displayName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
        acceptTerms: [false, Validators.requiredTrue]
    });

    constructor() {
        // Check for message in query params
        const msg = this.route.snapshot.queryParams['message'];
        if (msg) {
            this.message.set(msg);
        }
    }

    passwordMismatch(): boolean {
        const password = this.form.get('password')?.value;
        const confirm = this.form.get('confirmPassword')?.value;
        return password && confirm && password !== confirm;
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid || this.passwordMismatch() || this.isLoading()) return;

        this.isLoading.set(true);

        try {
            const { email, password, displayName } = this.form.value;
            await this.authService.register(email, password, displayName);

            const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
            this.router.navigateByUrl(returnUrl);

            this.toastService.success('Account created! Welcome to CivicDuty.');
        } catch (error: any) {
            this.toastService.error(error.message || 'Registration failed');
        } finally {
            this.isLoading.set(false);
        }
    }

    async continueAsGuest(): Promise<void> {
        this.isLoading.set(true);

        try {
            await this.authService.authenticateAnonymous();
            this.router.navigate(['/']);
        } catch (error: any) {
            this.toastService.error('Failed to continue as guest');
        } finally {
            this.isLoading.set(false);
        }
    }
}
