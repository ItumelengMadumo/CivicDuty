/**
 * Core data models for CivicDuty
 */

// User models
export interface User {
    id: string;
    role: UserRole;
    status: UserStatus;
    trustScore: number;
    reportsSubmitted: number;
    reportsConfirmed: number;
    createdAt: Date;
    isAnonymous: boolean;
    email?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
}

export type UserRole = 'anonymous' | 'user' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

// Auth models
export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    user_id: string;
    is_anonymous: boolean;
}

export interface AuthState {
    isAuthenticated: boolean;
    isAnonymous: boolean;
    userId: string | null;
    token: string | null;
    expiresAt: Date | null;
}

// Report models
export interface Report {
    id: string;
    clientId?: string;
    category: ReportCategory;
    subcategory?: string;
    description?: string;
    latitude: number;
    longitude: number;
    locationAccuracy?: number;
    address?: string;
    status: ReportStatus;
    totalScore: number;
    confirmationCount: number;
    flagCount: number;
    isEligibleForEscalation: boolean;
    capturedAt: Date;
    submittedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    media: ReportMedia[];
    statusHistory: StatusEvent[];
    reporterTrustScore: number;
    isOwnReport: boolean;
}

export type ReportCategory =
    | 'infrastructure'
    | 'environment'
    | 'safety'
    | 'vehicles'
    | 'public_space'
    | 'lighting'
    | 'sanitation'
    | 'water'
    | 'other';

export type ReportStatus =
    | 'draft'
    | 'pending_upload'
    | 'submitted'
    | 'community_confirmed'
    | 'under_review'
    | 'escalated'
    | 'acknowledged'
    | 'in_progress'
    | 'resolved'
    | 'rejected'
    | 'duplicate';

export interface ReportMedia {
    id: string;
    mediaType: 'photo' | 'video';
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    storageUrl?: string;
    thumbnailUrl?: string;
    uploadStatus: string;
    capturedAt?: Date;
}

export interface StatusEvent {
    id: string;
    previousStatus?: ReportStatus;
    newStatus: ReportStatus;
    changeSource: string;
    notes?: string;
    createdAt: Date;
}

export interface ReportMapItem {
    id: string;
    category: ReportCategory;
    status: ReportStatus;
    latitude: number;
    longitude: number;
    totalScore: number;
    confirmationCount: number;
    createdAt: Date;
}

export interface ReportScoreBreakdown {
    baseScore: number;
    evidenceScore: number;
    communityScore: number;
    trustMultiplier: number;
    totalScore: number;
    hasPhoto: boolean;
    hasVideo: boolean;
    hasGps: boolean;
    mediaCount: number;
    confirmationCount: number;
    flagCount: number;
    escalationThreshold: number;
    isEligibleForEscalation: boolean;
}

// Validation models
export type ValidationType = 'confirm' | 'flag_false' | 'flag_malicious' | 'flag_duplicate';

export interface Validation {
    id: string;
    reportId: string;
    validationType: ValidationType;
    weight: number;
    distanceFromReport?: number;
    createdAt: Date;
}

export interface ValidationSummary {
    reportId: string;
    confirmationCount: number;
    flagFalseCount: number;
    flagMaliciousCount: number;
    flagDuplicateCount: number;
    totalConfirmationWeight: number;
    totalFlagWeight: number;
    userValidation?: Validation;
}

// Category models
export interface Category {
    id: string;
    code: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    parentId?: string;
    isActive: boolean;
    sortOrder: number;
}

// Paginated response
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// Local draft for offline support
export interface LocalReport {
    clientId: string;
    category: ReportCategory;
    subcategory?: string;
    description?: string;
    latitude: number;
    longitude: number;
    locationAccuracy?: number;
    capturedAt: Date;
    createdAt: Date;
    status: 'draft' | 'pending_upload' | 'synced';
    media: LocalMedia[];
    syncError?: string;
}

export interface LocalMedia {
    id: string;
    mediaType: 'photo' | 'video';
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    blob?: Blob;
    thumbnailBlob?: Blob;
    uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
    uploadError?: string;
}

// API filter models
export interface ReportFilters {
    categories?: ReportCategory[];
    statuses?: ReportStatus[];
    minScore?: number;
    maxScore?: number;
    dateFrom?: Date;
    dateTo?: Date;
    north?: number;
    south?: number;
    east?: number;
    west?: number;
    page?: number;
    pageSize?: number;
    sortBy?: 'created_at' | 'total_score' | 'confirmation_count';
    sortOrder?: 'asc' | 'desc';
}

// Category metadata for UI
export const CATEGORY_META: Record<ReportCategory, { name: string; icon: string; color: string }> = {
    infrastructure: { name: 'Infrastructure', icon: '🏗️', color: '#6366f1' },
    environment: { name: 'Environment', icon: '🌿', color: '#22c55e' },
    safety: { name: 'Safety', icon: '⚠️', color: '#ef4444' },
    vehicles: { name: 'Vehicles', icon: '🚗', color: '#f59e0b' },
    public_space: { name: 'Public Space', icon: '🏞️', color: '#06b6d4' },
    lighting: { name: 'Lighting', icon: '💡', color: '#fbbf24' },
    sanitation: { name: 'Sanitation', icon: '🗑️', color: '#84cc16' },
    water: { name: 'Water', icon: '💧', color: '#0ea5e9' },
    other: { name: 'Other', icon: '📋', color: '#64748b' }
};

export const STATUS_META: Record<ReportStatus, { name: string; color: string }> = {
    draft: { name: 'Draft', color: '#94a3b8' },
    pending_upload: { name: 'Uploading', color: '#f59e0b' },
    submitted: { name: 'Submitted', color: '#3b82f6' },
    community_confirmed: { name: 'Confirmed', color: '#22c55e' },
    under_review: { name: 'Under Review', color: '#8b5cf6' },
    escalated: { name: 'Escalated', color: '#f59e0b' },
    acknowledged: { name: 'Acknowledged', color: '#06b6d4' },
    in_progress: { name: 'In Progress', color: '#0ea5e9' },
    resolved: { name: 'Resolved', color: '#10b981' },
    rejected: { name: 'Rejected', color: '#ef4444' },
    duplicate: { name: 'Duplicate', color: '#64748b' }
};
