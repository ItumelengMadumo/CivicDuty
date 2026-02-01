"""
API v1 router aggregating all endpoints.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, reports, validations, categories, admin

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(reports.router)
api_router.include_router(validations.router)
api_router.include_router(categories.router)
api_router.include_router(admin.router)
