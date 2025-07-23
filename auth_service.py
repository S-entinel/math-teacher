#!/usr/bin/env python3
"""
Authentication Service for AI Math Teacher - FIXED VERSION
Handles user registration, login, JWT tokens, and session management
"""

import os
import jwt
import uuid
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, EmailStr, validator
from fastapi import HTTPException
import secrets

from database import get_database, User, ensure_user_exists, get_user_by_email
from logging_system import math_logger

# JWT Configuration
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', secrets.token_urlsafe(32))
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 30  # 30 days

# Pydantic Models for Request/Response
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    session_token: Optional[str] = None  # For upgrading anonymous users
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if len(v) > 128:
            raise ValueError('Password must be less than 128 characters')
        return v
    
    @validator('display_name')
    def validate_display_name(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) < 1:
                return None
            if len(v) > 50:
                raise ValueError('Display name must be less than 50 characters')
        return v

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if len(v) > 128:
            raise ValueError('Password must be less than 128 characters')
        return v

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if len(v) > 128:
            raise ValueError('Password must be less than 128 characters')
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
    """Authentication service for managing users and sessions"""
    
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
    
    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Get user from JWT token"""
        try:
            payload = self.verify_token(token)
            user_id = int(payload.get('sub'))
            
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                if user and user.is_active:
                    user.last_active = datetime.utcnow()
                    user_dict = user.to_dict()
                    session.commit()
                    return user_dict
                return None
        except (ValueError, HTTPException):
            return None
    
    # ===== USER REGISTRATION =====
    
    def register_user(self, register_data: UserRegisterRequest) -> Tuple[User, AuthTokens]:
        """Register a new user or upgrade anonymous user"""
        try:
            with self.get_session() as session:
                # Check if email already exists
                existing_user = get_user_by_email(session, register_data.email)
                if existing_user:
                    raise HTTPException(
                        status_code=400, 
                        detail="Email already registered"
                    )
                
                # If session_token provided, try to upgrade existing anonymous user
                if register_data.session_token:
                    anonymous_user = session.query(User).filter(
                        User.session_token == register_data.session_token,
                        User.account_type == 'anonymous'
                    ).first()
                    
                    if anonymous_user:
                        # Upgrade anonymous user to registered
                        anonymous_user.promote_to_registered(
                            email=register_data.email,
                            password=register_data.password,
                            display_name=register_data.display_name
                        )
                        anonymous_user.last_login = datetime.utcnow()
                        session.commit()
                        
                        # Create tokens
                        access_token = self.create_access_token(
                            anonymous_user.id, 
                            anonymous_user.email
                        )
                        refresh_token = self.create_refresh_token(anonymous_user.id)
                        
                        tokens = AuthTokens(
                            access_token=access_token,
                            refresh_token=refresh_token,
                            expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                        )
                        
                        math_logger.logger.info(f"Upgraded anonymous user to registered: {anonymous_user.email}")
                        return anonymous_user, tokens
                
                # Create new registered user
                new_user = User(
                    email=register_data.email.lower(),
                    display_name=register_data.display_name or register_data.email.split('@')[0],
                    account_type='registered',
                    is_active=True,
                    session_token=str(uuid.uuid4()),
                    preferences={
                        'theme': 'dark',
                        'auto_save_interval': 30,
                    }
                )
                new_user.set_password(register_data.password)
                new_user.last_login = datetime.utcnow()
                
                session.add(new_user)
                session.commit()
                
                # Create tokens
                access_token = self.create_access_token(new_user.id, new_user.email)
                refresh_token = self.create_refresh_token(new_user.id)
                
                tokens = AuthTokens(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
                )
                
                math_logger.logger.info(f"Registered new user: {new_user.email}")
                return new_user, tokens
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "register_user")
            raise HTTPException(status_code=500, detail="Registration failed")
    
    # ===== USER LOGIN =====
    
    def login_user(self, login_data: UserLoginRequest) -> Tuple[User, AuthTokens]:
        """Authenticate user and return tokens"""
        try:
            with self.get_session() as session:
                user = get_user_by_email(session, login_data.email)
                
                if not user or not user.check_password(login_data.password):
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid email or password"
                    )
                
                if not user.is_active:
                    raise HTTPException(
                        status_code=401,
                        detail="Account is deactivated"
                    )
                
                # Update login timestamp
                user.last_login = datetime.utcnow()
                user.last_active = datetime.utcnow()
                session.commit()
                
                # Create tokens
                expire_minutes = JWT_ACCESS_TOKEN_EXPIRE_MINUTES
                if login_data.remember_me:
                    expire_minutes = JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 7  # 7 days if remember me
                
                access_token = self.create_access_token(user.id, user.email)
                refresh_token = self.create_refresh_token(user.id)
                
                tokens = AuthTokens(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_in=expire_minutes * 60
                )
                
                math_logger.logger.info(f"User logged in: {user.email}")
                return user, tokens
                
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "login_user")
            raise HTTPException(status_code=500, detail="Login failed")
    
    # ===== TOKEN REFRESH =====
    
    def refresh_access_token(self, refresh_token: str) -> AuthTokens:
        """Refresh access token using refresh token"""
        try:
            payload = self.verify_token(refresh_token)
            
            if payload.get('type') != 'refresh':
                raise HTTPException(status_code=401, detail="Invalid token type")
            
            user_id = int(payload.get('sub'))
            
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                
                if not user or not user.is_active:
                    raise HTTPException(status_code=401, detail="User not found or inactive")
                
                # Update last active
                user.last_active = datetime.utcnow()
                session.commit()
                
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
        except (ValueError, SQLAlchemyError) as e:
            math_logger.log_error(None, e, "refresh_access_token")
            raise HTTPException(status_code=401, detail="Token refresh failed")
    
    # ===== PASSWORD MANAGEMENT =====
    
    def request_password_reset(self, reset_data: PasswordResetRequest) -> bool:
        """Generate password reset token"""
        try:
            with self.get_session() as session:
                user = get_user_by_email(session, reset_data.email)
                
                if not user:
                    # Don't reveal if email exists or not
                    return True
                
                # Generate reset token
                reset_token = user.generate_reset_token()
                session.commit()
                
                # TODO: Send email with reset token
                # For now, we'll log it (in production, send via email service)
                math_logger.logger.info(f"Password reset requested for {user.email}, token: {reset_token}")
                
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "request_password_reset")
            return False
    
    def reset_password(self, reset_data: PasswordResetConfirm) -> bool:
        """Reset password using reset token"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(
                    User.reset_token == reset_data.token,
                    User.reset_token_expires > datetime.utcnow()
                ).first()
                
                if not user:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid or expired reset token"
                    )
                
                # Update password and clear reset token
                user.set_password(reset_data.new_password)
                user.clear_reset_token()
                user.last_active = datetime.utcnow()
                session.commit()
                
                math_logger.logger.info(f"Password reset completed for user: {user.email}")
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
                
                # Update fields
                if update_data.display_name is not None:
                    user.display_name = update_data.display_name
                
                if update_data.preferences is not None:
                    # Merge with existing preferences
                    current_prefs = user.preferences or {}
                    current_prefs.update(update_data.preferences)
                    user.preferences = current_prefs
                
                user.last_active = datetime.utcnow()
                session.commit()
                
                math_logger.logger.info(f"Profile updated for user: {user.email}")
                
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
            math_logger.log_error(None, e, f"update_user_profile_{user_id}")
            raise HTTPException(status_code=500, detail="Profile update failed")
    
    # ===== ACCOUNT MANAGEMENT =====
    
    def deactivate_account(self, user_id: int) -> bool:
        """Deactivate user account"""
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
        """Get or create anonymous user (for backward compatibility) - FINAL FIX"""
        try:
            with self.get_session() as session:
                user_obj = ensure_user_exists(session, session_token)
                # FIXED: Ensure we return a dictionary, not an object
                if hasattr(user_obj, 'to_dict'):
                    user_dict = user_obj.to_dict()
                else:
                    # Already a dict
                    user_dict = user_obj
                    
                session.commit()
                
                # Get session token from object or dict
                if hasattr(user_obj, 'session_token'):
                    token = user_obj.session_token
                else:
                    token = user_dict.get('session_token')
                    
                return user_dict, token
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "get_or_create_anonymous_user")
            raise HTTPException(status_code=500, detail="Failed to create user session")
        except Exception as e:
            math_logger.log_error(None, e, "get_or_create_anonymous_user")
            raise HTTPException(status_code=500, detail="Failed to create user session")
    
    def validate_session_token(self, session_token: str) -> Optional[Dict[str, Any]]:
        """Validate legacy session token and return user data"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.session_token == session_token).first()
                if user and user.is_active:
                    user.last_active = datetime.utcnow()
                    user_dict = user.to_dict()
                    session.commit()
                    return user_dict
                return None
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "validate_session_token")
            return None

# Global service instance
_auth_service = None

def get_auth_service() -> AuthService:
    """Get the global authentication service instance"""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service

# Utility functions for FastAPI dependencies
def extract_bearer_token(authorization: str = None) -> Optional[str]:
    """Extract bearer token from Authorization header"""
    if authorization and authorization.startswith('Bearer '):
        return authorization[7:]  # Remove 'Bearer ' prefix
    return None

def get_current_user_from_token(token: str) -> Optional[Dict[str, Any]]:
    """Get current user from JWT token"""
    auth_service = get_auth_service()
    return auth_service.get_user_from_token(token)

def get_current_user_optional(authorization: str = None, session_token: str = None) -> Optional[Dict[str, Any]]:
    """Get current user from token or session token (optional)"""
    auth_service = get_auth_service()
    
    # Try JWT token first
    if authorization:
        jwt_token = extract_bearer_token(authorization)
        if jwt_token:
            user = auth_service.get_user_from_token(jwt_token)
            if user:
                return user
    
    # Fallback to session token for anonymous users
    if session_token:
        return auth_service.validate_session_token(session_token)
    
    return None

def require_authenticated_user(authorization: str = None) -> Dict[str, Any]:
    """Require authenticated user, raise exception if not found"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    jwt_token = extract_bearer_token(authorization)
    if not jwt_token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    auth_service = get_auth_service()
    user = auth_service.get_user_from_token(jwt_token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user