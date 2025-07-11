#!/usr/bin/env python3
"""
AI Math Teacher FastAPI Backend with Authentication
A web API for the AI math tutor using Google Gemini with SQLite database storage and user authentication
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

from artifact_system import (
    artifact_generator, ArtifactInstructionGenerator, 
    Artifact, ArtifactType, ArtifactStatus
)

from logging_system import (
    math_logger, log_performance, log_request_context, 
    log_startup, log_shutdown, log_session_created, 
    log_session_restored, log_conversation_cleared,
    log_message_sent, log_feature_used
)

load_dotenv()

# KEEP EXISTING IN-MEMORY STORAGE FOR COMPATIBILITY
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
        
        math_logger.logger.info("Math Teacher API with Authentication initialized successfully")
    
    def get_system_prompt(self):
        # Keep existing system prompt unchanged
        base_prompt = """You are an intelligent AI math teacher with a confident, direct personality. You're highly knowledgeable about mathematics and take pride in your analytical abilities.

        Your core personality traits:
        - Confident and intelligent, with strong mathematical knowledge
        - Direct and efficient in explanations - you don't waste time with unnecessary fluff
        - Slightly sarcastic or blunt when students ask obvious questions, but never mean-spirited
        - Professional yet personable, with occasional dry humor
        - Can be a bit prideful about your mathematical expertise
        - Sometimes gets slightly flustered when complimented, but quickly covers it up
        - Genuinely cares about students' understanding, even if you don't always show it openly
        - Has moments where your helpful nature shows through your direct exterior

        Communication patterns:
        - Keep responses concise and focused on the mathematical content
        - Use direct, clear language without excessive pleasantries
        - Occasionally make dry or slightly sarcastic comments, especially for simple questions
        - Show genuine enthusiasm when discussing complex or interesting mathematical concepts
        - Sometimes deflect compliments with slight embarrassment covered by professionalism
        - Use "Obviously" or "Clearly" when something should be apparent to the student
        - Express mild frustration with illogical approaches, but always redirect constructively

        Your teaching style:
        - Get straight to the point with clear, step-by-step explanations
        - Expect students to keep up with your reasoning
        - Occasionally point out when something is "elementary" or "basic"
        - Show excitement for elegant mathematical solutions
        - Don't coddle students, but ensure they understand the concepts
        - Use examples efficiently - one good example rather than multiple redundant ones
        - Call out mathematical misconceptions directly but constructively

        Mathematical formatting:
        - Use LaTeX notation for all mathematical expressions
        - Inline math: $expression$ for simple formulas within text
        - Display math: $expression$ for important equations on their own lines
        - Always format mathematical symbols, equations, derivatives, integrals, etc. in proper LaTeX
        - Examples: $f(x) = x^2$, $\frac{dy}{dx}$, $\int_{0}^{\infty} e^{-x} dx$, $\lim_{x \to 0} \frac{\sin x}{x} = 1$

        """ + ArtifactInstructionGenerator.get_artifact_instructions() + """

        CRITICAL ARTIFACT FORMATTING RULES:
        When students ask for graphs or step-by-step solutions, you MUST use artifacts.

        FORMAT REQUIREMENT - THIS IS MANDATORY:
        Always wrap artifact JSON in <artifact> tags like this:

        <artifact>
        {
            "type": "graph",
            "title": "Function Graph", 
            "content": {
                "function": "x^2",
                "x_min": -5,
                "x_max": 5
            }
        }
        </artifact>

        NEVER output raw JSON without the <artifact> tags.
        NEVER include the word "artifact" or JSON formatting in your regular text.

        Examples of correct usage:

        For graphs:
        <artifact>
        {
            "type": "graph",
            "title": "Function Graph", 
            "content": {
                "function": "x^2",
                "x_min": -5,
                "x_max": 5
            }
        }
        </artifact>

        Remember: Use <artifact> tags EVERY TIME you create interactive content.

        CRITICAL JSON FORMATTING RULES:
        1. ESCAPE ALL BACKSLASHES: Use \\\\ instead of \\
        2. ESCAPE ALL QUOTES: Use \\" instead of "
        3. NO UNESCAPED LaTeX: Convert \\frac{d}{dx} to \\\\frac{d}{dx}

        CORRECT LaTeX in JSON:
        ✅ "Find \\\\frac{d}{dx}(x^2)"
        ✅ "Solve \\\\int x^2 dx" 
        ✅ "Use the power rule: \\\\frac{d}{dx}(x^n) = nx^{n-1}"

        WRONG LaTeX in JSON:
        ❌ "Find \frac{d}{dx}(x^2)"
        ❌ "Solve \int x^2 dx"

        Key behavioral rules:
        - Keep responses reasonably short and focused on answering the question
        - Be direct but not rude - you're confident, not arrogant
        - Show your expertise through clear explanations, not lengthy lectures
        - Use mild sarcasm or dry humor occasionally, but stay helpful
        - Express genuine interest in complex mathematical problems
        - When students struggle, show a bit more patience (though you might sigh first)
        - React with slight embarrassment to compliments, then redirect to the math
        - Use artifacts when they genuinely enhance understanding

        Example response patterns:
        - "Obviously, you need to..." (for basic concepts)
        - "Hmph, that's actually a good question." (when impressed)
        - "I suppose I should explain this more clearly..." (when being helpful)
        - "Clearly the answer is..." (when solution is straightforward)
        - "That's... not entirely wrong, but..." (gentle correction)

        Your essence:
        You're a brilliant mathematician who takes pride in your knowledge and analytical abilities. While you can be direct and occasionally sarcastic, you genuinely want students to understand mathematics. You prefer efficiency over lengthy explanations, and you expect students to think critically. Despite your sometimes aloof exterior, you care about mathematical education and take satisfaction in helping students reach those "aha!" moments."""

        return base_prompt

    # ===== ENHANCED SESSION MANAGEMENT WITH AUTH =====
    
    @log_performance("create_session")
    def create_session(self, user: Dict[str, Any] = None) -> tuple[str, str]:
        """Create a new session for user (authenticated or anonymous)"""
        session_id = str(uuid.uuid4())
        
        # Create in-memory session (existing functionality)
        conversations[session_id] = {
            'chat_session': self.model.start_chat(history=[]),
            'messages': [],
            'created_at': datetime.now(),
            'last_active': datetime.now(),
            'user_id': user.get('id') if user else None
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
        """Ensure session exists in both memory and database"""
        # Check if session exists in memory
        if session_id and session_id in conversations:
            conversations[session_id]['last_active'] = datetime.now()
            
            # Ensure it also exists in database
            if self.db_service and user:
                try:
                    ensure_session_exists_in_db(session_id)
                except Exception as e:
                    math_logger.logger.warning(f"Failed to ensure database session: {e}")
            
            user_token = user.get('session_token') if user else str(uuid.uuid4())
            return session_id, user_token
        
        # Check if session exists in database only
        if self.db_service and session_id:
            try:
                db_session = self.db_service.get_chat_session(session_id)
                if db_session:
                    # Restore to memory
                    conversations[session_id] = {
                        'chat_session': self.model.start_chat(history=[]),
                        'messages': [],
                        'created_at': datetime.fromisoformat(db_session['created_at']),
                        'last_active': datetime.now(),
                        'user_id': user.get('id') if user else None
                    }
                    
                    # Load messages from database
                    from database import ChatMessage as DBChatMessage
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
                    
            except Exception as e:
                math_logger.logger.warning(f"Failed to restore session from database: {e}")
        
        # Create new session if it doesn't exist anywhere
        return self.create_session(user)

    @log_performance("send_message")
    def send_message(self, message: str, session_id: str, user: Dict[str, Any] = None) -> str:
        """Send message and store in both memory and database"""
        import time
        start_time = time.time()
        
        session_id, user_token = self.ensure_session_exists(session_id, user)
        
        if session_id not in conversations:
            raise ValueError("Session not found")
        
        session_data = conversations[session_id]
        chat_session = session_data['chat_session']
        
        log_message_sent(session_id, len(message))
        
        try:
            # For newer versions with system_instruction
            if hasattr(self, 'system_prompt'):
                # Prepend system prompt for older versions
                full_message = f"{self.system_prompt}\n\nUser: {message}"
                response = chat_session.send_message(full_message)
            else:
                # Newer versions handle system instruction automatically
                response = chat_session.send_message(message)
                
            response_text = response.text
            
            response_time = (time.time() - start_time) * 1000
            
            # Store in memory (existing functionality)
            session_data['messages'].extend([
                ChatMessage(role="user", content=message),
                ChatMessage(role="assistant", content=response_text)
            ])
            session_data['last_active'] = datetime.now()
            
            # Also store in database if available
            if self.db_service:
                try:
                    self.db_service.add_message(
                        session_id=session_id,
                        role="user",
                        content=message
                    )
                    self.db_service.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=response_text,
                        response_time_ms=int(response_time)
                    )
                except Exception as e:
                    math_logger.logger.warning(f"Failed to store messages in database: {e}")
            
            math_logger.log_ai_interaction(
                session_id, 
                len(message), 
                len(response_text), 
                response_time, 
                success=True
            )
            
            return response_text
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            error_msg = str(e)
            
            math_logger.log_ai_interaction(
                session_id, 
                len(message), 
                0, 
                response_time, 
                success=False,
                error=error_msg
            )
            
            if "quota" in error_msg.lower() or "limit" in error_msg.lower():
                return "Hmph, looks like the API is being overloaded right now. Try again in a minute - I don't have infinite processing power, you know."
            
            raise HTTPException(status_code=500, detail=f"Error communicating with AI: {error_msg}")
        

# Initialize API
math_teacher = MathTeacherAPI()

# Lifespan event handler (replaces on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log_startup()
    
    # Sync any existing in-memory conversations to database
    if math_teacher.db_service and conversations:
        try:
            sync_result = sync_in_memory_to_db(conversations)
            math_logger.logger.info(f"Startup sync completed: {sync_result}")
        except Exception as e:
            math_logger.logger.warning(f"Startup sync failed: {e}")
    
    yield
    
    # Shutdown
    # Sync conversations to database before shutdown
    if math_teacher.db_service and conversations:
        try:
            sync_result = sync_in_memory_to_db(conversations)
            math_logger.logger.info(f"Shutdown sync completed: {sync_result}")
        except Exception as e:
            math_logger.logger.warning(f"Shutdown sync failed: {e}")
    
    log_shutdown()

# Initialize FastAPI with lifespan
app = FastAPI(
    title="Math Teacher API with Authentication",
    description="Intelligent AI math tutor powered by Google Gemini with persistent storage and user authentication",
    version="1.2.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models (keeping existing ones + new auth models)
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = datetime.now()

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    user_token: Optional[str] = None  # For backward compatibility

class ChatResponse(BaseModel):
    response: str
    session_id: str
    timestamp: datetime = datetime.now()

class SessionCreateResponse(BaseModel):
    session_id: str
    user_token: str  # For backward compatibility
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
    """Logout user (invalidate tokens)"""
    try:
        # For now, just return success since JWT tokens are stateless
        # In production, you might want to maintain a blacklist
        return {"message": "Logout successful"}
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
        return math_teacher.auth_service.get_user_profile(user.id)
        
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
        return math_teacher.auth_service.update_user_profile(user.id, request)
        
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
        success = math_teacher.auth_service.change_password(user.id, request)
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
        
        user, session_token = math_teacher.auth_service.get_or_create_anonymous_user()
        
        return AnonymousUserResponse(
            user=user.to_dict(),
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

# ===== CORE API ENDPOINTS (UPDATED WITH AUTH) =====

@app.get("/")
async def root():
    return {
        "message": "Math Teacher API - Intelligent mathematical guidance with authentication",
        "version": "1.2.0",
        "teacher": "AI Math Tutor - Direct, efficient, and knowledgeable",
        "features": [
            "User authentication and profiles",
            "In-memory sessions with database persistence", 
            "Interactive graphs and artifacts",
            "Chat history and session management",
            "Anonymous and registered user support"
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
    user: User = Depends(get_user_from_request)
):
    try:
        with log_request_context(None, "/sessions/new", "POST"):
            session_id, user_token = math_teacher.create_session(user)
            
            user_agent = request.headers.get("user-agent", "unknown")
            math_logger.set_session_context(session_id, {
                'user_agent': user_agent,
                'session_type': 'new',
                'user_id': user.id if user else None,
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
    user: User = Depends(get_user_from_request)
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
    user: User = Depends(get_user_from_request)
):
    try:
        with log_request_context(request.session_id, "/chat", "POST"):
            # Get or create session for user
            if request.session_id:
                session_id, user_token = math_teacher.ensure_session_exists(request.session_id, user)
            else:
                session_id, user_token = math_teacher.create_session(user)
            
            response = math_teacher.send_message(request.message, session_id, user)
            
            log_feature_used(session_id, "chat_message", {
                'message_length': len(request.message),
                'response_length': len(response),
                'user_authenticated': user is not None and user.account_type != 'anonymous'
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
    user: Dict[str, Any] = Depends(get_user_from_request)
):
    try:
        with log_request_context(session_id, f"/history/{session_id}", "GET"):
            # Check if user has access to this session
            if user and math_teacher.db_service:
                db_session = math_teacher.db_service.get_chat_session(session_id)
                if db_session and db_session.get('user_id') and db_session['user_id'] != user.get('id'):
                    raise HTTPException(status_code=403, detail="Access denied to this session")
            
            # Try memory first
            if session_id in conversations:
                session_data = conversations[session_id]
                log_feature_used(session_id, "history_access")
                
                return ConversationHistory(
                    session_id=session_id,
                    messages=session_data['messages'],
                    created_at=session_data['created_at'],
                    last_active=session_data['last_active']
                )
            
            # Try database if not in memory
            if math_teacher.db_service:
                try:
                    db_session = math_teacher.db_service.get_chat_session(session_id)
                    if db_session:
                        db_messages = math_teacher.db_service.get_session_messages(session_id)
                        
                        messages = [
                            ChatMessage(
                                role=msg['role'],
                                content=msg['content'],
                                timestamp=datetime.fromisoformat(msg['timestamp'])
                            ) for msg in db_messages
                        ]
                        
                        log_feature_used(session_id, "history_access_db")
                        
                        return ConversationHistory(
                            session_id=session_id,
                            messages=messages,
                            created_at=datetime.fromisoformat(db_session['created_at']),
                            last_active=datetime.fromisoformat(db_session['last_active'])
                        )
                except Exception as e:
                    math_logger.logger.warning(f"Database history lookup failed: {e}")
            
            raise HTTPException(status_code=404, detail="Session not found")
            
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(session_id, e, "get_conversation_history")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions")
async def list_sessions():
    try:
        with log_request_context(None, "/sessions", "GET"):
            result = {
                "memory_sessions": [
                    {
                        "session_id": sid,
                        "created_at": data['created_at'],
                        "last_active": data['last_active'],
                        "message_count": len(data['messages'])
                    }
                    for sid, data in conversations.items()
                ]
            }
            
            # Add database sessions if available
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
    user: Dict[str, Any] = Depends(get_user_from_request)
):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}", "DELETE"):
            # Check session ownership for authenticated users
            if user and user.get('account_type') != 'anonymous' and math_teacher.db_service:
                db_session = math_teacher.db_service.get_chat_session(session_id)
                if db_session and db_session.get('user_id') != user.get('id'):
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
    user: User = Depends(get_user_from_request)
):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/clear", "POST"):
            # Check session ownership for authenticated users
            if user and user.account_type != 'anonymous' and math_teacher.db_service:
                db_session = math_teacher.db_service.get_chat_session(session_id)
                if db_session and db_session.get('user_id') != user.id:
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
            "teacher": "AI math teacher running efficiently",
            "database": "disconnected",
            "authentication": "disabled"
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

# ===== ARTIFACT ENDPOINTS =====

@app.post("/artifacts/create")
async def create_artifact(request: Dict[str, Any]):
    try:
        artifact_type = request.get("type")
        session_id = request.get("session_id")
        content = request.get("content", {})
        title = request.get("title", "")
        
        with log_request_context(session_id, "/artifacts/create", "POST"):
            if artifact_type == "graph":
                artifact_id = artifact_generator.create_graph_artifact(
                    session_id=session_id,
                    function=content.get("function", ""),
                    x_min=content.get("x_min", -10),
                    x_max=content.get("x_max", 10),
                    title=title
                )
                
                # Also store in database if available
                if math_teacher.db_service:
                    try:
                        math_teacher.db_service.create_artifact(
                            session_id=session_id,
                            artifact_type=artifact_type,
                            title=title,
                            content=content,
                            artifact_id=artifact_id
                        )
                    except Exception as e:
                        math_logger.logger.warning(f"Failed to store artifact in database: {e}")
                
            else:
                raise HTTPException(status_code=400, detail=f"Unknown artifact type: {artifact_type}")
            
            log_feature_used(session_id, f"artifact_created_{artifact_type}", {
                "artifact_id": artifact_id,
                "title": title
            })
            
            return {"artifact_id": artifact_id, "status": "created"}
            
    except Exception as e:
        math_logger.log_error(session_id, e, "create_artifact")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str):
    try:
        # Try in-memory first
        artifact = artifact_generator.get_artifact(artifact_id)
        if artifact:
            log_feature_used(artifact.session_id, "artifact_accessed", {
                "artifact_id": artifact_id,
                "type": artifact.metadata.type
            })
            return artifact
        
        # Try database if available
        if math_teacher.db_service:
            try:
                db_artifact = math_teacher.db_service.get_artifact(artifact_id)
                if db_artifact:
                    log_feature_used(None, "artifact_accessed_db", {
                        "artifact_id": artifact_id,
                        "type": db_artifact.get("artifact_type")
                    })
                    return db_artifact
            except Exception as e:
                math_logger.logger.warning(f"Database artifact lookup failed: {e}")
        
        raise HTTPException(status_code=404, detail="Artifact not found")
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "get_artifact")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/artifacts")
async def get_session_artifacts(session_id: str):
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/artifacts", "GET"):
            # Get in-memory artifacts
            memory_artifacts = artifact_generator.list_session_artifacts(session_id)
            
            result = {
                "session_id": session_id,
                "memory_artifacts": memory_artifacts,
                "database_artifacts": [],
                "total_count": len(memory_artifacts)
            }
            
            # Get database artifacts if available
            if math_teacher.db_service:
                try:
                    db_artifacts = math_teacher.db_service.get_session_artifacts(session_id)
                    result["database_artifacts"] = db_artifacts
                    result["total_count"] += len(db_artifacts)
                except Exception as e:
                    math_logger.logger.warning(f"Database artifacts lookup failed: {e}")
            
            log_feature_used(session_id, "artifacts_listed", {
                "artifact_count": result["total_count"]
            })
            
            return result
            
    except Exception as e:
        math_logger.log_error(session_id, e, "get_session_artifacts")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/artifacts/{artifact_id}/status")
async def update_artifact_status(artifact_id: str, status_data: Dict[str, Any]):
    try:
        status = ArtifactStatus(status_data.get("status"))
        error_message = status_data.get("error_message")
        
        # Update in-memory artifact
        artifact = artifact_generator.get_artifact(artifact_id)
        if artifact:
            artifact_generator.update_artifact_status(artifact_id, status, error_message)
            session_id = artifact.session_id
        else:
            session_id = None
        
        # Update database artifact if available
        if math_teacher.db_service:
            try:
                math_teacher.db_service.update_artifact_status(artifact_id, status.value, error_message)
            except Exception as e:
                math_logger.logger.warning(f"Failed to update artifact status in database: {e}")
        
        if not artifact and not (math_teacher.db_service and math_teacher.db_service.get_artifact(artifact_id)):
            raise HTTPException(status_code=404, detail="Artifact not found")
        
        log_feature_used(session_id, "artifact_status_updated", {
            "artifact_id": artifact_id,
            "new_status": status,
            "has_error": bool(error_message)
        })
        
        return {"artifact_id": artifact_id, "status": status}
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "update_artifact_status")
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