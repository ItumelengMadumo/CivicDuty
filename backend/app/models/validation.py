"""
Validation models for community confirmation and flagging.
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.db.base import Base


class ValidationType(str, enum.Enum):
    """Types of validation actions."""
    CONFIRM = "confirm"  # User confirms they observed the same issue
    FLAG_FALSE = "flag_false"  # Report appears to be false
    FLAG_MALICIOUS = "flag_malicious"  # Report is intentionally misleading
    FLAG_DUPLICATE = "flag_duplicate"  # Report is a duplicate


class Validation(Base):
    """
    Community validation of reports.
    Limited to structured actions - no comments or debates.
    """
    __tablename__ = "validations"
    
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
    report: Mapped["Report"] = relationship("Report", back_populates="validations")
    
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        index=True
    )
    user: Mapped["User"] = relationship("User", back_populates="validations")
    
    validation_type: Mapped[ValidationType] = mapped_column(
        SQLEnum(ValidationType),
        index=True
    )
    
    # Location verification - user must be nearby to validate
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_from_report: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # meters
    
    # Weight based on user trust and proximity
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    
    # For duplicate flags
    duplicate_report_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True
    )
    
    # Moderation
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    moderated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        # Each user can only validate a report once per type
        UniqueConstraint('report_id', 'user_id', 'validation_type', name='uq_validation_user_type'),
    )


class ModerationAction(Base):
    """
    Record of moderation actions taken on reports or users.
    """
    __tablename__ = "moderation_actions"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    moderator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        index=True
    )
    
    # Target of action
    target_type: Mapped[str] = mapped_column(String(20))  # report, user, validation
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    
    action: Mapped[str] = mapped_column(String(50))  # approve, reject, ban, merge, etc.
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Before/after state
    previous_state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# Import to avoid circular imports
from app.models.report import Report
from app.models.user import User
