"""
Categories API endpoints.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.db.session import get_db
from app.models.report import Category, ReportCategory
from app.core.security import require_auth, TokenData
from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    icon: str | None
    color: str | None
    parent_id: uuid.UUID | None
    is_active: bool
    sort_order: int
    
    class Config:
        from_attributes = True


class CategoryListResponse(BaseModel):
    categories: List[CategoryResponse]
    enum_values: List[str]


router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=CategoryListResponse)
async def list_categories(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """List all categories, including configurable ones and enum values."""
    # Get configurable categories from database
    query = select(Category).order_by(Category.sort_order)
    if active_only:
        query = query.where(Category.is_active == True)
    
    result = await db.execute(query)
    db_categories = result.scalars().all()
    
    # Also return enum values for reference
    enum_values = [c.value for c in ReportCategory]
    
    return CategoryListResponse(
        categories=[CategoryResponse.model_validate(c) for c in db_categories],
        enum_values=enum_values
    )


@router.get("/{code}", response_model=CategoryResponse)
async def get_category(
    code: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific category by code."""
    result = await db.execute(
        select(Category).where(Category.code == code)
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    
    return CategoryResponse.model_validate(category)
