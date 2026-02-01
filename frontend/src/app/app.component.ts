import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { AuthService } from './core/services/auth.service';
import { SyncService } from './core/services/sync.service';
import { NetworkService } from './core/services/network.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        CommonModule,
        RouterOutlet,
        BottomNavComponent,
        ToastComponent,
        OfflineBannerComponent
    ],
    template: `
    <app-offline-banner />
    <router-outlet />
    <app-bottom-nav />
    <app-toast />
  `,
    styles: [`
    :host {
      display: block;
      min-height: 100vh;
      min-height: 100dvh;
    }
  `]
})
export class AppComponent implements OnInit {
    private authService = inject(AuthService);
    private syncService = inject(SyncService);
    private networkService = inject(NetworkService);

    ngOnInit(): void {
        // Initialize auth (anonymous or restore session)
        this.authService.initializeAuth();

        // Start sync service
        this.syncService.initialize();

        // Monitor network status
        this.networkService.initialize();
    }
}
