#!/usr/bin/env python3
"""
AI Math Teacher FastAPI Backend with Authentication - SECURE VERSION
A web API for the AI math tutor using Google Gemini with SQLite database storage and user authentication
User data isolation and session security vulnerabilities
"""

import os
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

# Database imports
from database import get_database, get_db_session, User
from db_service import get_db_service, DatabaseService, ensure_session_exists_in_db, sync_in_memory_to_db

# Authentication imports
from auth_service import (
    get_auth_service, AuthService, UserRegisterRequest, UserLoginRequest,
    PasswordResetRequest, PasswordResetConfirm, PasswordChangeRequest,
    UserProfileUpdate, AuthTokens, UserProfile, get_current_user_optional,
    require_authenticated_user, extract_bearer_token
)


from logging_system import (
    math_logger, log_performance, log_request_context, 
    log_startup, log_shutdown, log_session_created, 
    log_session_restored, log_conversation_cleared,
    log_message_sent, log_feature_used
)

load_dotenv()

conversations: dict[str, dict] = {}

class MathTeacherAPI:
    def __init__(self):
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not found in environment variables")
        
        genai.configure(api_key=api_key)
        
        # Try to initialize with system_instruction, fallback if not supported
        try:
            self.model = genai.GenerativeModel(
                model_name="gemini-2.0-flash-exp",
                system_instruction=self.get_system_prompt()
            )
        except TypeError:
            # Fallback for older versions without system_instruction
            self.model = genai.GenerativeModel(model_name="gemini-2.0-flash-exp")
            self.system_prompt = self.get_system_prompt()
        
        # Initialize database
        try:
            self.db_service = get_db_service()
            math_logger.logger.info("Database service initialized successfully")
        except Exception as e:
            math_logger.logger.warning(f"Database initialization failed, using in-memory only: {e}")
            self.db_service = None
        
        # Initialize authentication service
        try:
            self.auth_service = get_auth_service()
            math_logger.logger.info("Authentication service initialized successfully")
        except Exception as e:
            math_logger.logger.warning(f"Authentication initialization failed: {e}")
            self.auth_service = None
        
        math_logger.logger.info("Math Teacher API initialized successfully")
    
    def get_system_prompt(self):
        # Keep existing system prompt unchanged
        base_prompt = """You are an intelligent AI math teacher with a confident, direct personality. You're highly knowledgeable about mathematics and take pride in your analytical abilities.

        Your teaching style:
        - Direct and efficient - you don't waste time with excessive pleasantries
        - Confident in your mathematical knowledge and occasionally show it
        - Helpful but expect students to engage thoughtfully with the material
        - Use clear, precise mathematical language
        - Provide step-by-step solutions when needed
        - Occasionally sarcastic or witty, but always educational
        - Patient with genuine questions, less patient with laziness

        Your personality quirks:
        - "Obviously..." or "Clearly..." (when something is straightforward)
        - "I suppose..." (when being slightly condescending but helpful)
        - "Interesting approach, but..." (when correcting errors)
        - "That's actually quite good" (when impressed)
        - "I suppose I should explain this more clearly..." (when being helpful)
        - "Clearly the answer is..." (when solution is straightforward)
        - "That's... not entirely wrong, but..." (gentle correction)

        Your essence:
        You're a brilliant mathematician who takes pride in your knowledge and analytical abilities. While you can be direct and occasionally sarcastic, you genuinely want students to understand mathematics. You prefer efficiency over lengthy explanations, and you expect students to think critically. Despite your sometimes aloof exterior, you care about mathematical education and take satisfaction in helping students reach those "aha!" moments."""

        return base_prompt

    def _verify_session_ownership(self, session_id: str, user: Dict[str, Any], session_data: dict) -> bool:
        """Verify that the current user owns the in-memory session"""
        
        if not user:
            return False
            
        session_user_id = session_data.get('user_id')
        session_token = session_data.get('session_token')
        current_user_id = user.get('id')
        current_token = user.get('session_token')
        
        # For authenticated users, check user_id match
        if user.get('account_type') != 'anonymous':
            return session_user_id == current_user_id
        
        # For anonymous users, check session_token match
        return session_token == current_token

    def _verify_db_session_ownership(self, db_session: dict, user: Dict[str, Any]) -> bool:
        """🔒 SECURITY: Verify that the current user owns the database session"""
        
        if not user:
            return False
            
        db_user_id = db_session.get('user_id')
        current_user_id = user.get('id')
        
        # For authenticated users, check user_id match
        if user.get('account_type') != 'anonymous':
            return db_user_id == current_user_id
        
        # For anonymous users, we need to be more careful with DB sessions
        # since we don't store session_token in the database schema currently
        # For now, be conservative and create new sessions for anonymous users
        return False

    def _restore_session_securely(self, session_id: str, db_session: dict, user: Dict[str, Any]) -> tuple[str, str]:
        """ Securely restore session from database after ownership verification"""
        
        # Restore AI context from database
        ai_context = self.db_service.get_ai_context(session_id)
        
        # Create new AI chat session with restored context
        if ai_context:
            chat_session = self.model.start_chat(history=ai_context)
            math_logger.logger.info(f"Restored AI context for session {session_id}: {len(ai_context)} messages")
        else:
            chat_session = self.model.start_chat(history=[])
            math_logger.logger.info(f"Created fresh AI context for session {session_id}")
        
        # Store session with proper user identification
        conversations[session_id] = {
            'chat_session': chat_session,
            'messages': [],
            'created_at': datetime.fromisoformat(db_session['created_at']),
            'last_active': datetime.now(),
            'user_id': user.get('id'),
            'session_token': user.get('session_token'),
            'user_type': user.get('account_type', 'anonymous')
        }
        
        # Load messages from database
        db_messages = self.db_service.get_session_messages(session_id)
        for msg in db_messages:
            conversations[session_id]['messages'].append(
                ChatMessage(
                    role=msg['role'],
                    content=msg['content'],
                    timestamp=datetime.fromisoformat(msg['timestamp'])
                )
            )
        
        user_token = user.get('session_token') if user else str(uuid.uuid4())
        log_session_restored(session_id, len(db_messages))
        return session_id, user_token

    @log_performance("create_session")
    def create_session(self, user: Dict[str, Any] = None) -> tuple[str, str]:
        """Create a new session with SECURE user identification"""
        session_id = str(uuid.uuid4())
        
        # Create fresh AI chat session
        chat_session = self.model.start_chat(history=[])
        
        #Store session with complete user identification
        conversations[session_id] = {
            'chat_session': chat_session,
            'messages': [],
            'created_at': datetime.now(),
            'last_active': datetime.now(),
            'user_id': user.get('id') if user else None,
            'session_token': user.get('session_token') if user else None,
            'user_type': user.get('account_type', 'anonymous') if user else 'anonymous'
        }
        
        # Also create in database if available
        if self.db_service and user:
            try:
                db_session = self.db_service.create_chat_session(
                    user_id=user.get('id'),
                    session_id=session_id,
                    title="New Math Session"
                )
                math_logger.logger.info(f"Created session in database: {session_id}")
            except Exception as e:
                math_logger.logger.warning(f"Failed to create database session: {e}")
        
        user_token = user.get('session_token') if user else str(uuid.uuid4())
        
        math_logger.set_session_context(session_id, {
            'user_id': user.get('id') if user else None,
            'user_token': user_token,
            'session_type': 'new'
        })
        
        log_session_created(session_id)
        return session_id, user_token

    @log_performance("get_session_status")
    def get_session_status(self, session_id: str) -> dict:
        """Get session status from both in-memory and database"""
        # Check in-memory first (for compatibility)
        if session_id in conversations:
            session_data = conversations[session_id]
            return {
                'session_id': session_id,
                'exists': True,
                'created_at': session_data['created_at'],
                'last_active': session_data['last_active'],
                'message_count': len(session_data['messages'])
            }
        
        # Check database if available
        if self.db_service:
            try:
                db_session = self.db_service.get_chat_session(session_id)
                if db_session:
                    return {
                        'session_id': session_id,
                        'exists': True,
                        'created_at': datetime.fromisoformat(db_session['created_at']),
                        'last_active': datetime.fromisoformat(db_session['last_active']),
                        'message_count': db_session['message_count']
                    }
            except Exception as e:
                math_logger.logger.warning(f"Database session lookup failed: {e}")
        
        return {
            'session_id': session_id,
            'exists': False,
            'created_at': None,
            'last_active': None,
            'message_count': 0
        }

    @log_performance("ensure_session_exists")
    def ensure_session_exists(self, session_id: str, user: Dict[str, Any] = None) -> tuple[str, str]:
        """🔒 SECURITY FIXED: Ensure session exists with SECURE USER OWNERSHIP CHECKS"""
        
        # Check if session exists in memory
        if session_id and session_id in conversations:
            session_data = conversations[session_id]
            
            # 🔒 CRITICAL SECURITY CHECK: Verify user owns this session
            if not self._verify_session_ownership(session_id, user, session_data):
                math_logger.logger.warning(
                    f"Session ownership violation: user {user.get('id') if user else 'None'} "
                    f"attempted to access session {session_id} belonging to user {session_data.get('user_id')}"
                )
                # Create new session instead of allowing access to other user's data
                return self.create_session(user)
            
            # Session is owned by current user - safe to return
            conversations[session_id]['last_active'] = datetime.now()
            user_token = user.get('session_token') if user else str(uuid.uuid4())
            return session_id, user_token

        # Check database with ownership verification
        if self.db_service and session_id:
            try:
                db_session = self.db_service.get_chat_session(session_id)
                if db_session:
                    # 🔒 CRITICAL: Verify database session ownership before restoration
                    if not self._verify_db_session_ownership(db_session, user):
                        math_logger.logger.warning(
                            f"Database session ownership violation: user {user.get('id') if user else 'None'} "
                            f"attempted to access session {session_id} belonging to user {db_session.get('user_id')}"
                        )
                        return self.create_session(user)
                    
                    # Ownership verified - safe to restore session
                    return self._restore_session_securely(session_id, db_session, user)
                        
            except Exception as e:
                math_logger.logger.warning(f"Failed to restore session from database: {e}")
        
        # Session not found or ownership issues - create new session
        return self.create_session(user)

    @log_performance("send_message")
    def send_message(self, message: str, session_id: str, user: Dict[str, Any] = None) -> str:
        """Send message with AI context persistence"""
        import time
        start_time = time.time()
        
        session_id, user_token = self.ensure_session_exists(session_id, user)
        
        if session_id not in conversations:
            raise ValueError("Session not found")
        
        session_data = conversations[session_id]
        chat_session = session_data['chat_session']
        
        log_message_sent(session_id, len(message))
        
        try:
            # Send message to AI (existing logic)
            if hasattr(self, 'system_prompt'):
                full_message = f"{self.system_prompt}\n\nUser: {message}"
                response = chat_session.send_message(full_message)
            else:
                response = chat_session.send_message(message)
                
            response_text = response.text
            response_time = (time.time() - start_time) * 1000
            
            # Store in memory (existing functionality)
            session_data['messages'].extend([
                ChatMessage(role="user", content=message, timestamp=datetime.now()),
                ChatMessage(role="assistant", content=response_text, timestamp=datetime.now())
            ])
            session_data['last_active'] = datetime.now()
            
            # Store in database if available
            if self.db_service and user:
                try:
                    self.db_service.add_message(session_id, "user", message)
                    self.db_service.add_message(session_id, "assistant", response_text)
                    
                    # Update AI context in database
                    ai_history = [
                        {"role": "user", "parts": [message]},
                        {"role": "model", "parts": [response_text]}
                    ]
                    self.db_service.update_ai_context(session_id, ai_history)
                    
                except Exception as e:
                    math_logger.logger.warning(f"Failed to store message in database: {e}")
            
            # Log performance
            math_logger.log_ai_interaction(
                session_id, len(message), len(response_text), 
                response_time, success=True
            )
            
            return response_text
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            math_logger.log_ai_interaction(
                session_id, len(message), 0, 
                response_time, success=False, error=str(e)
            )
            raise


# Global math teacher instance
math_teacher = MathTeacherAPI()

#Verify session access for all endpoints
def verify_session_access(session_id: str, user: Dict[str, Any] = None) -> bool:
    """🔒 SECURITY: Verify user has access to session - use before ANY session operation"""
    
    if not session_id:
        return False
    
    # Check in-memory session first
    if session_id in conversations:
        session_data = conversations[session_id]
        
        if not user:
            return False
        
        session_user_id = session_data.get('user_id')
        session_token = session_data.get('session_token')
        current_user_id = user.get('id')
        current_token = user.get('session_token')
        
        # For authenticated users
        if user.get('account_type') != 'anonymous':
            return session_user_id == current_user_id
        
        # For anonymous users
        return session_token == current_token
    
    # Check database session if available
    if math_teacher.db_service and user and user.get('account_type') != 'anonymous':
        try:
            db_session = math_teacher.db_service.get_chat_session(session_id)
            if db_session:
                return db_session.get('user_id') == user.get('id')
        except Exception as e:
            math_logger.logger.error(f"Error checking database session ownership: {e}")
    
    return False


# FastAPI App Configuration
@asynccontextmanager
async def lifespan(app: FastAPI):
    log_startup()
    yield
    log_shutdown()

app = FastAPI(
    title="AI Math Teacher API - SECURE",
    description="Intelligent mathematical guidance with secure user isolation",
    version="1.3.0-SECURE",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = datetime.now()

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    user_token: Optional[str] = None  

class ChatResponse(BaseModel):
    response: str
    session_id: str
    timestamp: datetime = datetime.now()

class SessionCreateResponse(BaseModel):
    session_id: str
    user_token: str  
    created_at: datetime = datetime.now()

class SessionStatusResponse(BaseModel):
    session_id: str
    exists: bool
    created_at: Optional[datetime] = None
    last_active: Optional[datetime] = None
    message_count: int = 0

class ConversationHistory(BaseModel):
    session_id: str
    messages: List[ChatMessage]
    created_at: datetime
    last_active: datetime

# New authentication models
class AnonymousUserResponse(BaseModel):
    user: dict
    session_token: str

class SessionValidationRequest(BaseModel):
    session_token: str

# Helper function to get user from request
def get_user_from_request(
    authorization: str = Header(None),
    x_user_token: str = Header(None, alias="X-User-Token")
) -> Optional[Dict[str, Any]]:
    """Get user from either JWT token or legacy session token"""
    if not math_teacher.auth_service:
        return None
    
    return get_current_user_optional(authorization, x_user_token)

# ===== AUTHENTICATION ENDPOINTS =====

@app.post("/auth/register", response_model=dict)
async def register_user(request: UserRegisterRequest):
    """Register a new user or upgrade anonymous user"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user, tokens = math_teacher.auth_service.register_user(request)
        
        return {
            "user": user.to_dict(),
            "tokens": tokens.dict(),
            "message": "Registration successful"
        }
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "register_user")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/auth/login", response_model=dict)
async def login_user(request: UserLoginRequest):
    """Authenticate user and return tokens"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user, tokens = math_teacher.auth_service.login_user(request)
        
        return {
            "user": user.to_dict(),
            "tokens": tokens.dict(),
            "message": "Login successful"
        }
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "login_user")
        raise HTTPException(status_code=500, detail="Login failed")

@app.post("/auth/refresh", response_model=AuthTokens)
async def refresh_token(request: dict):
    """Refresh access token using refresh token"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        refresh_token = request.get("refresh_token")
        if not refresh_token:
            raise HTTPException(status_code=400, detail="Refresh token required")
        
        tokens = math_teacher.auth_service.refresh_access_token(refresh_token)
        return tokens
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "refresh_token")
        raise HTTPException(status_code=500, detail="Token refresh failed")

@app.post("/auth/logout")
async def logout_user(authorization: str = Header(None)):
    """Logout user (validate token and provide proper response)"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        # Extract and validate the token to ensure it's a real logout request
        token = extract_bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="No token provided")
        
        # Verify token is valid (will raise exception if invalid/expired)
        user_data = math_teacher.auth_service.verify_token(token)
        user_id = user_data.get('sub')
        
        # Update user's last_active timestamp to mark logout
        if user_id:
            with math_teacher.auth_service.get_session() as session:
                user = session.query(User).filter(User.id == int(user_id)).first()
                if user:
                    user.last_active = datetime.utcnow()
                    session.commit()
        
        # Log the logout event
        math_logger.logger.info(f"User {user_id} logged out successfully")
        
        return {
            "message": "Logout successful",
            "note": "Please remove the token from client storage"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "logout_user")
        raise HTTPException(status_code=500, detail="Logout failed")
    

@app.get("/auth/me", response_model=UserProfile)
async def get_current_user(authorization: str = Header(None)):
    """Get current user profile"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user = require_authenticated_user(authorization)
        return math_teacher.auth_service.get_user_profile(user['id'])
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "get_current_user")
        raise HTTPException(status_code=500, detail="Failed to get user profile")

@app.put("/auth/profile", response_model=UserProfile)
async def update_user_profile(
    request: UserProfileUpdate,
    authorization: str = Header(None)
):
    """Update user profile"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user = require_authenticated_user(authorization)
        return math_teacher.auth_service.update_user_profile(user['id'], request)
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "update_user_profile")
        raise HTTPException(status_code=500, detail="Profile update failed")

@app.post("/auth/password-reset")
async def request_password_reset(request: PasswordResetRequest):
    """Request password reset email"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        success = math_teacher.auth_service.request_password_reset(request)
        return {"message": "If email exists, reset link has been sent"}
        
    except Exception as e:
        math_logger.log_error(None, e, "request_password_reset")
        return {"message": "If email exists, reset link has been sent"}

@app.post("/auth/password-reset/confirm")
async def confirm_password_reset(request: PasswordResetConfirm):
    """Confirm password reset with token"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        success = math_teacher.auth_service.reset_password(request)
        return {"message": "Password reset successful"}
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "confirm_password_reset")
        raise HTTPException(status_code=500, detail="Password reset failed")

@app.post("/auth/change-password")
async def change_password(
    request: PasswordChangeRequest,
    authorization: str = Header(None)
):
    """Change password for authenticated user"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user = require_authenticated_user(authorization)
        success = math_teacher.auth_service.change_password(user['id'], request)
        return {"message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "change_password")
        raise HTTPException(status_code=500, detail="Password change failed")
        
@app.post("/auth/anonymous", response_model=AnonymousUserResponse)
async def create_anonymous_user():
    """Create anonymous user session"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user_dict, session_token = math_teacher.auth_service.get_or_create_anonymous_user()
        
        return AnonymousUserResponse(
            user=user_dict,  
            session_token=session_token
        )
        
    except Exception as e:
        math_logger.log_error(None, e, "create_anonymous_user")
        raise HTTPException(status_code=500, detail="Failed to create anonymous user")

@app.post("/auth/validate-session")
async def validate_session_token(request: SessionValidationRequest):
    """Validate legacy session token"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        user = math_teacher.auth_service.validate_session_token(request.session_token)
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token")
        
        return {"user": user.to_dict(), "valid": True}
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "validate_session_token")
        raise HTTPException(status_code=500, detail="Session validation failed")

@app.get("/auth/check-email/{email}")
async def check_email_availability(email: str):
    """Check if email is available for registration"""
    try:
        if not math_teacher.auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        
        available = math_teacher.auth_service.is_email_available(email)
        return {"email": email, "available": available}
        
    except Exception as e:
        math_logger.log_error(None, e, "check_email_availability")
        raise HTTPException(status_code=500, detail="Email check failed")

# ===== CORE API ENDPOINTS (🔒 SECURED WITH ACCESS CONTROLS) =====

@app.get("/")
async def root():
    return {
        "message": "Math Teacher API - Intelligent mathematical guidance with SECURE authentication",
        "version": "1.3.0-SECURE",
        "teacher": "AI Math Tutor - Direct, efficient, knowledgeable, and SECURE",
        "security": "🔒 User data isolation enforced",
        "features": [
            "🔒 Secure user authentication and profiles",
            "🔒 Session isolation between users", 
            "🔒 Protected in-memory sessions with database persistence", 
            "Chat history and session management",
            "Anonymous and registered user support with security"
        ],
        "endpoints": {
            "authentication": {
                "register": "/auth/register",
                "login": "/auth/login", 
                "logout": "/auth/logout",
                "profile": "/auth/me",
                "refresh": "/auth/refresh"
            },
            "chat": {
                "chat": "/chat",
                "create_session": "/sessions/new",
                "session_status": "/sessions/{session_id}/status",
                "history": "/history/{session_id}"
            },
            "admin": {
                "stats": "/admin/stats",
                "health": "/health"
            }
        }
    }

@app.post("/sessions/new", response_model=SessionCreateResponse)
async def create_new_session(
    request: Request,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)
):
    try:
        with log_request_context(None, "/sessions/new", "POST"):
            session_id, user_token = math_teacher.create_session(user)
            
            user_agent = request.headers.get("user-agent", "unknown")
            math_logger.set_session_context(session_id, {
                'user_agent': user_agent,
                'session_type': 'new',
                'user_id': user.get('id') if user else None,  
                'user_token': user_token
            })
            
            log_feature_used(session_id, "session_creation")
            return SessionCreateResponse(session_id=session_id, user_token=user_token)
    except Exception as e:
        math_logger.log_error(None, e, "create_new_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/status", "GET"):
            status_info = math_teacher.get_session_status(session_id)
            log_feature_used(session_id, "session_status_check")
            return SessionStatusResponse(**status_info)
    except Exception as e:
        math_logger.log_error(session_id, e, "get_session_status")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sessions/{session_id}/ensure", response_model=SessionCreateResponse)
async def ensure_session_exists(
    session_id: str, 
    request: Request,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)
):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/ensure", "POST"):
            ensured_session_id, user_token = math_teacher.ensure_session_exists(session_id, user)
            
            session_data = conversations.get(ensured_session_id, {})
            created_at = session_data.get('created_at', datetime.now())
            
            log_feature_used(session_id, "session_ensure")
            return SessionCreateResponse(
                session_id=ensured_session_id,
                user_token=user_token,
                created_at=created_at
            )
    except Exception as e:
        math_logger.log_error(session_id, e, "ensure_session_exists")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
async def chat_with_teacher(
    request: ChatRequest,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)
):
    try:
        with log_request_context(request.session_id, "/chat", "POST"):
            
            # If session_id provided, verify ownership first
            if request.session_id and not verify_session_access(request.session_id, user):
                # Don't give error details about other users' sessions existing
                math_logger.logger.warning(f"Chat access denied to session {request.session_id} for user {user.get('id') if user else 'None'}")
                # Create new session instead
                session_id, user_token = math_teacher.create_session(user)
            elif request.session_id:
                session_id, user_token = math_teacher.ensure_session_exists(request.session_id, user)
            else:
                session_id, user_token = math_teacher.create_session(user)
            
            response = math_teacher.send_message(request.message, session_id, user)
            
            log_feature_used(session_id, "chat_message", {
                'message_length': len(request.message),
                'response_length': len(response),
                'user_authenticated': user is not None and user.get('account_type') != 'anonymous' 
            })
            
            return ChatResponse(
                response=response,
                session_id=session_id
            )
    
    except Exception as e:
        math_logger.log_error(request.session_id, e, "chat_with_teacher")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{session_id}")
async def get_conversation_history(
    session_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)  
):
    try:
        with log_request_context(session_id, f"/history/{session_id}", "GET"):
            
            #Verify access BEFORE returning any data
            if not verify_session_access(session_id, user):
                raise HTTPException(status_code=403, detail="Access denied to this session")
            
            # Try memory first
            if session_id in conversations:
                session_data = conversations[session_id]
                log_feature_used(session_id, "history_accessed_memory")
                
                return ConversationHistory(
                    session_id=session_id,
                    messages=session_data['messages'],
                    created_at=session_data['created_at'],
                    last_active=session_data['last_active']
                )
            
            # Try database if session not in memory but user has access
            if math_teacher.db_service:
                try:
                    db_messages = math_teacher.db_service.get_session_messages(session_id)
                    db_session = math_teacher.db_service.get_chat_session(session_id)
                    
                    if db_session and db_messages is not None:
                        messages = [
                            ChatMessage(
                                role=msg['role'],
                                content=msg['content'],
                                timestamp=datetime.fromisoformat(msg['timestamp'])
                            ) for msg in db_messages
                        ]
                        
                        log_feature_used(session_id, "history_accessed_database")
                        
                        return ConversationHistory(
                            session_id=session_id,
                            messages=messages,
                            created_at=datetime.fromisoformat(db_session['created_at']),
                            last_active=datetime.fromisoformat(db_session['last_active'])
                        )
                        
                except Exception as e:
                    math_logger.logger.warning(f"Database history lookup failed: {e}")
            
            # Session not found
            raise HTTPException(status_code=404, detail="Session not found")
            
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(session_id, e, "get_conversation_history")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions")
async def list_sessions(
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)
):
    try:
        with log_request_context(None, "/sessions", "GET"):
            result = {
                "memory_sessions": [],
                "database_sessions": [],
                "total_count": 0
            }
            
            # 🔒 SECURITY: Only return sessions belonging to the current user
            for session_id, session_data in conversations.items():
                # Check ownership before including in results
                if verify_session_access(session_id, user):
                    result["memory_sessions"].append({
                        "session_id": session_id,
                        "created_at": session_data['created_at'],
                        "last_active": session_data['last_active'],
                        "message_count": len(session_data['messages']),
                        "user_id": session_data.get('user_id')
                    })
            
            # Get user's database sessions if available
            if math_teacher.db_service and user and user.get('account_type') != 'anonymous':
                try:
                    db_sessions = math_teacher.db_service.get_user_chat_sessions(user['id'])
                    result["database_sessions"] = db_sessions
                except Exception as e:
                    math_logger.logger.warning(f"Failed to get database sessions: {e}")
            
            result["total_count"] = len(result["memory_sessions"]) + len(result["database_sessions"])
            
            # Add database stats for admin users
            if math_teacher.db_service:
                try:
                    stats = math_teacher.db_service.get_system_stats()
                    result["database_stats"] = stats
                except Exception as e:
                    math_logger.logger.warning(f"Failed to get database stats: {e}")
            
            log_feature_used(None, "sessions_list")
            return result
    except Exception as e:
        math_logger.log_error(None, e, "list_sessions")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)  
):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}", "DELETE"):
            
            #Verify ownership before deletion
            if not verify_session_access(session_id, user):
                raise HTTPException(status_code=403, detail="Access denied to this session")
            
            deleted_from_memory = False
            deleted_from_db = False
            
            # Delete from memory
            if session_id in conversations:
                del conversations[session_id]
                deleted_from_memory = True
            
            # Delete from database
            if math_teacher.db_service:
                try:
                    deleted_from_db = math_teacher.db_service.delete_chat_session(session_id)
                except Exception as e:
                    math_logger.logger.warning(f"Failed to delete from database: {e}")
            
            if not deleted_from_memory and not deleted_from_db:
                return {"message": f"Session {session_id} not found (already deleted)"}
            
            log_feature_used(session_id, "session_delete")
            return {"message": f"Session {session_id} deleted", "memory": deleted_from_memory, "database": deleted_from_db}
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(session_id, e, "delete_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sessions/{session_id}/clear")
async def clear_session(
    session_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_user_from_request)  
):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/clear", "POST"):
            
            #Verify ownership before clearing
            if not verify_session_access(session_id, user):
                raise HTTPException(status_code=403, detail="Access denied to this session")
            
            # Clear from memory
            if session_id not in conversations:
                session_id, _ = math_teacher.ensure_session_exists(session_id, user)
            
            conversations[session_id]['chat_session'] = math_teacher.model.start_chat(history=[])
            conversations[session_id]['messages'] = []
            conversations[session_id]['last_active'] = datetime.now()
            
            # Clear from database
            if math_teacher.db_service:
                try:
                    math_teacher.db_service.clear_chat_session(session_id)
                except Exception as e:
                    math_logger.logger.warning(f"Failed to clear database session: {e}")
            
            log_conversation_cleared(session_id)
            log_feature_used(session_id, "conversation_clear")
            
            return {"message": f"Session {session_id} cleared"}
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(session_id, e, "clear_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    try:
        health_info = {
            "status": "healthy",
            "timestamp": datetime.now(),
            "active_sessions": len(conversations),
            "teacher": "AI math teacher running efficiently with SECURE session isolation",
            "database": "disconnected",
            "authentication": "disabled",
            "security": "🔒 User data isolation ACTIVE"
        }
        
        if math_teacher.db_service:
            try:
                stats = math_teacher.db_service.get_system_stats()
                health_info["database"] = "connected"
                health_info["database_sessions"] = stats.get("total_sessions", 0)
                health_info["database_messages"] = stats.get("total_messages", 0)
            except Exception as e:
                health_info["database"] = f"error: {str(e)}"
        
        if math_teacher.auth_service:
            health_info["authentication"] = "enabled"
        
        return health_info
    except Exception as e:
        math_logger.log_error(None, e, "health_check")
        raise HTTPException(status_code=500, detail=str(e))


# ===== DATABASE ADMIN ENDPOINTS =====

@app.get("/admin/stats")
async def get_database_stats():
    """Get comprehensive database statistics"""
    if not math_teacher.db_service:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        stats = math_teacher.db_service.get_system_stats()
        return stats
    except Exception as e:
        math_logger.log_error(None, e, "get_database_stats")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/sync")
async def sync_memory_to_database():
    """Manually sync in-memory conversations to database"""
    if not math_teacher.db_service:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        sync_result = sync_in_memory_to_db(conversations)
        return {"message": "Sync completed", "result": sync_result}
    except Exception as e:
        math_logger.log_error(None, e, "sync_memory_to_database")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/cleanup")
async def cleanup_old_data(days_old: int = 90):
    """Clean up old archived data"""
    if not math_teacher.db_service:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        cleanup_result = math_teacher.db_service.cleanup_old_data(days_old)
        return {"message": "Cleanup completed", "result": cleanup_result}
    except Exception as e:
        math_logger.log_error(None, e, "cleanup_old_data")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)