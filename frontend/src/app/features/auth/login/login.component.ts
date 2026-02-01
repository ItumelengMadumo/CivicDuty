import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/components';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, RouterModule, ReactiveFormsModule, LoadingSpinnerComponent],
    template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1>🏛️ CivicDuty</h1>
          <p>Welcome back! Sign in to continue.</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
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
              autocomplete="current-password"
            />
            @if (form.get('password')?.touched && form.get('password')?.errors) {
              <span class="error">Password is required</span>
            }
          </div>

          <button 
            type="submit" 
            class="btn btn-primary btn-block"
            [disabled]="isLoading() || form.invalid"
          >
            @if (isLoading()) {
              <app-loading-spinner size="sm" />
            } @else {
              Sign In
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
          Don't have an account? <a routerLink="/auth/register">Sign up</a>
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
      margin-bottom: 2rem;
    }

    .auth-header h1 {
      margin: 0 0 0.5rem;
      font-size: 1.75rem;
    }

    .auth-header p {
      margin: 0;
      color: var(--text-secondary);
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .form-group input {
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

    .btn-block {
      width: 100%;
      padding: 0.875rem;
      font-size: 1rem;
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
export class LoginComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    isLoading = signal(false);

    form: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', Validators.required]
    });

    async onSubmit(): Promise<void> {
        if (this.form.invalid || this.isLoading()) return;

        this.isLoading.set(true);

        try {
            await this.authService.login(this.form.value.email, this.form.value.password);

            const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
            this.router.navigateByUrl(returnUrl);

            this.toastService.success('Welcome back!');
        } catch (error: any) {
            this.toastService.error(error.message || 'Login failed');
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
