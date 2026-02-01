"""
Export models for authority data packages.
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
import enum

from app.db.base import Base


class ExportFormat(str, enum.Enum):
    """Supported export formats."""
    PDF = "pdf"
    CSV = "csv"
    JSON = "json"


class ExportStatus(str, enum.Enum):
    """Export generation status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Export(Base):
    """
    Authority export packages containing verified reports.
    """
    __tablename__ = "exports"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Who created the export
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        index=True
    )
    
    # Export configuration
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    format: Mapped[ExportFormat] = mapped_column(SQLEnum(ExportFormat))
    
    # Filters used
    categories: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    date_from: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    date_to: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    min_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    statuses: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    
    # Geographic bounds
    bounds: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {north, south, east, west}
    
    # Results
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    report_ids: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    
    # Storage
    file_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Status tracking
    status: Mapped[ExportStatus] = mapped_column(
        SQLEnum(ExportStatus),
        default=ExportStatus.PENDING
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
