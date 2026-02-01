"""
Validations API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.db.session import get_db
from app.services.validation_service import ValidationService
from app.services.user_service import UserService
from app.core.security import require_auth, TokenData
from app.schemas.validation import (
    ValidationCreateRequest,
    ValidationResponse,
    ValidationSummaryResponse,
)

router = APIRouter(prefix="/validations", tags=["Validations"])


@router.post("", response_model=ValidationResponse, status_code=status.HTTP_201_CREATED)
async def create_validation(
    request: ValidationCreateRequest,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """
    Validate a report (confirm observation or flag as problematic).
    Validation weight is based on user trust and proximity.
    """
    service = ValidationService(db)
    user_id = uuid.UUID(token_data.subject)
    
    try:
        validation = await service.create_validation(request, user_id)
        return ValidationResponse.model_validate(validation)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{report_id}/{validation_type}")
async def delete_validation(
    report_id: uuid.UUID,
    validation_type: str,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Remove a validation from a report."""
    from app.models.validation import ValidationType
    
    service = ValidationService(db)
    user_id = uuid.UUID(token_data.subject)
    
    try:
        vtype = ValidationType(validation_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid validation type")
    
    success = await service.delete_validation(report_id, user_id, vtype)
    
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation not found")
    
    return {"message": "Validation removed"}


@router.get("/reports/{report_id}/summary", response_model=ValidationSummaryResponse)
async def get_validation_summary(
    report_id: uuid.UUID,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get summary of all validations for a report."""
    service = ValidationService(db)
    user_id = uuid.UUID(token_data.subject)
    
    return await service.get_validation_summary(report_id, user_id)
