"""
Report and category models.
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Boolean, DateTime, Text, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from app.db.base import Base


class ReportCategory(str, enum.Enum):
    """Categories of civic issues."""
    INFRASTRUCTURE = "infrastructure"  # Roads, bridges, utilities
    ENVIRONMENT = "environment"  # Pollution, illegal dumping
    SAFETY = "safety"  # Unsafe conditions, hazards
    VEHICLES = "vehicles"  # Abandoned, unsafe vehicles
    PUBLIC_SPACE = "public_space"  # Parks, sidewalks, public facilities
    LIGHTING = "lighting"  # Street lights, public lighting
    SANITATION = "sanitation"  # Waste, sewage issues
    WATER = "water"  # Leaks, flooding, water quality
    OTHER = "other"


class ReportStatus(str, enum.Enum):
    """Report lifecycle status."""
    DRAFT = "draft"  # Local draft, not yet submitted
    PENDING_UPLOAD = "pending_upload"  # Queued for sync
    SUBMITTED = "submitted"  # Received by server
    COMMUNITY_CONFIRMED = "community_confirmed"  # Multiple confirmations
    UNDER_REVIEW = "under_review"  # Being reviewed by moderators
    ESCALATED = "escalated"  # Sent to authorities
    ACKNOWLEDGED = "acknowledged"  # Authority acknowledged
    IN_PROGRESS = "in_progress"  # Being addressed
    RESOLVED = "resolved"  # Issue resolved
    REJECTED = "rejected"  # Rejected as invalid
    DUPLICATE = "duplicate"  # Merged with another report


class Report(Base):
    """
    Core report model for civic issues.
    Designed for offline-first creation with GPS and media evidence.
    """
    __tablename__ = "reports"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Client-generated ID for offline sync
    client_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True, index=True)
    
    # Reporter
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        index=True
    )
    reporter: Mapped["User"] = relationship("User", back_populates="reports")
    
    # Category and description
    category: Mapped[ReportCategory] = mapped_column(
        SQLEnum(ReportCategory),
        index=True
    )
    subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Optional, short
    
    # Location
    latitude: Mapped[float] = mapped_column(Float, index=True)
    longitude: Mapped[float] = mapped_column(Float, index=True)
    location_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # meters
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Status and lifecycle
    status: Mapped[ReportStatus] = mapped_column(
        SQLEnum(ReportStatus),
        default=ReportStatus.SUBMITTED,
        index=True
    )
    
    # Scoring
    base_score: Mapped[float] = mapped_column(Float, default=10.0)
    evidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    community_score: Mapped[float] = mapped_column(Float, default=0.0)
    trust_multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    total_score: Mapped[float] = mapped_column(Float, default=10.0, index=True)
    
    # Validation counts
    confirmation_count: Mapped[int] = mapped_column(Integer, default=0)
    flag_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Timestamps
    captured_at: Mapped[datetime] = mapped_column(DateTime)  # When evidence was captured
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Moderation
    moderated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    moderator_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Duplicate tracking
    duplicate_of_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id"),
        nullable=True
    )
    
    # Relationships
    media: Mapped[List["ReportMedia"]] = relationship("ReportMedia", back_populates="report", cascade="all, delete-orphan")
    validations: Mapped[List["Validation"]] = relationship("Validation", back_populates="report", cascade="all, delete-orphan")
    status_history: Mapped[List["ReportStatusEvent"]] = relationship("ReportStatusEvent", back_populates="report", cascade="all, delete-orphan")
    
    @property
    def is_eligible_for_escalation(self) -> bool:
        """Check if report meets escalation threshold."""
        from app.core.config import settings
        return self.total_score >= settings.SCORE_ESCALATION_THRESHOLD


class ReportMedia(Base):
    """
    Media attachments for reports.
    Supports photos and videos with metadata.
    """
    __tablename__ = "report_media"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id"),
        index=True
    )
    report: Mapped["Report"] = relationship("Report", back_populates="media")
    
    # Storage
    storage_key: Mapped[str] = mapped_column(String(500))  # S3 key
    storage_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    thumbnail_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Media info
    media_type: Mapped[str] = mapped_column(String(20))  # photo, video
    mime_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer)  # bytes
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # seconds for video
    
    # EXIF/Metadata
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    device_make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Upload tracking
    upload_status: Mapped[str] = mapped_column(String(20), default="pending")
    uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ReportStatusEvent(Base):
    """
    Immutable audit trail of report status changes.
    """
    __tablename__ = "report_status_events"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id"),
        index=True
    )
    report: Mapped["Report"] = relationship("Report", back_populates="status_history")
    
    previous_status: Mapped[Optional[ReportStatus]] = mapped_column(SQLEnum(ReportStatus), nullable=True)
    new_status: Mapped[ReportStatus] = mapped_column(SQLEnum(ReportStatus))
    
    # Who made the change
    changed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    change_source: Mapped[str] = mapped_column(String(50))  # user, system, moderator, authority
    
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Category(Base):
    """
    Configurable categories managed by admins.
    """
    __tablename__ = "categories"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # Hex color
    
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id"),
        nullable=True
    )
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Import to avoid circular imports
from app.models.user import User
from app.models.validation import Validation
