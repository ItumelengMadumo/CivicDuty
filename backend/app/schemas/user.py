"""
User-related Pydantic schemas.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
import uuid

from app.models.user import UserRole, UserStatus


# Base schemas
class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


# Request schemas
class AnonymousAuthRequest(BaseModel):
    """Request for anonymous device-bound authentication."""
    device_fingerprint: str = Field(..., min_length=32, max_length=256)
    platform: Optional[str] = None
    app_version: Optional[str] = None


class UserRegisterRequest(BaseModel):
    """Request to register an identified account."""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str = Field(..., min_length=8, max_length=128)
    device_fingerprint: Optional[str] = None  # Link anonymous history


class UserLoginRequest(BaseModel):
    """Request to login with credentials."""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str


class VerifyCodeRequest(BaseModel):
    """Request to verify email/phone."""
    code: str = Field(..., min_length=6, max_length=6)


class PasswordResetRequest(BaseModel):
    """Request password reset."""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    """Request to change password."""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


# Response schemas
class TokenResponse(BaseModel):
    """Authentication token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    is_anonymous: bool


class UserResponse(BaseModel):
    """Public user information."""
    id: uuid.UUID
    role: UserRole
    status: UserStatus
    trust_score: float
    reports_submitted: int
    reports_confirmed: int
    created_at: datetime
    is_anonymous: bool
    
    # Only for identified users
    email_verified: Optional[bool] = None
    phone_verified: Optional[bool] = None
    
    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    """User's own profile with more details."""
    id: uuid.UUID
    email: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole
    status: UserStatus
    trust_score: float
    reports_submitted: int
    reports_confirmed: int
    reports_flagged: int
    validations_given: int
    created_at: datetime
    last_active: Optional[datetime] = None
    email_verified: bool
    phone_verified: bool
    
    class Config:
        from_attributes = True


class TrustScoreResponse(BaseModel):
    """User trust score breakdown."""
    total_score: float
    base_score: float
    reports_bonus: float
    confirmations_bonus: float
    flags_penalty: float
    rank_percentile: Optional[float] = None
