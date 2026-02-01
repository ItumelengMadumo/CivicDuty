"""
Reports API endpoints.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.db.session import get_db
from app.services.report_service import ReportService
from app.services.user_service import UserService
from app.services.media_service import media_service
from app.core.security import require_auth, TokenData
from app.models.report import ReportCategory, ReportStatus
from app.schemas.report import (
    ReportCreateRequest,
    ReportUpdateRequest,
    ReportFilterRequest,
    ReportResponse,
    ReportListResponse,
    ReportMapResponse,
    ReportScoreBreakdown,
    MediaUploadUrlResponse,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    request: ReportCreateRequest,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new civic report.
    Supports idempotent creation via client_id for offline sync.
    """
    service = ReportService(db)
    user_service = UserService(db)
    
    user_id = uuid.UUID(token_data.subject)
    report = await service.create(request, user_id)
    
    # Update user stats
    await user_service.increment_stats(user_id, reports_submitted=1)
    
    reporter = await user_service.get_by_id(user_id)
    return service._to_response(report, reporter, user_id)


@router.get("", response_model=ReportListResponse)
async def list_reports(
    categories: Optional[List[ReportCategory]] = Query(None),
    statuses: Optional[List[ReportStatus]] = Query(None),
    min_score: Optional[float] = Query(None),
    max_score: Optional[float] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    north: Optional[float] = Query(None),
    south: Optional[float] = Query(None),
    east: Optional[float] = Query(None),
    west: Optional[float] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """List reports with filters and pagination."""
    from datetime import datetime
    
    filters = ReportFilterRequest(
        categories=categories,
        statuses=statuses,
        min_score=min_score,
        max_score=max_score,
        date_from=datetime.fromisoformat(date_from) if date_from else None,
        date_to=datetime.fromisoformat(date_to) if date_to else None,
        north=north,
        south=south,
        east=east,
        west=west,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    service = ReportService(db)
    user_id = uuid.UUID(token_data.subject)
    
    return await service.list_reports(filters, user_id)


@router.get("/map", response_model=List[ReportMapResponse])
async def get_map_reports(
    north: float = Query(..., ge=-90, le=90),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    west: float = Query(..., ge=-180, le=180),
    categories: Optional[List[ReportCategory]] = Query(None),
    statuses: Optional[List[ReportStatus]] = Query(None),
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get minimal report data for map display within geographic bounds."""
    service = ReportService(db)
    return await service.get_map_reports(
        north=north,
        south=south,
        east=east,
        west=west,
        categories=categories,
        statuses=statuses
    )


@router.get("/my", response_model=ReportListResponse)
async def get_my_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's reports."""
    from sqlalchemy import select, func
    from app.models.report import Report
    import math
    
    user_id = uuid.UUID(token_data.subject)
    
    # Get total count
    count_result = await db.execute(
        select(func.count(Report.id)).where(Report.reporter_id == user_id)
    )
    total = count_result.scalar()
    
    # Get reports
    result = await db.execute(
        select(Report)
        .where(Report.reporter_id == user_id)
        .order_by(Report.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    reports = result.scalars().all()
    
    service = ReportService(db)
    user_service = UserService(db)
    reporter = await user_service.get_by_id(user_id)
    
    items = [service._to_response(r, reporter, user_id) for r in reports]
    
    return ReportListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0
    )


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get a single report with full details."""
    service = ReportService(db)
    user_service = UserService(db)
    
    report = await service.get_by_id(report_id, include_media=True, include_history=True)
    
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    
    reporter = await user_service.get_by_id(report.reporter_id)
    user_id = uuid.UUID(token_data.subject)
    
    return service._to_response(report, reporter, user_id)


@router.patch("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: uuid.UUID,
    request: ReportUpdateRequest,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Update a report (limited to owner, early status only)."""
    service = ReportService(db)
    user_service = UserService(db)
    
    user_id = uuid.UUID(token_data.subject)
    
    try:
        report = await service.update(report_id, request, user_id)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    
    reporter = await user_service.get_by_id(report.reporter_id)
    return service._to_response(report, reporter, user_id)


@router.get("/{report_id}/score", response_model=ReportScoreBreakdown)
async def get_score_breakdown(
    report_id: uuid.UUID,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed score breakdown for a report."""
    service = ReportService(db)
    
    try:
        return await service.get_score_breakdown(report_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{report_id}/media/upload-url", response_model=MediaUploadUrlResponse)
async def get_media_upload_url(
    report_id: uuid.UUID,
    media_type: str = Query(..., pattern="^(photo|video)$"),
    mime_type: str = Query(...),
    file_size: int = Query(..., gt=0),
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a pre-signed URL for direct media upload to storage.
    Client uploads directly to S3, then calls confirm endpoint.
    """
    from app.core.config import settings
    
    service = ReportService(db)
    user_id = uuid.UUID(token_data.subject)
    
    # Verify report exists and user is owner
    report = await service.get_by_id(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    
    if report.reporter_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Validate file type and size
    if not media_service.validate_file_type(mime_type, media_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")
    
    if not media_service.validate_file_size(file_size, media_type):
        max_mb = settings.MAX_IMAGE_SIZE_MB if media_type == "photo" else settings.MAX_VIDEO_SIZE_MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {max_mb}MB"
        )
    
    # Check media count limit
    if len(report.media) >= settings.MAX_MEDIA_PER_REPORT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {settings.MAX_MEDIA_PER_REPORT} media files per report"
        )
    
    # Generate upload URL
    media_id = uuid.uuid4()
    upload_url, key = media_service.generate_upload_url(media_id, mime_type)
    
    return MediaUploadUrlResponse(
        media_id=media_id,
        upload_url=upload_url,
        expires_in=3600,
        max_size=settings.MAX_IMAGE_SIZE_MB * 1024 * 1024 if media_type == "photo" else settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
    )


@router.post("/{report_id}/media/{media_id}/confirm")
async def confirm_media_upload(
    report_id: uuid.UUID,
    media_id: uuid.UUID,
    media_type: str = Query(..., pattern="^(photo|video)$"),
    mime_type: str = Query(...),
    file_size: int = Query(...),
    width: Optional[int] = Query(None),
    height: Optional[int] = Query(None),
    duration: Optional[int] = Query(None),
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Confirm that media has been uploaded to storage."""
    from datetime import datetime
    
    service = ReportService(db)
    user_id = uuid.UUID(token_data.subject)
    
    # Verify report exists and user is owner
    report = await service.get_by_id(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    
    if report.reporter_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Generate storage key
    _, key = media_service.generate_upload_url(media_id, mime_type)
    
    # Add media record
    media = await service.add_media(
        report_id=report_id,
        storage_key=key,
        media_type=media_type,
        mime_type=mime_type,
        file_size=file_size,
        width=width,
        height=height,
        duration=duration,
        captured_at=datetime.utcnow()
    )
    
    return {"message": "Media confirmed", "media_id": str(media.id)}
