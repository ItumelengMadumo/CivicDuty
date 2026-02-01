import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'map',
        pathMatch: 'full'
    },
    {
        path: 'map',
        loadComponent: () => import('./features/map/map.component').then(m => m.MapComponent),
        canActivate: [authGuard]
    },
    {
        path: 'report',
        children: [
            {
                path: 'new',
                loadComponent: () => import('./features/report/create/report-create.component').then(m => m.ReportCreateComponent),
                canActivate: [authGuard]
            },
            {
                path: ':id',
                loadComponent: () => import('./features/report/detail/report-detail.component').then(m => m.ReportDetailComponent),
                canActivate: [authGuard]
            }
        ]
    },
    {
        path: 'my-reports',
        loadComponent: () => import('./features/my-reports/my-reports.component').then(m => m.MyReportsComponent),
        canActivate: [authGuard]
    },
    {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
        canActivate: [authGuard]
    },
    {
        path: 'auth',
        children: [
            {
                path: 'login',
                loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
            },
            {
                path: 'register',
                loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
            }
        ]
    },
    {
        path: 'admin',
        loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
        canActivate: [authGuard],
        data: { roles: ['moderator', 'admin'] }
    },
    {
        path: '**',
        redirectTo: 'map'
    }
];
