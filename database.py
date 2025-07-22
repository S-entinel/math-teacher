#!/usr/bin/env python3
"""
Database Models and Configuration for AI Math Teacher - SECURE VERSION
SQLAlchemy models for user management, chat sessions, and message storage
FIXED: Anonymous user reuse vulnerability that caused session mixing
"""

import uuid
from datetime import datetime, timedelta
from typing import Generator, Optional, Dict, Any
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, JSON, ForeignKey, Index, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.exc import SQLAlchemyError
import bcrypt

# Import logger
from logging_system import math_logger

Base = declarative_base()

class User(Base):
    """User model with secure session handling"""
    __tablename__ = 'users'
    
    # Primary key and identification
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=True)
    email = Column(String(255), unique=True, nullable=True)
    
    # Authentication
    password_hash = Column(String(255), nullable=True)
    session_token = Column(String(255), unique=True, nullable=True)  # For anonymous users
    
    # Profile information
    display_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Password reset
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    
    # Email verification
    verification_token = Column(String(255), nullable=True)
    verification_token_expires = Column(DateTime, nullable=True)
    
    # User preferences and settings
    preferences = Column(JSON, default=dict)
    
    # Account type
    account_type = Column(String(20), default='anonymous')  # 'anonymous', 'registered', 'premium'
    
    # Relationships
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_email', 'email'),
        Index('idx_session_token', 'session_token'),
        Index('idx_reset_token', 'reset_token'),
        Index('idx_verification_token', 'verification_token'),
        Index('idx_account_type', 'account_type'),
        Index('idx_last_active', 'last_active'),
    )
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, account_type={self.account_type})>"
    
    def set_password(self, password: str):
        """Hash and set password"""
        if password:
            salt = bcrypt.gensalt()
            self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password: str) -> bool:
        """Check if provided password matches hash"""
        if not self.password_hash or not password:
            return False
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))
    
    def generate_reset_token(self) -> str:
        """Generate password reset token"""
        token = str(uuid.uuid4())
        self.reset_token = token
        self.reset_token_expires = datetime.utcnow() + timedelta(hours=1)  # 1 hour expiry
        return token
    
    def generate_verification_token(self) -> str:
        """Generate email verification token"""
        token = str(uuid.uuid4())
        self.verification_token = token
        self.verification_token_expires = datetime.utcnow() + timedelta(days=1)  # 1 day expiry
        return token
    
    def to_dict(self):
        """Convert user to dictionary for API responses"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'display_name': self.display_name,
            'account_type': self.account_type,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'preferences': self.preferences or {},
            'session_token': self.session_token  # For anonymous users
        }

class ChatSession(Base):
    """Chat session model"""
    __tablename__ = 'chat_sessions'
    
    # Primary key and identification
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), unique=True, nullable=False)  # UUID
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Session metadata
    title = Column(String(200), default="New Math Session")
    message_count = Column(Integer, default=0)
    is_archived = Column(Boolean, default=False)
    
    # AI context storage
    ai_context = Column(JSON, default=list)  # Store AI conversation history
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="chat_session", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_id', 'session_id'),
        Index('idx_user_sessions', 'user_id', 'created_at'),
        Index('idx_active_sessions', 'user_id', 'is_archived'),
        Index('idx_last_active', 'last_active'),
    )
    
    def __repr__(self):
        return f"<ChatSession(id={self.id}, session_id={self.session_id}, user_id={self.user_id})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'title': self.title,
            'message_count': self.message_count,
            'is_archived': self.is_archived,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'archived_at': self.archived_at.isoformat() if self.archived_at else None
        }

class ChatMessage(Base):
    """Individual chat message model"""
    __tablename__ = 'chat_messages'
    
    # Primary key and relationships
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_session_id = Column(Integer, ForeignKey('chat_sessions.id'), nullable=False)
    
    # Message content
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    
    # Metadata
    timestamp = Column(DateTime, default=datetime.utcnow)
    message_index = Column(Integer, nullable=False)  # Order within session
    
    # Optional metadata
    message_metadata = Column(JSON, default=dict)  # For storing additional message data
    
    # Relationships
    chat_session = relationship("ChatSession", back_populates="messages")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_messages', 'chat_session_id', 'message_index'),
        Index('idx_session_timestamp', 'chat_session_id', 'timestamp'),
        Index('idx_role', 'role'),
    )
    
    def __repr__(self):
        return f"<ChatMessage(id={self.id}, role={self.role}, session_id={self.chat_session_id})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'chat_session_id': self.chat_session_id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'message_index': self.message_index,
            'metadata': self.message_metadata or {}
        }


class UserPreference(Base):
    """User preferences model"""
    __tablename__ = 'user_preferences'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_user_key', 'user_id', 'key', unique=True),
    )
    
    def __repr__(self):
        return f"<UserPreference(user_id={self.user_id}, key={self.key})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'key': self.key,
            'value': self.value,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

# Database configuration
class DatabaseConfig:
    """Database configuration and setup"""
    
    def __init__(self, database_url: str = "sqlite:///math_teacher.db"):
        self.database_url = database_url
        self.engine = create_engine(
            database_url,
            echo=False,  # Set to True for SQL debugging
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"check_same_thread": False} if "sqlite" in database_url else {}
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def create_tables(self):
        """Create all database tables"""
        Base.metadata.create_all(bind=self.engine)
    
    def drop_tables(self):
        """Drop all database tables - USE WITH CAUTION"""
        Base.metadata.drop_all(bind=self.engine)
    
    def get_session(self) -> Session:
        """Get a database session"""
        return self.SessionLocal()
    
    def init_database(self):
        """Initialize database with tables and basic data"""
        self.create_tables()
        
        # Create default anonymous user if none exists
        with self.get_session() as session:
            try:
                user_count = session.query(User).count()
                if user_count == 0:
                    default_user = User(
                        username=None,
                        email=None,
                        account_type='anonymous',
                        session_token=str(uuid.uuid4()),
                        preferences={
                            'theme': 'dark',
                            'auto_save_interval': 30,
                            'default_graph_range': 10
                        }
                    )
                    session.add(default_user)
                    session.commit()
                    print("✓ Created default anonymous user")
            except Exception as e:
                print(f"Warning: Could not create default user: {e}")
                session.rollback()

# Global database instance
db_config = None

def get_database() -> DatabaseConfig:
    """Get the global database configuration"""
    global db_config
    if db_config is None:
        db_config = DatabaseConfig()
        db_config.init_database()
    return db_config

def get_db_session() -> Generator[Session, None, None]:
    """Get a database session (for dependency injection)"""
    database = get_database()
    session = database.get_session()
    try:
        yield session
    finally:
        session.close()

# 🔒 SECURITY FIXED: Helper functions for SECURE user management
def ensure_user_exists(session: Session, session_token: str = None, email: str = None) -> User:
    """🔒 SECURITY FIXED: Ensure a user exists with SECURE UNIQUE ANONYMOUS USER CREATION"""
    
    # First, try to find user by email (for registered users)
    if email:
        user = session.query(User).filter(User.email == email.lower()).first()
        if user:
            user.last_active = datetime.utcnow()
            session.commit()
            return user
    
    # Then, try to find user by session_token (for anonymous users)
    if session_token:
        user = session.query(User).filter(User.session_token == session_token).first()
        if user:
            user.last_active = datetime.utcnow()
            session.commit()
            return user
    
    # 🔒 CRITICAL SECURITY FIX: NEVER REUSE ANONYMOUS USERS
    # The old vulnerable code had this dangerous block that caused session mixing:
    #
    # if not session_token and not email:
    #     existing_user = session.query(User).filter(
    #         User.email == None, 
    #         User.account_type == 'anonymous'
    #     ).first()
    #     if existing_user:  # ❌ THIS CAUSED THE DATA LEAKAGE!
    #         return existing_user
    #
    # REMOVED: This block was reusing anonymous users across different sessions,
    # causing conversations to leak between different anonymous users.
    
    # 🔒 SECURE: Always create new unique user for each session
    user = User(
        username=None,
        email=email.lower() if email else None,
        session_token=session_token or str(uuid.uuid4()),
        account_type='registered' if email else 'anonymous',
        preferences={
            'theme': 'dark',
            'auto_save_interval': 30
        }
    )
    session.add(user)
    session.commit()
    
    # Log user creation for debugging
    if email:
        math_logger.logger.info(f"Created new registered user: {email}")
    else:
        math_logger.logger.info(f"Created new anonymous user with token: {user.session_token[:8]}...")
    
    return user

def cleanup_old_sessions(session: Session, days_old: int = 30):
    """Clean up old archived sessions"""
    cutoff_date = datetime.utcnow() - timedelta(days=days_old)
    old_sessions = session.query(ChatSession).filter(
        ChatSession.is_archived == True,
        ChatSession.last_active < cutoff_date
    ).all()
    
    for old_session in old_sessions:
        session.delete(old_session)
    
    session.commit()
    return len(old_sessions)

def get_user_by_email(session: Session, email: str) -> Optional[User]:
    """Get user by email address"""
    return session.query(User).filter(User.email == email.lower()).first()

def get_user_by_reset_token(session: Session, token: str) -> Optional[User]:
    """Get user by password reset token"""
    return session.query(User).filter(
        User.reset_token == token,
        User.reset_token_expires > datetime.utcnow()
    ).first()

def get_user_by_verification_token(session: Session, token: str) -> Optional[User]:
    """Get user by email verification token"""
    return session.query(User).filter(
        User.verification_token == token,
        User.verification_token_expires > datetime.utcnow()
    ).first()

def get_user_by_session_token(session: Session, session_token: str) -> Optional[User]:
    """Get user by session token (for anonymous users)"""
    return session.query(User).filter(User.session_token == session_token).first()

def create_chat_session(session: Session, user_id: int, session_id: str = None, title: str = "New Math Session") -> ChatSession:
    """Create a new chat session for a user"""
    chat_session = ChatSession(
        session_id=session_id or str(uuid.uuid4()),
        user_id=user_id,
        title=title
    )
    session.add(chat_session)
    session.commit()
    return chat_session

def get_user_sessions(session: Session, user_id: int, limit: int = 50, include_archived: bool = False) -> list:
    """Get all sessions for a user"""
    query = session.query(ChatSession).filter(ChatSession.user_id == user_id)
    
    if not include_archived:
        query = query.filter(ChatSession.is_archived == False)
    
    sessions = query.order_by(ChatSession.last_active.desc()).limit(limit).all()
    return [s.to_dict() for s in sessions]

def add_message_to_session(session: Session, session_id: str, role: str, content: str) -> ChatMessage:
    """Add a message to a chat session"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if not chat_session:
        raise ValueError(f"Chat session {session_id} not found")
    
    # Get next message index
    message_count = session.query(ChatMessage).filter(ChatMessage.chat_session_id == chat_session.id).count()
    
    message = ChatMessage(
        chat_session_id=chat_session.id,
        role=role,
        content=content,
        message_index=message_count
    )
    
    session.add(message)
    
    # Update session message count and last_active
    chat_session.message_count = message_count + 1
    chat_session.last_active = datetime.utcnow()
    
    session.commit()
    return message

def get_session_messages(session: Session, session_id: str) -> list:
    """Get all messages for a session"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if not chat_session:
        return []
    
    messages = session.query(ChatMessage).filter(
        ChatMessage.chat_session_id == chat_session.id
    ).order_by(ChatMessage.message_index).all()
    
    return [m.to_dict() for m in messages]

def update_session_ai_context(session: Session, session_id: str, ai_context: list):
    """Update the AI context for a session"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if chat_session:
        chat_session.ai_context = ai_context
        chat_session.last_active = datetime.utcnow()
        session.commit()

def get_session_ai_context(session: Session, session_id: str) -> list:
    """Get the AI context for a session"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if chat_session:
        return chat_session.ai_context or []
    return []

def delete_chat_session(session: Session, session_id: str) -> bool:
    """Delete a chat session and all its messages"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if chat_session:
        session.delete(chat_session)  # Cascade will delete messages
        session.commit()
        return True
    return False

def clear_session_messages(session: Session, session_id: str):
    """Clear all messages from a session but keep the session"""
    chat_session = session.query(ChatSession).filter(ChatSession.session_id == session_id).first()
    
    if chat_session:
        # Delete all messages
        session.query(ChatMessage).filter(ChatMessage.chat_session_id == chat_session.id).delete()
        
        # Reset session counters and AI context
        chat_session.message_count = 0
        chat_session.ai_context = []
        chat_session.last_active = datetime.utcnow()
        
        session.commit()

def get_database_stats(session: Session) -> dict:
    """Get comprehensive database statistics"""
    try:
        stats = {
            'total_users': session.query(User).count(),
            'anonymous_users': session.query(User).filter(User.account_type == 'anonymous').count(),
            'registered_users': session.query(User).filter(User.account_type == 'registered').count(),
            'total_sessions': session.query(ChatSession).count(),
            'active_sessions': session.query(ChatSession).filter(ChatSession.is_archived == False).count(),
            'archived_sessions': session.query(ChatSession).filter(ChatSession.is_archived == True).count(),
            'total_messages': session.query(ChatMessage).count(),
        }
        
        # Recent activity (last 24 hours)
        yesterday = datetime.utcnow() - timedelta(days=1)
        stats['recent_activity'] = {
            'new_users': session.query(User).filter(User.created_at > yesterday).count(),
            'new_sessions': session.query(ChatSession).filter(ChatSession.created_at > yesterday).count(),
            'new_messages': session.query(ChatMessage).filter(ChatMessage.timestamp > yesterday).count()
        }
        
        return stats
    except Exception as e:
        math_logger.logger.error(f"Failed to get database stats: {e}")
        return {}