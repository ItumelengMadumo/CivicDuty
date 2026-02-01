"""
Report-related Pydantic schemas.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
import uuid

from app.models.report import ReportCategory, ReportStatus


# Base schemas
class LocationBase(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy: Optional[float] = Field(None, ge=0)
    address: Optional[str] = None


class MediaBase(BaseModel):
    media_type: str  # photo, video
    mime_type: str
    file_size: int
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None


# Request schemas
class ReportCreateRequest(BaseModel):
    """Request to create a new report."""
    client_id: Optional[str] = Field(None, max_length=64)  # For offline sync
    category: ReportCategory
    subcategory: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)  # Keep short
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    location_accuracy: Optional[float] = Field(None, ge=0)
    captured_at: datetime
    
    @field_validator('description')
    @classmethod
    def clean_description(cls, v):
        if v:
            # Basic sanitization
            return v.strip()
        return v


class ReportUpdateRequest(BaseModel):
    """Request to update a report (limited fields)."""
    description: Optional[str] = Field(None, max_length=500)
    subcategory: Optional[str] = Field(None, max_length=100)


class ReportFilterRequest(BaseModel):
    """Filters for listing reports."""
    categories: Optional[List[ReportCategory]] = None
    statuses: Optional[List[ReportStatus]] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    
    # Geographic bounds
    north: Optional[float] = Field(None, ge=-90, le=90)
    south: Optional[float] = Field(None, ge=-90, le=90)
    east: Optional[float] = Field(None, ge=-180, le=180)
    west: Optional[float] = Field(None, ge=-180, le=180)
    
    # Pagination
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    
    # Sorting
    sort_by: str = Field("created_at", pattern="^(created_at|total_score|confirmation_count)$")
    sort_order: str = Field("desc", pattern="^(asc|desc)$")


class MediaUploadRequest(BaseModel):
    """Metadata for media upload."""
    report_id: uuid.UUID
    media_type: str = Field(..., pattern="^(photo|video)$")
    mime_type: str
    file_size: int = Field(..., gt=0)
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None  # For videos
    captured_at: Optional[datetime] = None


# Response schemas
class MediaResponse(BaseModel):
    """Media attachment response."""
    id: uuid.UUID
    media_type: str
    mime_type: str
    file_size: int
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None
    storage_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    upload_status: str
    captured_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class StatusEventResponse(BaseModel):
    """Report status change event."""
    id: uuid.UUID
    previous_status: Optional[ReportStatus] = None
    new_status: ReportStatus
    change_source: str
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ReportResponse(BaseModel):
    """Full report response."""
    id: uuid.UUID
    client_id: Optional[str] = None
    category: ReportCategory
    subcategory: Optional[str] = None
    description: Optional[str] = None
    
    # Location
    latitude: float
    longitude: float
    location_accuracy: Optional[float] = None
    address: Optional[str] = None
    
    # Status
    status: ReportStatus
    
    # Scoring
    total_score: float
    confirmation_count: int
    flag_count: int
    is_eligible_for_escalation: bool
    
    # Timestamps
    captured_at: datetime
    submitted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # Related data
    media: List[MediaResponse] = []
    status_history: List[StatusEventResponse] = []
    
    # Reporter info (minimal, no personal data)
    reporter_trust_score: float
    is_own_report: bool = False
    
    class Config:
        from_attributes = True


class ReportListResponse(BaseModel):
    """Paginated list of reports."""
    items: List[ReportResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReportMapResponse(BaseModel):
    """Minimal report data for map display."""
    id: uuid.UUID
    category: ReportCategory
    status: ReportStatus
    latitude: float
    longitude: float
    total_score: float
    confirmation_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class ReportScoreBreakdown(BaseModel):
    """Detailed score breakdown for a report."""
    base_score: float
    evidence_score: float
    community_score: float
    trust_multiplier: float
    total_score: float
    
    # Evidence details
    has_photo: bool
    has_video: bool
    has_gps: bool
    media_count: int
    
    # Community details
    confirmation_count: int
    flag_count: int
    
    # Threshold info
    escalation_threshold: float
    is_eligible_for_escalation: bool


class MediaUploadUrlResponse(BaseModel):
    """Pre-signed URL for media upload."""
    media_id: uuid.UUID
    upload_url: str
    expires_in: int
    max_size: int
