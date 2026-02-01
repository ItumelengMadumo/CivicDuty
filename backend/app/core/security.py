"""
Security utilities for authentication and authorization.
"""
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import hashlib
import secrets

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def create_access_token(
    subject: Union[str, int],
    token_type: str = "user",
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "sub": str(subject),
        "type": token_type,
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_anonymous_token(device_fingerprint: str) -> str:
    """Create a device-bound anonymous token."""
    device_hash = hash_device_fingerprint(device_fingerprint)
    expire = datetime.utcnow() + timedelta(days=settings.ANONYMOUS_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "sub": device_hash,
        "type": "anonymous",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def hash_device_fingerprint(fingerprint: str) -> str:
    """Create a secure hash of a device fingerprint."""
    return hashlib.sha256(f"{fingerprint}{settings.SECRET_KEY}".encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def generate_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return "".join([str(secrets.randbelow(10)) for _ in range(6)])


class TokenData:
    """Token data container."""
    def __init__(self, subject: str, token_type: str, is_anonymous: bool = False):
        self.subject = subject
        self.token_type = token_type
        self.is_anonymous = is_anonymous


async def get_current_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[TokenData]:
    """Extract and validate the current token."""
    if not credentials:
        return None
    
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return TokenData(
        subject=payload.get("sub"),
        token_type=payload.get("type"),
        is_anonymous=payload.get("type") == "anonymous"
    )


async def require_auth(
    token_data: Optional[TokenData] = Depends(get_current_token)
) -> TokenData:
    """Require authentication (anonymous or identified)."""
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_data


async def require_identified_user(
    token_data: TokenData = Depends(require_auth)
) -> TokenData:
    """Require an identified (non-anonymous) user."""
    if token_data.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Identified account required for this action"
        )
    return token_data
