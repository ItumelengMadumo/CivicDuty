"""
Validation service for community confirmations and flags.
"""
from datetime import datetime
from typing import Optional, List
import uuid
import math

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete, update
from geopy.distance import geodesic

from app.models.validation import Validation, ValidationType
from app.models.report import Report, ReportStatus
from app.models.user import User
from app.core.config import settings
from app.schemas.validation import (
    ValidationCreateRequest,
    ValidationResponse,
    ValidationSummaryResponse,
)


class ValidationService:
    """Service for validation operations."""
    
    # Maximum distance (meters) for proximity-weighted validation
    MAX_VALIDATION_DISTANCE = 5000  # 5km
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_validation(
        self,
        request: ValidationCreateRequest,
        user_id: uuid.UUID
    ) -> Validation:
        """Create a new validation for a report."""
        # Check if report exists
        report = await self.db.get(Report, request.report_id)
        if not report:
            raise ValueError("Report not found")
        
        # Can't validate own report
        if report.reporter_id == user_id:
            raise ValueError("Cannot validate your own report")
        
        # Check for existing validation of same type
        existing = await self._get_user_validation(
            request.report_id,
            user_id,
            request.validation_type
        )
        if existing:
            raise ValueError("You have already submitted this validation")
        
        # Calculate distance from report
        distance = None
        if request.latitude and request.longitude:
            distance = geodesic(
                (report.latitude, report.longitude),
                (request.latitude, request.longitude)
            ).meters
        
        # Calculate validation weight based on user trust and proximity
        user = await self.db.get(User, user_id)
        weight = self._calculate_weight(user, distance)
        
        validation = Validation(
            report_id=request.report_id,
            user_id=user_id,
            validation_type=request.validation_type,
            latitude=request.latitude,
            longitude=request.longitude,
            distance_from_report=distance,
            weight=weight,
            duplicate_report_id=request.duplicate_report_id
        )
        
        self.db.add(validation)
        await self.db.flush()
        
        # Update report counts
        await self._update_report_counts(request.report_id)
        
        # Update user stats
        if user:
            user.validations_given += 1
        
        await self.db.commit()
        await self.db.refresh(validation)
        
        return validation
    
    async def delete_validation(
        self,
        report_id: uuid.UUID,
        user_id: uuid.UUID,
        validation_type: ValidationType
    ) -> bool:
        """Remove a user's validation."""
        result = await self.db.execute(
            delete(Validation).where(
                and_(
                    Validation.report_id == report_id,
                    Validation.user_id == user_id,
                    Validation.validation_type == validation_type
                )
            )
        )
        
        if result.rowcount > 0:
            await self._update_report_counts(report_id)
            await self.db.commit()
            return True
        
        return False
    
    async def get_validation_summary(
        self,
        report_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None
    ) -> ValidationSummaryResponse:
        """Get summary of all validations for a report."""
        # Count by type
        result = await self.db.execute(
            select(
                Validation.validation_type,
                func.count(Validation.id),
                func.sum(Validation.weight)
            ).where(
                Validation.report_id == report_id,
                Validation.is_valid == True
            ).group_by(Validation.validation_type)
        )
        
        counts = {row[0]: (row[1], row[2] or 0) for row in result.all()}
        
        # Get user's validation if any
        user_validation = None
        if user_id:
            result = await self.db.execute(
                select(Validation).where(
                    Validation.report_id == report_id,
                    Validation.user_id == user_id
                )
            )
            val = result.scalar_one_or_none()
            if val:
                user_validation = ValidationResponse.model_validate(val)
        
        confirm_data = counts.get(ValidationType.CONFIRM, (0, 0))
        false_data = counts.get(ValidationType.FLAG_FALSE, (0, 0))
        malicious_data = counts.get(ValidationType.FLAG_MALICIOUS, (0, 0))
        duplicate_data = counts.get(ValidationType.FLAG_DUPLICATE, (0, 0))
        
        return ValidationSummaryResponse(
            report_id=report_id,
            confirmation_count=confirm_data[0],
            flag_false_count=false_data[0],
            flag_malicious_count=malicious_data[0],
            flag_duplicate_count=duplicate_data[0],
            total_confirmation_weight=confirm_data[1],
            total_flag_weight=false_data[1] + malicious_data[1],
            user_validation=user_validation
        )
    
    async def get_report_validations(
        self,
        report_id: uuid.UUID,
        validation_type: Optional[ValidationType] = None
    ) -> List[Validation]:
        """Get all validations for a report."""
        query = select(Validation).where(
            Validation.report_id == report_id,
            Validation.is_valid == True
        )
        
        if validation_type:
            query = query.where(Validation.validation_type == validation_type)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _get_user_validation(
        self,
        report_id: uuid.UUID,
        user_id: uuid.UUID,
        validation_type: ValidationType
    ) -> Optional[Validation]:
        """Get a specific validation by user and type."""
        result = await self.db.execute(
            select(Validation).where(
                and_(
                    Validation.report_id == report_id,
                    Validation.user_id == user_id,
                    Validation.validation_type == validation_type
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def _update_report_counts(self, report_id: uuid.UUID):
        """Update report confirmation and flag counts."""
        # Count confirmations
        confirm_result = await self.db.execute(
            select(func.count(Validation.id)).where(
                Validation.report_id == report_id,
                Validation.validation_type == ValidationType.CONFIRM,
                Validation.is_valid == True
            )
        )
        confirmation_count = confirm_result.scalar() or 0
        
        # Count flags (all types)
        flag_result = await self.db.execute(
            select(func.count(Validation.id)).where(
                Validation.report_id == report_id,
                Validation.validation_type.in_([
                    ValidationType.FLAG_FALSE,
                    ValidationType.FLAG_MALICIOUS,
                    ValidationType.FLAG_DUPLICATE
                ]),
                Validation.is_valid == True
            )
        )
        flag_count = flag_result.scalar() or 0
        
        # Update report
        await self.db.execute(
            update(Report).where(Report.id == report_id).values(
                confirmation_count=confirmation_count,
                flag_count=flag_count
            )
        )
        
        # Trigger score recalculation
        from app.services.report_service import ReportService
        report_service = ReportService(self.db)
        await report_service.recalculate_score(report_id)
    
    def _calculate_weight(
        self,
        user: Optional[User],
        distance: Optional[float]
    ) -> float:
        """Calculate validation weight based on user trust and proximity."""
        base_weight = 1.0
        
        # Trust factor (0.5 to 1.5)
        if user:
            trust_factor = 0.5 + (user.trust_score / 100)
        else:
            trust_factor = 0.5
        
        # Proximity factor (1.0 if nearby, decreasing with distance)
        proximity_factor = 1.0
        if distance is not None:
            if distance <= 100:
                proximity_factor = 1.5  # Very close
            elif distance <= 500:
                proximity_factor = 1.2  # Close
            elif distance <= self.MAX_VALIDATION_DISTANCE:
                proximity_factor = 1.0  # Within range
            else:
                proximity_factor = 0.5  # Far away
        
        return base_weight * trust_factor * proximity_factor
