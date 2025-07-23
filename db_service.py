#!/usr/bin/env python3
"""
Database Service Layer for AI Math Teacher
Handles all database operations with proper error handling and transactions
"""

import uuid
import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc, asc, func, and_, or_

from database import (
    get_database, get_db_session, User, ChatSession, Message, UserPreference, ensure_user_exists
)

from logging_system import math_logger

class DatabaseService:
    """Service layer for database operations"""
    
    def __init__(self):
        self.db = get_database()
    
    def get_session(self) -> Session:
        """Get a database session"""
        return self.db.get_session()
    
    # ===== USER OPERATIONS =====
    
    def get_or_create_user(self, session_token: str = None) -> Dict[str, Any]:
        """Get existing user or create new anonymous user"""
        try:
            with self.get_session() as session:
                # First, try to find user by session_token
                if session_token:
                    user = session.query(User).filter(User.session_token == session_token).first()
                    if user:
                        user.last_active = datetime.utcnow()
                        session.commit()
                        return user.to_dict()
                
                # If no session_token provided, try to get the first available anonymous user
                # This prevents creating multiple anonymous users
                if not session_token:
                    existing_user = session.query(User).filter(User.username == None).first()
                    if existing_user:
                        existing_user.last_active = datetime.utcnow()
                        session.commit()
                        return existing_user.to_dict()
                
                # Only create new user if absolutely necessary
                user = User(
                    username=None,
                    session_token=session_token or str(uuid.uuid4()),
                    preferences={
                        'theme': 'dark',
                        'auto_save_interval': 30
                    }
                )
                session.add(user)
                session.commit()
                return user.to_dict()
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "get_or_create_user")
            raise
    
    def update_user_preferences(self, user_id: int, preferences: Dict[str, Any]) -> bool:
        """Update user preferences"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                if not user:
                    return False
                
                user.preferences = {**(user.preferences or {}), **preferences}
                user.last_active = datetime.utcnow()
                session.commit()
                return True
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"update_user_preferences_user_{user_id}")
            return False
    
    # ===== CHAT SESSION OPERATIONS =====
    
    def create_chat_session(self, user_id: int = None, title: str = None, session_id: str = None) -> Dict[str, Any]:
        """Create a new chat session"""
        try:
            with self.get_session() as session:
                # If no user_id provided, get/create anonymous user
                if user_id is None:
                    user = ensure_user_exists(session)
                    user_id = user.id
                
                chat_session = ChatSession(
                    session_id=session_id or str(uuid.uuid4()),
                    user_id=user_id,
                    title=title or "New Math Session",
                    message_count=0
                )
                
                session.add(chat_session)
                session.commit()
                
                result = chat_session.to_dict()
                math_logger.logger.info(f"Created chat session: {chat_session.session_id}")
                return result
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "create_chat_session")
            raise
    
    def get_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get chat session by session_id"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if chat_session:
                    chat_session.last_active = datetime.utcnow()
                    session.commit()
                    return chat_session.to_dict()
                return None
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "get_chat_session")
            return None
    
    def get_user_chat_sessions(self, user_id: int, include_archived: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all chat sessions for a user"""
        try:
            with self.get_session() as session:
                query = session.query(ChatSession).filter(ChatSession.user_id == user_id)
                
                if not include_archived:
                    query = query.filter(ChatSession.is_archived == False)
                
                chat_sessions = query.order_by(desc(ChatSession.last_active)).limit(limit).all()
                return [cs.to_dict() for cs in chat_sessions]
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"get_user_chat_sessions_user_{user_id}")
            return []
    
    def update_chat_session(self, session_id: str, updates: Dict[str, Any]) -> bool:
        """Update chat session properties"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                # Update allowed fields
                allowed_fields = ['title', 'is_archived', 'metadata']
                for field, value in updates.items():
                    if field in allowed_fields and hasattr(chat_session, field):
                        setattr(chat_session, field, value)
                
                chat_session.last_active = datetime.utcnow()
                session.commit()
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "update_chat_session")
            return False
    
    def delete_chat_session(self, session_id: str) -> bool:
        """Delete a chat session and all its messages"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                session.delete(chat_session)
                session.commit()
                
                math_logger.logger.info(f"Deleted chat session: {session_id}")
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "delete_chat_session")
            return False
    
    def clear_chat_session(self, session_id: str) -> bool:
        """Clear all messages from a chat session"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                # Delete all messages 
                session.query(Message).filter(Message.chat_session_id == chat_session.id).delete()
                
                # Update message count and timestamp
                chat_session.message_count = 0
                chat_session.last_active = datetime.utcnow()
                
                session.commit()
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "clear_chat_session")
            return False
        

    # ===== AI CONTEXT MANAGEMENT =====

    def store_ai_context(self, session_id: str, chat_history: list) -> bool:
        """Store AI chat context for session restoration"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                chat_session.store_ai_context(chat_history)
                chat_session.last_active = datetime.utcnow()
                session.commit()
                
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "store_ai_context")
            return False
    
    def get_ai_context(self, session_id: str) -> Optional[list]:
        """Retrieve stored AI chat context"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return None
                
                return chat_session.get_ai_context()
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "get_ai_context")
            return None
    
    def update_last_ai_message(self, session_id: str, message_id: str) -> bool:
        """Update the last AI message ID for tracking continuity"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                chat_session.last_ai_message_id = message_id
                chat_session.last_active = datetime.utcnow()
                session.commit()
                
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "update_last_ai_message")
            return False
    
    def clear_ai_context(self, session_id: str) -> bool:
        """Clear AI context when conversation is cleared"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return False
                
                chat_session.ai_context = {}
                chat_session.last_ai_message_id = None
                chat_session.last_active = datetime.utcnow()
                session.commit()
                
                return True
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "clear_ai_context")
            return False
    
    # ===== MESSAGE OPERATIONS =====
    
    def add_message(self, session_id: str, role: str, content: str, 
                   tokens_used: int = None, response_time_ms: int = None) -> Optional[Dict[str, Any]]:
        """Add a message to a chat session"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return None
                
                message = Message(
                    chat_session_id=chat_session.id,
                    role=role,
                    content=content,
                    tokens_used=tokens_used,
                    response_time_ms=response_time_ms
                )
                
                session.add(message)
                
                # Update session message count and last_active
                chat_session.message_count += 1
                chat_session.last_active = datetime.utcnow()
                
                session.commit()
                return message.to_dict()
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "add_message")
            return None
    
    def get_session_messages(self, session_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Get messages for a chat session"""
        try:
            with self.get_session() as session:
                chat_session = session.query(ChatSession).filter(
                    ChatSession.session_id == session_id
                ).first()
                
                if not chat_session:
                    return []
                
                messages = session.query(Message).filter(
                    Message.chat_session_id == chat_session.id
                ).order_by(asc(Message.timestamp)).offset(offset).limit(limit).all()
                
                return [msg.to_dict() for msg in messages]
                
        except SQLAlchemyError as e:
            math_logger.log_error(session_id, e, "get_session_messages")
            return []
    
    def search_messages(self, user_id: int, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search messages across all user's sessions"""
        try:
            with self.get_session() as session:
                # Join messages with chat sessions to filter by user
                results = session.query(Message, ChatSession).join(
                    ChatSession, Message.chat_session_id == ChatSession.id
                ).filter(
                    ChatSession.user_id == user_id,
                    Message.content.contains(query)
                ).order_by(desc(Message.timestamp)).limit(limit).all()
                
                return [{
                    **message.to_dict(),
                    'session_title': chat_session.title,
                    'session_id': chat_session.session_id
                } for message, chat_session in results]
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"search_messages_user_{user_id}")
            return []
    
    
    # ===== ANALYTICS AND MAINTENANCE =====
    
    def get_user_analytics(self, user_id: int) -> Dict[str, Any]:
        """Get analytics for a user"""
        try:
            with self.get_session() as session:
                # Get session count
                session_count = session.query(ChatSession).filter(
                    ChatSession.user_id == user_id
                ).count()
                
                # Get total messages
                message_count = session.query(func.count(Message.id)).join(
                    ChatSession, Message.chat_session_id == ChatSession.id
                ).filter(ChatSession.user_id == user_id).scalar()
                
                # Get recent activity (last 7 days)
                week_ago = datetime.utcnow() - timedelta(days=7)
                recent_sessions = session.query(func.count(ChatSession.id)).filter(
                    ChatSession.user_id == user_id,
                    ChatSession.last_active >= week_ago
                ).scalar()
                
                return {
                    'total_sessions': session_count or 0,
                    'total_messages': message_count or 0,
                    'recent_sessions': recent_sessions or 0,
                    'generated_at': datetime.utcnow().isoformat()
                }
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"get_user_analytics_user_{user_id}")
            return {}
    
    def cleanup_old_data(self, days_old: int = 90) -> Dict[str, int]:
        """Clean up old archived sessions and orphaned data"""
        try:
            with self.get_session() as session:
                cutoff_date = datetime.utcnow() - timedelta(days=days_old)
                
                # Find old archived sessions
                old_sessions = session.query(ChatSession).filter(
                    ChatSession.is_archived == True,
                    ChatSession.last_active < cutoff_date
                ).all()
                
                deleted_sessions = len(old_sessions)
                deleted_messages = 0
                
                for old_session in old_sessions:
                    # Count related data before deletion
                    deleted_messages += session.query(Message).filter(
                        Message.chat_session_id == old_session.id
                    ).count()
                    
                    
                    # Delete the session (cascades to messages)
                    session.delete(old_session)
                
                session.commit()
                
                result = {
                    'deleted_sessions': deleted_sessions,
                    'deleted_messages': deleted_messages,
                    'cutoff_date': cutoff_date.isoformat()
                }
                
                if deleted_sessions > 0:
                    math_logger.logger.info(f"Cleaned up old data: {result}")
                
                return result
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "cleanup_old_data")
            return {'error': str(e)}
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get system-wide statistics"""
        try:
            with self.get_session() as session:
                stats = {}
                
                # Basic counts
                stats['total_users'] = session.query(User).count()
                stats['total_sessions'] = session.query(ChatSession).count()
                stats['total_messages'] = session.query(Message).count()
                
                # Active sessions (last 24 hours)
                day_ago = datetime.utcnow() - timedelta(days=1)
                stats['active_sessions_24h'] = session.query(ChatSession).filter(
                    ChatSession.last_active >= day_ago
                ).count()
                
                # Archive statistics
                stats['archived_sessions'] = session.query(ChatSession).filter(
                    ChatSession.is_archived == True
                ).count()
                
                # Average messages per session
                avg_messages = session.query(func.avg(ChatSession.message_count)).scalar()
                stats['avg_messages_per_session'] = round(float(avg_messages or 0), 2)
                
                stats['generated_at'] = datetime.utcnow().isoformat()
                return stats
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, "get_system_stats")
            return {'error': str(e)}
    
    # ===== DATA MIGRATION HELPERS =====
    
    def migrate_localstorage_data(self, user_id: int, chats_data: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate data from localStorage format to database"""
        try:
            migration_stats = {
                'sessions_created': 0,
                'messages_created': 0,
                'errors': []
            }
            
            with self.get_session() as session:
                # Get the user
                user = session.query(User).filter(User.id == user_id).first()
                if not user:
                    raise ValueError(f"User {user_id} not found")
                
                # Process each chat from localStorage
                for chat_id, chat_data in chats_data.get('chats', []):
                    try:
                        # Create chat session
                        chat_session = ChatSession(
                            session_id=chat_data.get('sessionId') or str(uuid.uuid4()),
                            user_id=user_id,
                            title=chat_data.get('title', 'Migrated Session'),
                            created_at=datetime.fromisoformat(chat_data['createdAt'].replace('Z', '+00:00')),
                            last_active=datetime.fromisoformat(chat_data['lastActive'].replace('Z', '+00:00')),
                            message_count=len(chat_data.get('messages', []))
                        )
                        
                        session.add(chat_session)
                        session.flush()  # Get the ID
                        
                        migration_stats['sessions_created'] += 1
                        
                        # Create messages
                        for msg_data in chat_data.get('messages', []):
                            message = Message(
                                chat_session_id=chat_session.id,
                                role=msg_data['role'],
                                content=msg_data['content'],
                                timestamp=datetime.fromisoformat(msg_data['timestamp'].replace('Z', '+00:00'))
                            )
                            session.add(message)
                            migration_stats['messages_created'] += 1
                        
                    except Exception as e:
                        migration_stats['errors'].append(f"Chat {chat_id}: {str(e)}")
                        continue
                
                session.commit()
                
                math_logger.logger.info(f"Migration completed: {migration_stats}")
                return migration_stats
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"migrate_localstorage_data_user_{user_id}")
            return {'error': str(e)}
    
    def export_user_data(self, user_id: int) -> Dict[str, Any]:
        """Export all user data for backup/transfer"""
        try:
            with self.get_session() as session:
                user = session.query(User).filter(User.id == user_id).first()
                if not user:
                    return {'error': 'User not found'}
                
                # Get all user sessions with messages
                sessions = session.query(ChatSession).filter(
                    ChatSession.user_id == user_id
                ).order_by(desc(ChatSession.last_active)).all()
                
                export_data = {
                    'user': user.to_dict(),
                    'export_date': datetime.utcnow().isoformat(),
                    'sessions': []
                }
                
                for chat_session in sessions:
                    session_data = chat_session.to_dict()
                    
                    # Get messages
                    messages = session.query(Message).filter(
                        Message.chat_session_id == chat_session.id
                    ).order_by(asc(Message.timestamp)).all()
                    session_data['messages'] = [msg.to_dict() for msg in messages]
                                        
                    export_data['sessions'].append(session_data)
                
                return export_data
                
        except SQLAlchemyError as e:
            math_logger.log_error(None, e, f"export_user_data_user_{user_id}")
            return {'error': str(e)}

# Global service instance
_db_service = None

def get_db_service() -> DatabaseService:
    """Get the global database service instance"""
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service

# Context manager for database transactions
class DatabaseTransaction:
    """Context manager for database transactions with automatic rollback"""
    
    def __init__(self, service: DatabaseService):
        self.service = service
        self.session = None
    
    def __enter__(self) -> Session:
        self.session = self.service.get_session()
        return self.session
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.session.rollback()
            math_logger.logger.error(f"Database transaction rolled back: {exc_val}")
        else:
            self.session.commit()
        self.session.close()

# Utility functions for common operations
def ensure_session_exists_in_db(session_id: str) -> bool:
    """Ensure a session exists in the database"""
    db_service = get_db_service()
    session_data = db_service.get_chat_session(session_id)
    
    if not session_data:
        # Create the session
        user = db_service.get_or_create_user()
        session_data = db_service.create_chat_session(
            user_id=user['id'],
            session_id=session_id,
            title="Restored Session"
        )
        return session_data is not None
    
    return True

def sync_in_memory_to_db(conversations: Dict[str, Any]) -> Dict[str, Any]:
    """Sync in-memory conversation data to database"""
    db_service = get_db_service()
    sync_stats = {
        'sessions_synced': 0,
        'messages_synced': 0,
        'errors': []
    }
    
    try:
        # Get or create anonymous user
        user = db_service.get_or_create_user()
        
        for session_id, conv_data in conversations.items():
            try:
                # Ensure session exists in DB
                db_session = db_service.get_chat_session(session_id)
                if not db_session:
                    db_session = db_service.create_chat_session(
                        user_id=user['id'],
                        session_id=session_id,
                        title="Active Session"
                    )
                
                # Get existing message count to avoid duplicates
                existing_messages = db_service.get_session_messages(session_id)
                existing_count = len(existing_messages)
                
                # Add new messages
                conv_messages = conv_data.get('messages', [])
                new_messages = conv_messages[existing_count:]
                
                for message in new_messages:
                    db_service.add_message(
                        session_id=session_id,
                        role=message.role,
                        content=message.content
                    )
                    sync_stats['messages_synced'] += 1
                
                sync_stats['sessions_synced'] += 1
                
            except Exception as e:
                sync_stats['errors'].append(f"Session {session_id}: {str(e)}")
                continue
        
        math_logger.logger.info(f"Memory to DB sync completed: {sync_stats}")
        return sync_stats
        
    except Exception as e:
        math_logger.log_error(None, e, "sync_in_memory_to_db")
        return {'error': str(e)}