"""
User and identity models.
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Boolean, DateTime, Text, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.db.base import Base


class UserRole(str, enum.Enum):
    """User roles for access control."""
    ANONYMOUS = "anonymous"
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class UserStatus(str, enum.Enum):
    """User account status."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"


class User(Base):
    """
    User model supporting both anonymous and identified users.
    Anonymous users are identified by device fingerprint hash.
    Identified users have email/phone and can persist trust across devices.
    """
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # Identity - either device hash (anonymous) or email/phone (identified)
    device_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Verification
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    verification_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Role and status
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole),
        default=UserRole.ANONYMOUS
    )
    status: Mapped[UserStatus] = mapped_column(
        SQLEnum(UserStatus),
        default=UserStatus.ACTIVE
    )
    
    # Trust score - evolves slowly based on report outcomes
    trust_score: Mapped[float] = mapped_column(Float, default=50.0)
    reports_submitted: Mapped[int] = mapped_column(default=0)
    reports_confirmed: Mapped[int] = mapped_column(default=0)
    reports_flagged: Mapped[int] = mapped_column(default=0)
    validations_given: Mapped[int] = mapped_column(default=0)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_active: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    reports: Mapped[List["Report"]] = relationship("Report", back_populates="reporter")
    validations: Mapped[List["Validation"]] = relationship("Validation", back_populates="user")
    
    @property
    def is_anonymous(self) -> bool:
        return self.role == UserRole.ANONYMOUS
    
    @property
    def is_identified(self) -> bool:
        return self.email is not None or self.phone is not None
    
    @property
    def is_moderator(self) -> bool:
        return self.role in [UserRole.MODERATOR, UserRole.ADMIN]
    
    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


class DeviceSession(Base):
    """
    Tracks device sessions for both anonymous and identified users.
    Allows linking anonymous activity to accounts on registration.
    """
    __tablename__ = "device_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True
    )
    device_hash: Mapped[str] = mapped_column(String(64), index=True)
    
    # Device info (non-identifying)
    platform: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    # Session tracking
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# Import here to avoid circular imports
from app.models.report import Report
from app.models.validation import Validation
