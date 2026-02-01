"""
Authentication API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.user_service import UserService
from app.core.security import require_auth, TokenData
from app.schemas.user import (
    AnonymousAuthRequest,
    UserRegisterRequest,
    UserLoginRequest,
    VerifyCodeRequest,
    TokenResponse,
    UserResponse,
    UserProfileResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/anonymous", response_model=TokenResponse)
async def authenticate_anonymous(
    request: AnonymousAuthRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate or create an anonymous user based on device fingerprint.
    Returns a device-bound token valid for 1 year.
    """
    service = UserService(db)
    return await service.authenticate_anonymous(request)


@router.post("/register", response_model=TokenResponse)
async def register(
    request: UserRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new identified user account.
    Optionally links previous anonymous activity via device fingerprint.
    """
    service = UserService(db)
    try:
        return await service.register(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Login with email/phone and password."""
    service = UserService(db)
    try:
        return await service.login(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/verify")
async def verify_code(
    request: VerifyCodeRequest,
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Verify email or phone with verification code."""
    import uuid
    service = UserService(db)
    success = await service.verify_code(uuid.UUID(token_data.subject), request.code)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code"
        )
    
    return {"message": "Verification successful"}


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user(
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's profile."""
    import uuid
    service = UserService(db)
    user = await service.get_by_id(uuid.UUID(token_data.subject))
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return UserProfileResponse.model_validate(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_data: TokenData = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Refresh authentication token."""
    import uuid
    from app.core.security import create_access_token, create_anonymous_token
    from app.core.config import settings
    
    service = UserService(db)
    user = await service.get_by_id(uuid.UUID(token_data.subject))
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if token_data.is_anonymous:
        token = create_anonymous_token(user.device_hash)
        expires_in = settings.ANONYMOUS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    else:
        token = create_access_token(str(user.id), token_type="user")
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user_id=str(user.id),
        is_anonymous=token_data.is_anonymous
    )
