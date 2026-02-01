import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/auth.guard';

export const ADMIN_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('./dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        canActivate: [adminGuard]
    },
    {
        path: 'reports',
        loadComponent: () => import('./reports/admin-reports.component').then(m => m.AdminReportsComponent),
        canActivate: [adminGuard]
    },
    {
        path: 'users',
        loadComponent: () => import('./users/admin-users.component').then(m => m.AdminUsersComponent),
        canActivate: [adminGuard]
    },
    {
        path: 'exports',
        loadComponent: () => import('./exports/admin-exports.component').then(m => m.AdminExportsComponent),
        canActivate: [adminGuard]
    }
];
