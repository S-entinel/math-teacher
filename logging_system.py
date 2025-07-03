#!/usr/bin/env python3
"""
Enhanced logging system for AI Math Teacher API
Provides structured logging with session context and performance monitoring
"""

import logging
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional
from functools import wraps
import traceback
from contextlib import contextmanager

class MathTeacherLogger:
    """Centralized logging system for the math teacher application"""
    
    def __init__(self, log_level: str = "INFO"):
        self.setup_logger(log_level)
        self.session_contexts: Dict[str, Dict] = {}
        
    def setup_logger(self, log_level: str):
        """Configure structured logging with proper formatting"""
        
        # Create custom formatter for structured logs
        class StructuredFormatter(logging.Formatter):
            def format(self, record):
                log_entry = {
                    'timestamp': datetime.utcnow().isoformat(),
                    'level': record.levelname,
                    'component': record.name,
                    'message': record.getMessage(),
                }
                
                # Add extra fields if present
                if hasattr(record, 'session_id'):
                    log_entry['session_id'] = record.session_id
                if hasattr(record, 'user_action'):
                    log_entry['user_action'] = record.user_action
                if hasattr(record, 'response_time'):
                    log_entry['response_time_ms'] = record.response_time
                if hasattr(record, 'error_context'):
                    log_entry['error_context'] = record.error_context
                if hasattr(record, 'performance_metrics'):
                    log_entry['performance_metrics'] = record.performance_metrics
                    
                return json.dumps(log_entry)
        
        # Configure root logger
        self.logger = logging.getLogger('math_teacher')
        self.logger.setLevel(getattr(logging, log_level.upper()))
        
        # Console handler with structured formatting
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(StructuredFormatter())
        self.logger.addHandler(console_handler)
        
        # File handler for persistent logs
        file_handler = logging.FileHandler('math_teacher.log')
        file_handler.setFormatter(StructuredFormatter())
        self.logger.addHandler(file_handler)
        
        # Separate file for errors
        error_handler = logging.FileHandler('math_teacher_errors.log')
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(StructuredFormatter())
        self.logger.addHandler(error_handler)
    
    def set_session_context(self, session_id: str, context: Dict[str, Any]):
        """Store context information for a session"""
        self.session_contexts[session_id] = {
            **context,
            'created_at': datetime.utcnow().isoformat()
        }
    
    def get_session_context(self, session_id: str) -> Dict[str, Any]:
        """Retrieve context information for a session"""
        return self.session_contexts.get(session_id, {})
    
    def log_session_event(self, session_id: str, event: str, details: Dict[str, Any] = None):
        """Log session-related events with context"""
        context = self.get_session_context(session_id)
        self.logger.info(
            f"Session event: {event}",
            extra={
                'session_id': session_id,
                'user_action': event,
                'session_context': context,
                'event_details': details or {}
            }
        )
    
    def log_api_request(self, session_id: str, endpoint: str, method: str, response_time: float):
        """Log API request with performance metrics"""
        self.logger.info(
            f"API request: {method} {endpoint}",
            extra={
                'session_id': session_id,
                'user_action': 'api_request',
                'response_time': response_time,
                'performance_metrics': {
                    'endpoint': endpoint,
                    'method': method,
                    'response_time_ms': response_time
                }
            }
        )
    
    def log_ai_interaction(self, session_id: str, prompt_length: int, response_length: int, 
                          response_time: float, success: bool = True, error: str = None):
        """Log AI interactions with performance and success metrics"""
        event = "ai_response_success" if success else "ai_response_error"
        
        extra_data = {
            'session_id': session_id,
            'user_action': event,
            'response_time': response_time,
            'performance_metrics': {
                'prompt_length': prompt_length,
                'response_length': response_length,
                'response_time_ms': response_time,
                'success': success
            }
        }
        
        if error:
            extra_data['error_context'] = error
        
        if success:
            self.logger.info(f"AI interaction completed successfully", extra=extra_data)
        else:
            self.logger.error(f"AI interaction failed: {error}", extra=extra_data)
    
    def log_error(self, session_id: str, error: Exception, context: str = ""):
        """Log errors with full context and stack trace"""
        error_context = {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'stack_trace': traceback.format_exc(),
            'context': context,
            'session_context': self.get_session_context(session_id) if session_id else {}
        }
        
        self.logger.error(
            f"Error in {context}: {str(error)}",
            extra={
                'session_id': session_id,
                'user_action': 'error',
                'error_context': error_context
            }
        )
    
    def log_user_behavior(self, session_id: str, action: str, details: Dict[str, Any]):
        """Log user behavior patterns for analytics"""
        self.logger.info(
            f"User behavior: {action}",
            extra={
                'session_id': session_id,
                'user_action': action,
                'behavior_details': details,
                'session_context': self.get_session_context(session_id)
            }
        )

# Global logger instance
math_logger = MathTeacherLogger()

def log_performance(operation_name: str):
    """Decorator to log function performance"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            session_id = kwargs.get('session_id') or (args[1] if len(args) > 1 else None)
            
            try:
                result = func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000
                
                math_logger.logger.debug(
                    f"Operation completed: {operation_name}",
                    extra={
                        'session_id': session_id,
                        'user_action': f'operation_{operation_name}',
                        'response_time': duration,
                        'performance_metrics': {
                            'operation': operation_name,
                            'duration_ms': duration,
                            'success': True
                        }
                    }
                )
                return result
                
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                math_logger.log_error(session_id, e, f"Operation: {operation_name}")
                
                math_logger.logger.error(
                    f"Operation failed: {operation_name}",
                    extra={
                        'session_id': session_id,
                        'user_action': f'operation_{operation_name}_failed',
                        'response_time': duration,
                        'performance_metrics': {
                            'operation': operation_name,
                            'duration_ms': duration,
                            'success': False
                        }
                    }
                )
                raise
                
        return wrapper
    return decorator

@contextmanager
def log_request_context(session_id: str, endpoint: str, method: str):
    """Context manager for logging API requests"""
    start_time = time.time()
    
    try:
        math_logger.log_session_event(session_id, 'api_request_start', {
            'endpoint': endpoint,
            'method': method
        })
        
        yield
        
        duration = (time.time() - start_time) * 1000
        math_logger.log_api_request(session_id, endpoint, method, duration)
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        math_logger.log_error(session_id, e, f"API request: {method} {endpoint}")
        math_logger.log_api_request(session_id, endpoint, method, duration)
        raise

def log_startup():
    """Log application startup information"""
    math_logger.logger.info(
        "AI Math Teacher API starting up",
        extra={
            'user_action': 'application_startup',
            'performance_metrics': {
                'startup_time': datetime.utcnow().isoformat()
            }
        }
    )

def log_shutdown():
    """Log application shutdown information"""
    math_logger.logger.info(
        "AI Math Teacher API shutting down",
        extra={
            'user_action': 'application_shutdown',
            'performance_metrics': {
                'shutdown_time': datetime.utcnow().isoformat()
            }
        }
    )

# Convenience functions for common logging patterns
def log_session_created(session_id: str):
    """Log successful session creation"""
    math_logger.log_session_event(session_id, 'session_created')

def log_session_restored(session_id: str, message_count: int):
    """Log session restoration"""
    math_logger.log_session_event(session_id, 'session_restored', {
        'message_count': message_count
    })

def log_conversation_cleared(session_id: str):
    """Log conversation clearing"""
    math_logger.log_session_event(session_id, 'conversation_cleared')

def log_message_sent(session_id: str, message_length: int, topic: str = None):
    """Log user message with analytics"""
    math_logger.log_user_behavior(session_id, 'message_sent', {
        'message_length': message_length,
        'estimated_topic': topic
    })

def log_feature_used(session_id: str, feature_name: str, details: Dict[str, Any] = None):
    """Log feature usage for analytics"""
    math_logger.log_user_behavior(session_id, f'feature_used_{feature_name}', 
                                 details or {})

# Export the logger instance and key functions
__all__ = [
    'math_logger',
    'log_performance',
    'log_request_context',
    'log_startup',
    'log_shutdown',
    'log_session_created',
    'log_session_restored',
    'log_conversation_cleared',
    'log_message_sent',
    'log_feature_used'
]