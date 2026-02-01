"""
Admin/Moderation API endpoints.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
import uuid

from app.db.session import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.report import Report, ReportStatus, Category
from app.models.validation import ModerationAction
from app.services.report_service import ReportService
from app.services.user_service import UserService
from app.services.export_service import ExportService
from app.core.security import require_auth, require_identified_user, TokenData
from app.schemas.report import ReportResponse
from app.schemas.export import ExportCreateRequest, ExportResponse
from pydantic import BaseModel


class AdminStatsResponse(BaseModel):
    total_reports: int
    pending_review: int
    escalated: int
    resolved: int
    total_users: int
    active_users_30d: int
    total_validations: int


class ModerationReviewRequest(BaseModel):
    action: str  # approve, reject, escalate, merge
    reason: Optional[str] = None
    merge_into_id: Optional[uuid.UUID] = None


class UserModerationRequest(BaseModel):
    action: str  # warn, suspend, ban, restore
    reason: str


class CategoryCreateRequest(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    sort_order: int = 0


router = APIRouter(prefix="/admin", tags=["Admin"])


async def require_moderator(
    token_data: TokenData = Depends(require_identified_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Require moderator or admin role."""
    user = await db.get(User, uuid.UUID(token_data.subject))
    if not user or not user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator access required"
        )
    return user


async def require_admin(
    token_data: TokenData = Depends(require_identified_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Require admin role."""
    user = await db.get(User, uuid.UUID(token_data.subject))
    if not user or not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """Get platform statistics for moderators."""
    from datetime import datetime, timedelta
    from app.models.validation import Validation
    
    # Report counts
    total_reports = (await db.execute(select(func.count(Report.id)))).scalar()
    pending_review = (await db.execute(
        select(func.count(Report.id)).where(Report.status == ReportStatus.UNDER_REVIEW)
    )).scalar()
    escalated = (await db.execute(
        select(func.count(Report.id)).where(Report.status == ReportStatus.ESCALATED)
    )).scalar()
    resolved = (await db.execute(
        select(func.count(Report.id)).where(Report.status == ReportStatus.RESOLVED)
    )).scalar()
    
    # User counts
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.last_active >= thirty_days_ago)
    )).scalar()
    
    # Validation count
    total_validations = (await db.execute(select(func.count(Validation.id)))).scalar()
    
    return AdminStatsResponse(
        total_reports=total_reports or 0,
        pending_review=pending_review or 0,
        escalated=escalated or 0,
        resolved=resolved or 0,
        total_users=total_users or 0,
        active_users_30d=active_users or 0,
        total_validations=total_validations or 0
    )


@router.get("/reports/review", response_model=List[ReportResponse])
async def get_reports_for_review(
    status_filter: Optional[ReportStatus] = Query(ReportStatus.UNDER_REVIEW),
    min_flags: int = Query(0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """Get reports pending moderation review."""
    query = select(Report)
    
    conditions = []
    if status_filter:
        conditions.append(Report.status == status_filter)
    if min_flags > 0:
        conditions.append(Report.flag_count >= min_flags)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(Report.flag_count.desc(), Report.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    reports = result.scalars().all()
    
    service = ReportService(db)
    user_service = UserService(db)
    
    items = []
    for report in reports:
        reporter = await user_service.get_by_id(report.reporter_id)
        items.append(service._to_response(report, reporter, moderator.id))
    
    return items


@router.post("/reports/{report_id}/review")
async def review_report(
    report_id: uuid.UUID,
    request: ModerationReviewRequest,
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """Take moderation action on a report."""
    service = ReportService(db)
    report = await service.get_by_id(report_id)
    
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    
    # Determine new status based on action
    status_map = {
        "approve": ReportStatus.COMMUNITY_CONFIRMED,
        "reject": ReportStatus.REJECTED,
        "escalate": ReportStatus.ESCALATED,
        "merge": ReportStatus.DUPLICATE
    }
    
    new_status = status_map.get(request.action)
    if not new_status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action")
    
    # Handle merge
    if request.action == "merge" and request.merge_into_id:
        report.duplicate_of_id = request.merge_into_id
    
    # Update report status
    await service.update_status(
        report_id,
        new_status,
        changed_by_id=moderator.id,
        change_source="moderator",
        notes=request.reason
    )
    
    # Record moderation action
    action = ModerationAction(
        moderator_id=moderator.id,
        target_type="report",
        target_id=report_id,
        action=request.action,
        reason=request.reason,
        previous_state=report.status.value,
        new_state=new_status.value
    )
    db.add(action)
    
    # Update reporter trust score if rejected
    if request.action == "reject":
        user_service = UserService(db)
        await user_service.update_trust_score(
            report.reporter_id,
            -5.0  # Penalty for rejected report
        )
        await user_service.increment_stats(report.reporter_id, reports_flagged=1)
    
    await db.commit()
    
    return {"message": f"Report {request.action}d successfully"}


@router.post("/users/{user_id}/moderate")
async def moderate_user(
    user_id: uuid.UUID,
    request: UserModerationRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Take moderation action on a user (admin only)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Can't moderate admins
    if user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot moderate admin users")
    
    previous_status = user.status.value
    
    # Apply action
    if request.action == "warn":
        # Just record the warning
        pass
    elif request.action == "suspend":
        user.status = UserStatus.SUSPENDED
    elif request.action == "ban":
        user.status = UserStatus.BANNED
    elif request.action == "restore":
        user.status = UserStatus.ACTIVE
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action")
    
    # Record action
    action = ModerationAction(
        moderator_id=admin.id,
        target_type="user",
        target_id=user_id,
        action=request.action,
        reason=request.reason,
        previous_state=previous_status,
        new_state=user.status.value
    )
    db.add(action)
    
    await db.commit()
    
    return {"message": f"User {request.action} action completed"}


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(
    request: CategoryCreateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new category (admin only)."""
    # Check for duplicate code
    existing = await db.execute(
        select(Category).where(Category.code == request.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category code already exists")
    
    category = Category(
        code=request.code,
        name=request.name,
        description=request.description,
        icon=request.icon,
        color=request.color,
        parent_id=request.parent_id,
        sort_order=request.sort_order
    )
    db.add(category)
    await db.commit()
    
    return {"message": "Category created", "id": str(category.id)}


@router.post("/exports", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
async def create_export(
    request: ExportCreateRequest,
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """Create a new export of verified reports."""
    service = ExportService(db)
    
    bounds = None
    if all([request.north, request.south, request.east, request.west]):
        bounds = {
            "north": request.north,
            "south": request.south,
            "east": request.east,
            "west": request.west
        }
    
    export = await service.create_export(
        user_id=moderator.id,
        name=request.name,
        format=request.format,
        description=request.description,
        categories=request.categories,
        statuses=request.statuses,
        date_from=request.date_from,
        date_to=request.date_to,
        min_score=request.min_score,
        bounds=bounds
    )
    
    # Process export (in production, queue this as background task)
    export = await service.process_export(export.id)
    
    return ExportResponse.model_validate(export)


@router.get("/exports", response_model=List[ExportResponse])
async def list_exports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """List exports created by the user."""
    service = ExportService(db)
    exports = await service.list_exports(moderator.id, page, page_size)
    return [ExportResponse.model_validate(e) for e in exports]


@router.get("/exports/{export_id}/download")
async def download_export(
    export_id: uuid.UUID,
    moderator: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db)
):
    """Get download URL for an export."""
    service = ExportService(db)
    url = await service.get_download_url(export_id)
    
    if not url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found or expired"
        )
    
    return {"download_url": url}
