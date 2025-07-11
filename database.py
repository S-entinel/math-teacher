#!/usr/bin/env python3
"""
Database models for AI Math Teacher
SQLAlchemy models for persistent storage
"""

import uuid
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Generator
from sqlalchemy import create_engine, Column, String, DateTime, Integer, Text, Boolean, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.types import TypeDecorator, VARCHAR
import bcrypt


Base = declarative_base()

class UUID(TypeDecorator):
    """Platform-independent UUID type for SQLite"""
    impl = VARCHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(VARCHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif isinstance(value, uuid.UUID):
            return str(value)
        else:
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            return str(value)

class User(Base):
    """User model with authentication support"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Authentication fields
    email = Column(String(255), unique=True, nullable=True)  # Nullable for anonymous users
    password_hash = Column(String(255), nullable=True)      # Nullable for anonymous users
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    
    # Display and identification
    username = Column(String(100), nullable=True)           # Display name
    display_name = Column(String(100), nullable=True)       # Friendly display name
    
    # Session management (keeping existing functionality)
    session_token = Column(UUID, unique=True, nullable=True, default=lambda: str(uuid.uuid4()))
    
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
        self.verification_token_expires = datetime.utcnow() + timedelta(days=7)  # 7 days expiry
        return token
    
    def is_reset_token_valid(self, token: str) -> bool:
        """Check if reset token is valid and not expired"""
        return (self.reset_token == token and 
                self.reset_token_expires and 
                self.reset_token_expires > datetime.utcnow())
    
    def is_verification_token_valid(self, token: str) -> bool:
        """Check if verification token is valid and not expired"""
        return (self.verification_token == token and 
                self.verification_token_expires and 
                self.verification_token_expires > datetime.utcnow())
    
    def clear_reset_token(self):
        """Clear password reset token"""
        self.reset_token = None
        self.reset_token_expires = None
    
    def clear_verification_token(self):
        """Clear email verification token"""
        self.verification_token = None
        self.verification_token_expires = None
    
    def promote_to_registered(self, email: str, password: str, display_name: str = None):
        """Convert anonymous user to registered user"""
        self.email = email.lower().strip()
        self.set_password(password)
        self.display_name = display_name or email.split('@')[0]
        self.account_type = 'registered'
        self.is_active = True
        # Keep existing session_token and preferences
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary, optionally including sensitive fields"""
        data = {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'display_name': self.display_name,
            'is_verified': self.is_verified,
            'is_active': self.is_active,
            'account_type': self.account_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'preferences': self.preferences or {}
        }
        
        if include_sensitive:
            data.update({
                'session_token': self.session_token,
                'has_password': bool(self.password_hash),
                'reset_token_expires': self.reset_token_expires.isoformat() if self.reset_token_expires else None,
                'verification_token_expires': self.verification_token_expires.isoformat() if self.verification_token_expires else None
            })
        
        return data

class ChatSession(Base):
    """Chat session model"""
    __tablename__ = 'chat_sessions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(UUID, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    title = Column(String(500), nullable=False, default="New Math Session")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    is_archived = Column(Boolean, default=False)
    message_count = Column(Integer, default=0)
    session_metadata = Column(JSON, default=dict)

    is_shared = Column(Boolean, default=False)
    share_token = Column(String(255), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("Message", back_populates="chat_session", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="chat_session", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_id', 'session_id'),
        Index('idx_user_last_active', 'user_id', 'last_active'),
        Index('idx_archived', 'is_archived'),
        Index('idx_shared', 'is_shared'),
        Index('idx_share_token', 'share_token'),
    )

    def __repr__(self):
        return f"<ChatSession(id={self.id}, session_id={self.session_id}, title={self.title})>"
    
    def generate_share_token(self) -> str:
        """Generate sharing token for public access"""
        token = str(uuid.uuid4())
        self.share_token = token
        self.is_shared = True
        return token
    
    def revoke_sharing(self):
        """Revoke sharing access"""
        self.share_token = None
        self.is_shared = False
    
    def to_dict(self, include_sharing=False):
        """Convert to dictionary"""
        data = {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'is_archived': self.is_archived,
            'message_count': self.message_count,
            'metadata': self.session_metadata or {}
        }
        
        if include_sharing:
            data.update({
                'is_shared': self.is_shared,
                'share_token': self.share_token
            })
        
        return data

class Message(Base):
    """Message model - keeping existing structure"""
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_session_id = Column(Integer, ForeignKey('chat_sessions.id'), nullable=False)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    tokens_used = Column(Integer, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    message_metadata = Column(JSON, default=dict)
    
    # Relationships
    chat_session = relationship("ChatSession", back_populates="messages")
    
    # Indexes for performance (keeping existing)
    __table_args__ = (
        Index('idx_session_timestamp', 'chat_session_id', 'timestamp'),
        Index('idx_role', 'role'),
    )
    
    def __repr__(self):
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<Message(id={self.id}, role={self.role}, content={content_preview})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'chat_session_id': self.chat_session_id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'tokens_used': self.tokens_used,
            'response_time_ms': self.response_time_ms,
            'metadata': self.message_metadata or {}
        }
    


class Artifact(Base):

    """Artifact model for graphs and interactive content"""
    
    __tablename__ = 'artifacts'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    artifact_id = Column(UUID, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    chat_session_id = Column(Integer, ForeignKey('chat_sessions.id'), nullable=False)
    artifact_type = Column(String(50), nullable=False)  # 'graph', etc.
    title = Column(String(500), nullable=False)
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(String(20), default='complete')  # 'pending', 'generating', 'complete', 'error'
    error_message = Column(Text, nullable=True)
    artifact_metadata = Column(JSON, default=dict)
    
    # Relationships
    chat_session = relationship("ChatSession", back_populates="artifacts")
    
    # Indexes for performance (keeping existing)
    __table_args__ = (
        Index('idx_artifact_id', 'artifact_id'),
        Index('idx_session_type', 'chat_session_id', 'artifact_type'),
        Index('idx_created_at', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Artifact(id={self.id}, type={self.artifact_type}, title={self.title})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'artifact_id': self.artifact_id,
            'chat_session_id': self.chat_session_id,
            'artifact_type': self.artifact_type,
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'status': self.status,
            'error_message': self.error_message,
            'metadata': self.artifact_metadata or {}
        }

class UserPreference(Base):
    """User preferences model"""
    __tablename__ = 'user_preferences'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes for performance (keeping existing)
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

# Helper functions for common operations
def ensure_user_exists(session: Session, session_token: str = None, email: str = None) -> User:
    """Ensure a user exists, create anonymous user if needed"""
    
    # First, try to find user by email (for registered users)
    if email:
        user = session.query(User).filter(User.email == email.lower()).first()
        if user:
            user.last_active = datetime.utcnow()
            session.commit()
            return user
    
    # Then, try to find user by session_token
    if session_token:
        user = session.query(User).filter(User.session_token == session_token).first()
        if user:
            user.last_active = datetime.utcnow()
            session.commit()
            return user
    
    # If no session_token provided, try to get the first available anonymous user
    # This prevents creating multiple anonymous users
    if not session_token and not email:
        existing_user = session.query(User).filter(
            User.email == None, 
            User.account_type == 'anonymous'
        ).first()
        if existing_user:
            existing_user.last_active = datetime.utcnow()
            session.commit()
            return existing_user
    
    # Only create new user if absolutely necessary
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