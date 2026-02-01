"""
Validation-related Pydantic schemas.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid

from app.models.validation import ValidationType


# Request schemas
class ValidationCreateRequest(BaseModel):
    """Request to validate a report."""
    report_id: uuid.UUID
    validation_type: ValidationType
    
    # User's current location for proximity verification
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    
    # For duplicate flags
    duplicate_report_id: Optional[uuid.UUID] = None


class ValidationDeleteRequest(BaseModel):
    """Request to remove a validation."""
    report_id: uuid.UUID
    validation_type: ValidationType


# Response schemas
class ValidationResponse(BaseModel):
    """Validation response."""
    id: uuid.UUID
    report_id: uuid.UUID
    validation_type: ValidationType
    weight: float
    distance_from_report: Optional[float] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ValidationSummaryResponse(BaseModel):
    """Summary of validations for a report."""
    report_id: uuid.UUID
    confirmation_count: int
    flag_false_count: int
    flag_malicious_count: int
    flag_duplicate_count: int
    total_confirmation_weight: float
    total_flag_weight: float
    user_validation: Optional[ValidationResponse] = None


class ModerationActionResponse(BaseModel):
    """Moderation action response."""
    id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    action: str
    reason: Optional[str] = None
    previous_state: Optional[str] = None
    new_state: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
