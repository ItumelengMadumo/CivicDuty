"""
Export-related Pydantic schemas.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from app.models.export import ExportFormat, ExportStatus
from app.models.report import ReportCategory, ReportStatus


# Request schemas
class ExportCreateRequest(BaseModel):
    """Request to create a new export."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    format: ExportFormat = ExportFormat.PDF
    
    # Filters
    categories: Optional[List[ReportCategory]] = None
    statuses: Optional[List[ReportStatus]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_score: Optional[float] = None
    
    # Geographic bounds
    north: Optional[float] = Field(None, ge=-90, le=90)
    south: Optional[float] = Field(None, ge=-90, le=90)
    east: Optional[float] = Field(None, ge=-180, le=180)
    west: Optional[float] = Field(None, ge=-180, le=180)


# Response schemas
class ExportResponse(BaseModel):
    """Export response."""
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    format: ExportFormat
    status: ExportStatus
    report_count: int
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ExportListResponse(BaseModel):
    """Paginated list of exports."""
    items: List[ExportResponse]
    total: int
    page: int
    page_size: int
