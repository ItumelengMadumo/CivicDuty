"""
User service for authentication and user management.
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.models.user import User, UserRole, UserStatus, DeviceSession
from app.core.security import (
    create_access_token,
    create_anonymous_token,
    hash_device_fingerprint,
    get_password_hash,
    verify_password,
    generate_verification_code,
)
from app.core.config import settings
from app.schemas.user import (
    AnonymousAuthRequest,
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
)


class UserService:
    """Service for user operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """Get user by ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()
    
    async def get_by_phone(self, phone: str) -> Optional[User]:
        """Get user by phone."""
        result = await self.db.execute(
            select(User).where(User.phone == phone)
        )
        return result.scalar_one_or_none()
    
    async def get_by_device_hash(self, device_hash: str) -> Optional[User]:
        """Get user by device hash."""
        result = await self.db.execute(
            select(User).where(User.device_hash == device_hash)
        )
        return result.scalar_one_or_none()
    
    async def authenticate_anonymous(self, request: AnonymousAuthRequest) -> TokenResponse:
        """
        Authenticate or create an anonymous user based on device fingerprint.
        Returns device-bound token.
        """
        device_hash = hash_device_fingerprint(request.device_fingerprint)
        
        # Check for existing anonymous user
        user = await self.get_by_device_hash(device_hash)
        
        if not user:
            # Create new anonymous user
            user = User(
                device_hash=device_hash,
                role=UserRole.ANONYMOUS,
                trust_score=settings.TRUST_INITIAL
            )
            self.db.add(user)
            await self.db.flush()
        
        # Update device session
        await self._update_device_session(user.id, device_hash, request.platform, request.app_version)
        
        # Update last active
        user.last_active = datetime.utcnow()
        await self.db.commit()
        
        # Create token
        token = create_anonymous_token(request.device_fingerprint)
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.ANONYMOUS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            user_id=str(user.id),
            is_anonymous=True
        )
    
    async def register(self, request: UserRegisterRequest) -> TokenResponse:
        """
        Register a new identified user.
        Optionally links anonymous history if device fingerprint provided.
        """
        # Check for existing user
        if request.email:
            existing = await self.get_by_email(request.email)
            if existing:
                raise ValueError("Email already registered")
        
        if request.phone:
            existing = await self.get_by_phone(request.phone)
            if existing:
                raise ValueError("Phone already registered")
        
        # Check if we should upgrade an anonymous account
        user = None
        if request.device_fingerprint:
            device_hash = hash_device_fingerprint(request.device_fingerprint)
            user = await self.get_by_device_hash(device_hash)
        
        if user and user.is_anonymous:
            # Upgrade anonymous to identified
            user.email = request.email.lower() if request.email else None
            user.phone = request.phone
            user.password_hash = get_password_hash(request.password)
            user.role = UserRole.USER
        else:
            # Create new user
            user = User(
                email=request.email.lower() if request.email else None,
                phone=request.phone,
                password_hash=get_password_hash(request.password),
                role=UserRole.USER,
                trust_score=settings.TRUST_INITIAL
            )
            self.db.add(user)
        
        # Generate verification code
        user.verification_code = generate_verification_code()
        user.verification_expires = datetime.utcnow() + timedelta(hours=24)
        
        await self.db.commit()
        
        # Create token
        token = create_access_token(str(user.id), token_type="user")
        
        # TODO: Send verification email/SMS
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=str(user.id),
            is_anonymous=False
        )
    
    async def login(self, request: UserLoginRequest) -> TokenResponse:
        """Login with email/phone and password."""
        user = None
        
        if request.email:
            user = await self.get_by_email(request.email)
        elif request.phone:
            user = await self.get_by_phone(request.phone)
        
        if not user or not user.password_hash:
            raise ValueError("Invalid credentials")
        
        if not verify_password(request.password, user.password_hash):
            raise ValueError("Invalid credentials")
        
        if user.status != UserStatus.ACTIVE:
            raise ValueError(f"Account is {user.status.value}")
        
        # Update last active
        user.last_active = datetime.utcnow()
        await self.db.commit()
        
        # Create token
        token = create_access_token(str(user.id), token_type="user")
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=str(user.id),
            is_anonymous=False
        )
    
    async def verify_code(self, user_id: uuid.UUID, code: str) -> bool:
        """Verify email/phone with code."""
        user = await self.get_by_id(user_id)
        
        if not user:
            return False
        
        if user.verification_code != code:
            return False
        
        if user.verification_expires and user.verification_expires < datetime.utcnow():
            return False
        
        # Mark as verified
        if user.email:
            user.email_verified = True
        if user.phone:
            user.phone_verified = True
        
        user.verification_code = None
        user.verification_expires = None
        
        await self.db.commit()
        return True
    
    async def update_trust_score(self, user_id: uuid.UUID, delta: float) -> float:
        """Update user's trust score."""
        user = await self.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        
        # Apply change within bounds
        new_score = max(
            settings.TRUST_MIN,
            min(settings.TRUST_MAX, user.trust_score + delta)
        )
        user.trust_score = new_score
        await self.db.commit()
        
        return new_score
    
    async def increment_stats(
        self,
        user_id: uuid.UUID,
        reports_submitted: int = 0,
        reports_confirmed: int = 0,
        reports_flagged: int = 0,
        validations_given: int = 0
    ):
        """Increment user statistics."""
        user = await self.get_by_id(user_id)
        if not user:
            return
        
        user.reports_submitted += reports_submitted
        user.reports_confirmed += reports_confirmed
        user.reports_flagged += reports_flagged
        user.validations_given += validations_given
        
        await self.db.commit()
    
    async def _update_device_session(
        self,
        user_id: uuid.UUID,
        device_hash: str,
        platform: Optional[str],
        app_version: Optional[str]
    ):
        """Update or create device session."""
        result = await self.db.execute(
            select(DeviceSession).where(
                DeviceSession.device_hash == device_hash,
                DeviceSession.user_id == user_id
            )
        )
        session = result.scalar_one_or_none()
        
        if session:
            session.last_seen = datetime.utcnow()
            session.platform = platform or session.platform
            session.app_version = app_version or session.app_version
        else:
            session = DeviceSession(
                user_id=user_id,
                device_hash=device_hash,
                platform=platform,
                app_version=app_version
            )
            self.db.add(session)
