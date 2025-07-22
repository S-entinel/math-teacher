#!/usr/bin/env python3
"""
Authentication Service for AI Math Teacher - SECURE VERSION
Handles user authentication, session management, and JWT tokens
Anonymous user creation to prevent session mixing
"""

import jwt
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException, Header
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database import get_database, User, ensure_user_exists
from logging_system import math_logger

# JWT Configuration
import os
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'super-secret-key')
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '30'))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('JWT_REFRESH_TOKEN_EXPIRE_DAYS', '7'))

# Request Models
class UserRegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    session_token: Optional[str] = None  # For upgrading anonymous users
    
    @validator('email')
    def validate_email(cls, v):
        v = v.strip().lower()
        if len(v) < 3 or '@' not in v:
            raise ValueError('Invalid email format')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class UserLoginRequest(BaseModel):
    email: str
    password: str
    
    @validator('email')
    def validate_email(cls, v):
        return v.strip().lower()

class PasswordResetRequest(BaseModel):
    email: str
    
    @validator('email')
    def validate_email(cls, v):
        return v.strip().lower()

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    
    @validator('display_name')
    def validate_display_name(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) < 1:
                return None
            if len(v) > 50:
                raise ValueError('Display name must be less than 50 characters')
        return v

class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class UserProfile(BaseModel):
    id: int
    email: Optional[str]
    display_name: Optional[str]
    username: Optional[str]
    account_type: str
    is_verified: bool
    created_at: datetime
    last_active: datetime
    preferences: Dict[str, Any]

class AuthService:
    """🔒 SECURE Authentication service for managing users and sessions"""
    
    def __init__(self):
        self.db = get_database()
    
    def get_session(self) -> Session:
        """Get a database session"""
        return self.db.get_session()
    
    # ===== TOKEN MANAGEMENT =====
    
    def create_access_token(self, user_id: int, email: str = None, extra_claims: Dict = None) -> str:
        """Create JWT access token"""
        now = datetime.utcnow()
        expire = now + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        
        payload = {
            'sub': str(user_id),  # Subject (user ID)
            'email': email,
            'iat': now,  # Issued at
            'exp': expire,  # Expires
            'type': 'access'
        }
        
        if extra_claims:
            payload.update(extra_claims)
        
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    def create_refresh_token(self, user_id: int) -> str:
        """Create JWT refresh token"""
        now = datetime.utcnow()
        expire = now + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        
        payload = {
            'sub': str(user_id),
            'iat': now,
            'exp': expire,
            'type': 'refresh'
        }
        
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    def refresh_access_token(self, refresh_token: str) -> AuthTokens:
        """Refresh access token using refresh token"""
        try:
            payload = self.verify_token(refresh_token)
            
            if payload.get('type') != 'refresh':
                raise HTTPException(status_code=401, detail="Invalid token type")
            
            user_id = int(payload['sub'])
            
            # Verify user still exists and is active
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id, User.is_active == True).first()
                if not user:
                    raise HTTPException(status_code=401, detail="User not found or inactive")
                
                # Create new tokens
                access_token = self.create_access_token(user.id, user.email)
                new_refresh_token = self.create_refresh_token(user.id)
                
                return AuthTokens(
                    access_token=access_token,
                    refresh_token=new_refresh_token,
                    expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                )
                
        except HTTPException:
            raise
        except Exception as e:
            math_logger.log_error(None, e, "refresh_access_token")
            raise HTTPException(status_code=401, detail="Token refresh failed")
    
    # ===== USER REGISTRATION AND LOGIN =====
    
    def register_user(self, register_data: UserRegisterRequest) -> Tuple[User, AuthTokens]:
        """Register a new user or upgrade anonymous user"""
        try:
            with self.get_session() as session:
                # Check if email already exists
                existing_user = session.query(User).filter(User.email == register_data.email).first()
                if existing_user:
                    raise HTTPException(status_code=400, detail="Email already registered")
                
                # If session_token provided, try to upgrade anonymous user
                if register_data.session_token:
                    user = session.query(User).filter(User.session_token == register_data.session_token).first()
                    if user and user.account_type == 'anonymous':
                        # Upgrade anonymous user to registered
                        user.email = register_data.email
                        user.account_type = 'registered'
                        user.display_name = register_data.display_name
                        user.set_password(register_data.password)
                        user.last_active = datetime.utcnow()
                        session.commit()
                        
                        # Create tokens
                        access_token = self.create_access_token(user.id, user.email)
                        refresh_token = self.create_refresh_token(user.id)
                        
                        tokens = AuthTokens(
                            access_token=access_token,
                            refresh_token=refresh_token,
                            expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                        )
                        
                        math_logger.logger.info(f"Upgraded anonymous user to registered: {user.email}")
                        return user, tokens
                
                # Create new registered user
                user = User(
                    email=register_data.email,
                    display_name=register_data.display_name,
                    account_type='registered',
                    session_token=str(uuid.uuid4()),  # Keep session token for compatibility
                    preferences={
                        'theme': 'dark',
                        'auto_save_interval': 30
                    }
                )
                user.set_password(register_data.password)
                
                session.add(user)
                session.commit()
                
                # Create tokens
                access_token = self.create_access_token(user.id, user.email)
                refresh_token = self.create_refresh_token(user.id)
                
                tokens = AuthTokens(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                )
                
                math_logger.logger.info(f"Registered new user: {user.email}")
                return user, tokens
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "register_user")
            raise HTTPException(status_code=500, detail="Registration failed")
    
    def login_user(self, login_data: UserLoginRequest) -> Tuple[User, AuthTokens]:
        """Authenticate user and return tokens"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(
                    User.email == login_data.email,
                    User.is_active == True
                ).first()
                
                if not user or not user.check_password(login_data.password):
                    raise HTTPException(status_code=401, detail="Invalid email or password")
                
                # Update last login
                user.last_login = datetime.utcnow()
                user.last_active = datetime.utcnow()
                session.commit()
                
                # Create tokens
                access_token = self.create_access_token(user.id, user.email)
                refresh_token = self.create_refresh_token(user.id)
                
                tokens = AuthTokens(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                )
                
                math_logger.logger.info(f"User logged in: {user.email}")
                return user, tokens
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "login_user")
            raise HTTPException(status_code=500, detail="Login failed")
    
    def is_email_available(self, email: str) -> bool:
        """Check if email is available for registration"""
        try:
            with self.get_session() as session:
                existing_user = session.query(User).filter(User.email == email.lower()).first()
                return existing_user is None
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "is_email_available")
            return False
    
    # ===== PASSWORD MANAGEMENT =====
    
    def request_password_reset(self, reset_data: PasswordResetRequest) -> bool:
        """Request password reset (email would be sent in production)"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.email == reset_data.email).first()
                
                if user:
                    # Generate reset token
                    reset_token = user.generate_reset_token()
                    session.commit()
                    
                    # In production, send email with reset link
                    math_logger.logger.info(f"Password reset requested for: {user.email}")
                    
                # Always return True to prevent email enumeration
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "request_password_reset")
            # Still return True to prevent enumeration
            return True
    
    def reset_password(self, reset_data: PasswordResetConfirm) -> bool:
        """Reset password using token"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(
                    User.reset_token == reset_data.token,
                    User.reset_token_expires > datetime.utcnow()
                ).first()
                
                if not user:
                    raise HTTPException(status_code=400, detail="Invalid or expired reset token")
                
                # Update password and clear reset token
                user.set_password(reset_data.new_password)
                user.reset_token = None
                user.reset_token_expires = None
                user.last_active = datetime.utcnow()
                session.commit()
                
                math_logger.logger.info(f"Password reset completed for: {user.email}")
                return True
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "reset_password")
            raise HTTPException(status_code=500, detail="Password reset failed")
    
    def change_password(self, user_id: int, change_data: PasswordChangeRequest) -> bool:
        """Change password for authenticated user"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                if not user.check_password(change_data.current_password):
                    raise HTTPException(
                        status_code=400,
                        detail="Current password is incorrect"
                    )
                
                # Update password
                user.set_password(change_data.new_password)
                user.last_active = datetime.utcnow()
                session.commit()
                
                math_logger.logger.info(f"Password changed for user: {user.email}")
                return True
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "change_password")
            raise HTTPException(status_code=500, detail="Password change failed")
    
    # ===== USER PROFILE MANAGEMENT =====
    
    def get_user_profile(self, user_id: int) -> UserProfile:
        """Get user profile information"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                return UserProfile(
                    id=user.id,
                    email=user.email,
                    display_name=user.display_name,
                    username=user.username,
                    account_type=user.account_type,
                    is_verified=user.is_verified,
                    created_at=user.created_at,
                    last_active=user.last_active,
                    preferences=user.preferences or {}
                )
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"get_user_profile_{user_id}")
            raise HTTPException(status_code=500, detail="Failed to get profile")
    
    def update_user_profile(self, user_id: int, update_data: UserProfileUpdate) -> UserProfile:
        """Update user profile information"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                # Update fields if provided
                if update_data.display_name is not None:
                    user.display_name = update_data.display_name
                
                if update_data.preferences is not None:
                    # Merge preferences
                    user.preferences = {**(user.preferences or {}), **update_data.preferences}
                
                user.last_active = datetime.utcnow()
                session.commit()
                
                return self.get_user_profile(user_id)
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"update_user_profile_{user_id}")
            raise HTTPException(status_code=500, detail="Profile update failed")
    
    def deactivate_account(self, user_id: int) -> bool:
        """Deactivate user account (soft delete)"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                user.is_active = False
                user.last_active = datetime.utcnow()
                session.commit()
                
                math_logger.logger.info(f"Account deactivated for user: {user.email}")
                return True
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"deactivate_account_{user_id}")
            raise HTTPException(status_code=500, detail="Account deactivation failed")
    
    def delete_account(self, user_id: int) -> bool:
        """Permanently delete user account and all data"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                user_email = user.email
                
                # Delete user (cascades to all related data)
                session.delete(user)
                session.commit()
                
                math_logger.logger.info(f"Account deleted for user: {user_email}")
                return True
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"delete_account_{user_id}")
            raise HTTPException(status_code=500, detail="Account deletion failed")
    
    # ===== UTILITY METHODS =====
    
    def get_or_create_anonymous_user(self, session_token: str = None) -> Tuple[Dict[str, Any], str]:
        """🔒 SECURITY FIXED: Get or create anonymous user with SECURE ISOLATION"""
        try:
            with self.get_session() as session:
                
                # If session_token provided, look for existing user with that token
                if session_token:
                    user = session.query(User).filter(User.session_token == session_token).first()
                    if user:
                        user.last_active = datetime.utcnow()
                        session.commit()
                        return user.to_dict(), user.session_token
                
                # 🔒 SECURITY FIXED: Always create new anonymous user if not found
                # This ensures each anonymous session is completely isolated
                new_token = session_token or str(uuid.uuid4())
                user = User(
                    username=None,
                    email=None,
                    session_token=new_token,
                    account_type='anonymous',
                    preferences={
                        'theme': 'dark',
                        'auto_save_interval': 30
                    }
                )
                session.add(user)
                session.commit()
                
                math_logger.logger.info(f"Created new anonymous user with token: {new_token[:8]}...")
                return user.to_dict(), user.session_token
                    
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "get_or_create_anonymous_user")
            raise HTTPException(status_code=500, detail="Failed to create user session")
        except Exception as e:
            math_logger.log_error(None, e, "get_or_create_anonymous_user")
            raise HTTPException(status_code=500, detail="Failed to create user session")
    
    def validate_session_token(self, session_token: str) -> Optional[Dict[str, Any]]:
        """Validate legacy session token and return user"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.session_token == session_token).first()
                
                if user:
                    user.last_active = datetime.utcnow()
                    session.commit()
                    return user.to_dict()
                
                return None
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "validate_session_token")
            return None

# Global auth service instance
auth_service = None

def get_auth_service() -> AuthService:
    """Get the global authentication service"""
    global auth_service
    if auth_service is None:
        auth_service = AuthService()
    return auth_service

# Helper functions for FastAPI dependencies
def extract_bearer_token(authorization: str = None) -> Optional[str]:
    """Extract bearer token from Authorization header"""
    if not authorization:
        return None
    
    if not authorization.startswith("Bearer "):
        return None
    
    return authorization.split(" ")[1]

def get_current_user_from_token(token: str) -> Optional[Dict[str, Any]]:
    """Get current user from JWT token"""
    try:
        auth_service = get_auth_service()
        payload = auth_service.verify_token(token)
        
        user_id = int(payload['sub'])
        
        with auth_service.get_session() as session:
            user = session.query(User).filter(User.id == user_id, User.is_active == True).first()
            if user:
                user.last_active = datetime.utcnow()
                session.commit()
                return user.to_dict()
        
        return None
        
    except Exception as e:
        math_logger.log_error(None, e, "get_current_user_from_token")
        return None

def get_current_user_optional(
    authorization: str = Header(None),
    x_user_token: str = Header(None, alias="X-User-Token")
) -> Optional[Dict[str, Any]]:
    """Get current user from either JWT token or legacy session token (optional)"""
    
    # Try JWT token first
    jwt_token = extract_bearer_token(authorization)
    if jwt_token:
        user = get_current_user_from_token(jwt_token)
        if user:
            return user
    
    # Try legacy session token
    if x_user_token:
        try:
            auth_service = get_auth_service()
            user = auth_service.validate_session_token(x_user_token)
            return user
        except Exception:
            pass
    
    return None

def require_authenticated_user(authorization: str = Header(None)) -> Dict[str, Any]:
    """Require authenticated user with JWT token (raises exception if not authenticated)"""
    
    jwt_token = extract_bearer_token(authorization)
    if not jwt_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    user = get_current_user_from_token(jwt_token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    # Don't allow anonymous users for authenticated endpoints
    if user.get('account_type') == 'anonymous':
        raise HTTPException(status_code=401, detail="Authentication required")
    
    return user

def get_user_from_request(
    authorization: str = Header(None),
    x_user_token: str = Header(None, alias="X-User-Token")
) -> Optional[Dict[str, Any]]:
    """Get user from request headers - used as FastAPI dependency"""
    return get_current_user_optional(authorization, x_user_token)

# Export key components
__all__ = [
    'AuthService',
    'get_auth_service',
    'UserRegisterRequest',
    'UserLoginRequest', 
    'PasswordResetRequest',
    'PasswordResetConfirm',
    'PasswordChangeRequest',
    'UserProfileUpdate',
    'AuthTokens',
    'UserProfile',
    'get_current_user_optional',
    'require_authenticated_user',
    'get_user_from_request',
    'extract_bearer_token'
]