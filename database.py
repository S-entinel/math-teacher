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
    """User model - future-proofing for multi-user support"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), unique=True, nullable=True)
    session_token = Column(UUID, unique=True, nullable=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    preferences = Column(JSON, default=dict)
    
    # Relationships
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'session_token': self.session_token,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'preferences': self.preferences or {}
        }

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
    
    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("Message", back_populates="chat_session", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="chat_session", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_id', 'session_id'),
        Index('idx_user_last_active', 'user_id', 'last_active'),
        Index('idx_archived', 'is_archived'),
    )
    
    def __repr__(self):
        return f"<ChatSession(id={self.id}, session_id={self.session_id}, title={self.title})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'is_archived': self.is_archived,
            'message_count': self.message_count,
            'metadata': self.metadata or {}
        }

class Message(Base):
    """Message model for chat conversations"""
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
    
    # Indexes for performance
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
            'metadata': self.metadata or {}
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
    
    # Indexes for performance
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
            'metadata': self.metadata or {}
        }

class UserPreference(Base):
    """User preferences model for settings storage"""
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
def ensure_user_exists(session: Session, session_token: str = None) -> User:
    """Ensure a user exists, create anonymous user if needed"""
    if session_token:
        user = session.query(User).filter(User.session_token == session_token).first()
        if user:
            user.last_active = datetime.utcnow()
            session.commit()
            return user
    
    # Create new anonymous user
    user = User(
        username=None,
        session_token=str(uuid.uuid4()),
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