"""
Report service for creating and managing civic reports.
"""
from datetime import datetime
from typing import Optional, List, Tuple
import uuid
import math

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.models.report import Report, ReportMedia, ReportStatusEvent, ReportCategory, ReportStatus
from app.models.user import User
from app.core.config import settings
from app.schemas.report import (
    ReportCreateRequest,
    ReportUpdateRequest,
    ReportFilterRequest,
    ReportResponse,
    ReportListResponse,
    ReportMapResponse,
    MediaResponse,
    StatusEventResponse,
    ReportScoreBreakdown,
)


class ReportService:
    """Service for report operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(
        self,
        request: ReportCreateRequest,
        reporter_id: uuid.UUID
    ) -> Report:
        """Create a new report."""
        # Check for duplicate client_id
        if request.client_id:
            existing = await self.get_by_client_id(request.client_id)
            if existing:
                return existing  # Idempotent for offline sync
        
        # Get reporter for trust multiplier
        reporter = await self.db.get(User, reporter_id)
        trust_multiplier = (reporter.trust_score / 100) if reporter else 1.0
        
        report = Report(
            client_id=request.client_id,
            reporter_id=reporter_id,
            category=request.category,
            subcategory=request.subcategory,
            description=request.description,
            latitude=request.latitude,
            longitude=request.longitude,
            location_accuracy=request.location_accuracy,
            captured_at=request.captured_at,
            submitted_at=datetime.utcnow(),
            status=ReportStatus.SUBMITTED,
            base_score=settings.SCORE_BASE,
            trust_multiplier=trust_multiplier
        )
        
        self.db.add(report)
        await self.db.flush()
        
        # Record status event
        event = ReportStatusEvent(
            report_id=report.id,
            previous_status=None,
            new_status=ReportStatus.SUBMITTED,
            change_source="user"
        )
        self.db.add(event)
        
        # Calculate initial score
        await self._recalculate_score(report)
        
        await self.db.commit()
        await self.db.refresh(report)
        
        return report
    
    async def get_by_id(
        self,
        report_id: uuid.UUID,
        include_media: bool = True,
        include_history: bool = False
    ) -> Optional[Report]:
        """Get report by ID with optional related data."""
        query = select(Report).where(Report.id == report_id)
        
        if include_media:
            query = query.options(selectinload(Report.media))
        if include_history:
            query = query.options(selectinload(Report.status_history))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_client_id(self, client_id: str) -> Optional[Report]:
        """Get report by client-generated ID."""
        result = await self.db.execute(
            select(Report).where(Report.client_id == client_id)
        )
        return result.scalar_one_or_none()
    
    async def list_reports(
        self,
        filters: ReportFilterRequest,
        user_id: Optional[uuid.UUID] = None
    ) -> ReportListResponse:
        """List reports with filters and pagination."""
        query = select(Report).options(selectinload(Report.media))
        
        # Apply filters
        conditions = []
        
        if filters.categories:
            conditions.append(Report.category.in_(filters.categories))
        
        if filters.statuses:
            conditions.append(Report.status.in_(filters.statuses))
        
        if filters.min_score is not None:
            conditions.append(Report.total_score >= filters.min_score)
        
        if filters.max_score is not None:
            conditions.append(Report.total_score <= filters.max_score)
        
        if filters.date_from:
            conditions.append(Report.created_at >= filters.date_from)
        
        if filters.date_to:
            conditions.append(Report.created_at <= filters.date_to)
        
        # Geographic bounds
        if all([filters.north, filters.south, filters.east, filters.west]):
            conditions.append(Report.latitude <= filters.north)
            conditions.append(Report.latitude >= filters.south)
            conditions.append(Report.longitude <= filters.east)
            conditions.append(Report.longitude >= filters.west)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Get total count
        count_query = select(func.count(Report.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total = (await self.db.execute(count_query)).scalar()
        
        # Apply sorting
        sort_column = getattr(Report, filters.sort_by)
        if filters.sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        # Apply pagination
        offset = (filters.page - 1) * filters.page_size
        query = query.offset(offset).limit(filters.page_size)
        
        result = await self.db.execute(query)
        reports = result.scalars().all()
        
        # Convert to response
        items = []
        for report in reports:
            reporter = await self.db.get(User, report.reporter_id)
            items.append(self._to_response(report, reporter, user_id))
        
        return ReportListResponse(
            items=items,
            total=total,
            page=filters.page,
            page_size=filters.page_size,
            total_pages=math.ceil(total / filters.page_size) if total > 0 else 0
        )
    
    async def get_map_reports(
        self,
        north: float,
        south: float,
        east: float,
        west: float,
        categories: Optional[List[ReportCategory]] = None,
        statuses: Optional[List[ReportStatus]] = None
    ) -> List[ReportMapResponse]:
        """Get minimal report data for map display."""
        query = select(
            Report.id,
            Report.category,
            Report.status,
            Report.latitude,
            Report.longitude,
            Report.total_score,
            Report.confirmation_count,
            Report.created_at
        ).where(
            and_(
                Report.latitude <= north,
                Report.latitude >= south,
                Report.longitude <= east,
                Report.longitude >= west
            )
        )
        
        if categories:
            query = query.where(Report.category.in_(categories))
        
        if statuses:
            query = query.where(Report.status.in_(statuses))
        else:
            # Exclude drafts by default
            query = query.where(Report.status != ReportStatus.DRAFT)
        
        result = await self.db.execute(query)
        rows = result.all()
        
        return [
            ReportMapResponse(
                id=row.id,
                category=row.category,
                status=row.status,
                latitude=row.latitude,
                longitude=row.longitude,
                total_score=row.total_score,
                confirmation_count=row.confirmation_count,
                created_at=row.created_at
            )
            for row in rows
        ]
    
    async def update(
        self,
        report_id: uuid.UUID,
        request: ReportUpdateRequest,
        user_id: uuid.UUID
    ) -> Optional[Report]:
        """Update a report (limited to owner, limited fields)."""
        report = await self.get_by_id(report_id)
        
        if not report:
            return None
        
        if report.reporter_id != user_id:
            raise PermissionError("Not authorized to update this report")
        
        # Only allow updates in early states
        if report.status not in [ReportStatus.SUBMITTED, ReportStatus.DRAFT]:
            raise ValueError("Report cannot be modified in current state")
        
        if request.description is not None:
            report.description = request.description
        
        if request.subcategory is not None:
            report.subcategory = request.subcategory
        
        await self.db.commit()
        await self.db.refresh(report)
        
        return report
    
    async def update_status(
        self,
        report_id: uuid.UUID,
        new_status: ReportStatus,
        changed_by_id: Optional[uuid.UUID] = None,
        change_source: str = "system",
        notes: Optional[str] = None
    ) -> Report:
        """Update report status with audit trail."""
        report = await self.get_by_id(report_id)
        
        if not report:
            raise ValueError("Report not found")
        
        previous_status = report.status
        report.status = new_status
        
        # Record status event
        event = ReportStatusEvent(
            report_id=report_id,
            previous_status=previous_status,
            new_status=new_status,
            changed_by_id=changed_by_id,
            change_source=change_source,
            notes=notes
        )
        self.db.add(event)
        
        await self.db.commit()
        await self.db.refresh(report)
        
        return report
    
    async def add_media(
        self,
        report_id: uuid.UUID,
        storage_key: str,
        media_type: str,
        mime_type: str,
        file_size: int,
        width: Optional[int] = None,
        height: Optional[int] = None,
        duration: Optional[int] = None,
        captured_at: Optional[datetime] = None
    ) -> ReportMedia:
        """Add media to a report."""
        media = ReportMedia(
            report_id=report_id,
            storage_key=storage_key,
            media_type=media_type,
            mime_type=mime_type,
            file_size=file_size,
            width=width,
            height=height,
            duration=duration,
            captured_at=captured_at,
            upload_status="completed",
            uploaded_at=datetime.utcnow()
        )
        self.db.add(media)
        
        # Recalculate score
        report = await self.get_by_id(report_id)
        if report:
            await self._recalculate_score(report)
        
        await self.db.commit()
        await self.db.refresh(media)
        
        return media
    
    async def get_score_breakdown(self, report_id: uuid.UUID) -> ReportScoreBreakdown:
        """Get detailed score breakdown for a report."""
        report = await self.get_by_id(report_id, include_media=True)
        
        if not report:
            raise ValueError("Report not found")
        
        has_photo = any(m.media_type == "photo" for m in report.media)
        has_video = any(m.media_type == "video" for m in report.media)
        
        return ReportScoreBreakdown(
            base_score=report.base_score,
            evidence_score=report.evidence_score,
            community_score=report.community_score,
            trust_multiplier=report.trust_multiplier,
            total_score=report.total_score,
            has_photo=has_photo,
            has_video=has_video,
            has_gps=report.location_accuracy is not None and report.location_accuracy < 100,
            media_count=len(report.media),
            confirmation_count=report.confirmation_count,
            flag_count=report.flag_count,
            escalation_threshold=settings.SCORE_ESCALATION_THRESHOLD,
            is_eligible_for_escalation=report.is_eligible_for_escalation
        )
    
    async def recalculate_score(self, report_id: uuid.UUID):
        """Public method to recalculate report score."""
        report = await self.get_by_id(report_id, include_media=True)
        if report:
            await self._recalculate_score(report)
            await self.db.commit()
    
    async def _recalculate_score(self, report: Report):
        """Calculate total score from all factors."""
        # Evidence score from media
        evidence_score = 0.0
        
        for media in report.media:
            if media.media_type == "photo":
                evidence_score += settings.SCORE_MEDIA_PHOTO
            elif media.media_type == "video":
                evidence_score += settings.SCORE_MEDIA_VIDEO
        
        # GPS verification bonus
        if report.location_accuracy and report.location_accuracy < 50:
            evidence_score += settings.SCORE_GPS_VERIFIED
        
        # Community score from validations
        community_score = (
            report.confirmation_count * settings.SCORE_CONFIRMATION +
            report.flag_count * settings.SCORE_FLAG_PENALTY
        )
        
        report.evidence_score = evidence_score
        report.community_score = community_score
        
        # Total with trust multiplier
        raw_score = report.base_score + evidence_score + community_score
        report.total_score = max(0, raw_score * report.trust_multiplier)
        
        # Check for status transitions
        await self._check_status_transitions(report)
    
    async def _check_status_transitions(self, report: Report):
        """Check if report should transition to a new status."""
        # Community confirmed threshold
        if (report.status == ReportStatus.SUBMITTED and 
            report.confirmation_count >= 3):
            await self.update_status(
                report.id,
                ReportStatus.COMMUNITY_CONFIRMED,
                change_source="system",
                notes="Reached community confirmation threshold"
            )
    
    def _to_response(
        self,
        report: Report,
        reporter: Optional[User],
        current_user_id: Optional[uuid.UUID] = None
    ) -> ReportResponse:
        """Convert report model to response."""
        return ReportResponse(
            id=report.id,
            client_id=report.client_id,
            category=report.category,
            subcategory=report.subcategory,
            description=report.description,
            latitude=report.latitude,
            longitude=report.longitude,
            location_accuracy=report.location_accuracy,
            address=report.address,
            status=report.status,
            total_score=report.total_score,
            confirmation_count=report.confirmation_count,
            flag_count=report.flag_count,
            is_eligible_for_escalation=report.is_eligible_for_escalation,
            captured_at=report.captured_at,
            submitted_at=report.submitted_at,
            created_at=report.created_at,
            updated_at=report.updated_at,
            media=[MediaResponse.model_validate(m) for m in report.media],
            status_history=[StatusEventResponse.model_validate(e) for e in (report.status_history or [])],
            reporter_trust_score=reporter.trust_score if reporter else 50.0,
            is_own_report=report.reporter_id == current_user_id if current_user_id else False
        )
