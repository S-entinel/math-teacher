#!/usr/bin/env python3
"""
Database Migration Script for AI Math Teacher
Initializes the database and handles data migration from localStorage
"""

import os
import sys
import json
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path to import our modules
sys.path.append(str(Path(__file__).parent.parent))

from database import get_database, User, ChatSession, Message, Artifact
from db_service import get_db_service, DatabaseService
from logging_system import math_logger

def init_database():
    """Initialize the database with tables and default data"""
    print("🏗️  Initializing Math Teacher Database...")
    
    try:
        # Get database and create tables
        db = get_database()
        db.create_tables()
        print("✓ Database tables created successfully")
        
        # Initialize with default user if needed
        db.init_database()
        print("✓ Default user created")
        
        # Verify database structure
        with db.get_session() as session:
            user_count = session.query(User).count()
            session_count = session.query(ChatSession).count()
            message_count = session.query(Message).count()
            artifact_count = session.query(Artifact).count()
            
            print(f"📊 Database Status:")
            print(f"   Users: {user_count}")
            print(f"   Sessions: {session_count}")
            print(f"   Messages: {message_count}")
            print(f"   Artifacts: {artifact_count}")
        
        return True
        
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        math_logger.log_error(None, e, "init_database")
        return False

def migrate_from_localstorage_sample(sample_data: dict = None):
    """Migrate sample localStorage data to database for testing"""
    if sample_data is None:
        # Create sample data that matches localStorage format
        sample_data = {
            'chats': [
                ['chat_1703123456789_1', {
                    'id': 'chat_1703123456789_1',
                    'title': 'Quadratic Equations',
                    'sessionId': '550e8400-e29b-41d4-a716-446655440001',
                    'messages': [
                        {
                            'role': 'user',
                            'content': 'Help me solve x² + 5x + 6 = 0',
                            'timestamp': '2024-01-15T10:30:00.000Z'
                        },
                        {
                            'role': 'assistant',
                            'content': 'Right, a basic quadratic. We can factor this: (x + 2)(x + 3) = 0, so x = -2 or x = -3.',
                            'timestamp': '2024-01-15T10:30:15.000Z'
                        }
                    ],
                    'createdAt': '2024-01-15T10:30:00.000Z',
                    'lastActive': '2024-01-15T10:35:00.000Z'
                }],
                ['chat_1703123456790_2', {
                    'id': 'chat_1703123456790_2',
                    'title': 'Calculus Derivatives',
                    'sessionId': '550e8400-e29b-41d4-a716-446655440002',
                    'messages': [
                        {
                            'role': 'user',
                            'content': 'Graph the function f(x) = x²',
                            'timestamp': '2024-01-16T14:20:00.000Z'
                        },
                        {
                            'role': 'assistant',
                            'content': 'Obviously, that\'s a parabola. Here\'s the graph:\n\n<artifact>\n{\n  "type": "graph",\n  "title": "f(x) = x²",\n  "content": {\n    "function": "x^2",\n    "x_min": -5,\n    "x_max": 5\n  }\n}\n</artifact>',
                            'timestamp': '2024-01-16T14:20:30.000Z'
                        }
                    ],
                    'createdAt': '2024-01-16T14:20:00.000Z',
                    'lastActive': '2024-01-16T14:25:00.000Z'
                }]
            ],
            'activeChat': 'chat_1703123456790_2',
            'chatCounter': 2
        }
    
    print("📦 Migrating sample localStorage data...")
    
    try:
        db_service = get_db_service()
        
        # Get or create anonymous user
        user = db_service.get_or_create_user()
        print(f"✓ Using user: {user['id']}")
        
        # Migrate the data
        migration_result = db_service.migrate_localstorage_data(user['id'], sample_data)
        
        print(f"✓ Migration completed:")
        print(f"   Sessions created: {migration_result.get('sessions_created', 0)}")
        print(f"   Messages created: {migration_result.get('messages_created', 0)}")
        
        if migration_result.get('errors'):
            print(f"⚠️  Errors during migration:")
            for error in migration_result['errors']:
                print(f"   {error}")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        math_logger.log_error(None, e, "migrate_from_localstorage_sample")
        return False

def create_test_data():
    """Create some test data for development"""
    print("🧪 Creating test data...")
    
    try:
        db_service = get_db_service()
        
        # Get or create user
        user = db_service.get_or_create_user()
        
        # Create a few test sessions
        test_sessions = [
            {
                'title': 'Linear Algebra Basics',
                'messages': [
                    ('user', 'What is a matrix?'),
                    ('assistant', 'A matrix is a rectangular array of numbers. Think of it as a grid where you can store data systematically.')
                ]
            },
            {
                'title': 'Trigonometry Help',
                'messages': [
                    ('user', 'Help me understand sine and cosine'),
                    ('assistant', 'Right, the fundamental trig functions. Sine is opposite/hypotenuse, cosine is adjacent/hypotenuse in a right triangle.')
                ]
            },
            {
                'title': 'Graph Analysis',
                'messages': [
                    ('user', 'Graph f(x) = sin(x)'),
                    ('assistant', 'Obviously, that\'s a sine wave. Here you go:\n\n<artifact>\n{\n  "type": "graph",\n  "title": "Sine Function",\n  "content": {\n    "function": "sin(x)",\n    "x_min": -6.28,\n    "x_max": 6.28\n  }\n}\n</artifact>')
                ]
            }
        ]
        
        sessions_created = 0
        messages_created = 0
        artifacts_created = 0
        
        for session_data in test_sessions:
            # Create session
            session = db_service.create_chat_session(
                user_id=user['id'],
                title=session_data['title']
            )
            
            if session:
                sessions_created += 1
                
                # Add messages
                for role, content in session_data['messages']:
                    message = db_service.add_message(
                        session_id=session['session_id'],
                        role=role,
                        content=content
                    )
                    if message:
                        messages_created += 1
                
                # If there's an artifact in the content, create it
                for role, content in session_data['messages']:
                    if '<artifact>' in content and role == 'assistant':
                        # Extract artifact JSON (simplified)
                        try:
                            start = content.find('<artifact>') + 10
                            end = content.find('</artifact>')
                            artifact_json = content[start:end].strip()
                            artifact_data = json.loads(artifact_json)
                            
                            artifact = db_service.create_artifact(
                                session_id=session['session_id'],
                                artifact_type=artifact_data['type'],
                                title=artifact_data['title'],
                                content=artifact_data['content']
                            )
                            
                            if artifact:
                                artifacts_created += 1
                                
                        except json.JSONDecodeError:
                            pass  # Skip invalid artifacts
        
        print(f"✓ Test data created:")
        print(f"   Sessions: {sessions_created}")
        print(f"   Messages: {messages_created}")
        print(f"   Artifacts: {artifacts_created}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test data creation failed: {e}")
        math_logger.log_error(None, e, "create_test_data")
        return False

def show_database_stats():
    """Show current database statistics"""
    print("📊 Database Statistics:")
    
    try:
        db_service = get_db_service()
        stats = db_service.get_system_stats()
        
        if 'error' in stats:
            print(f"❌ Error getting stats: {stats['error']}")
            return
        
        print(f"   Total Users: {stats['total_users']}")
        print(f"   Total Sessions: {stats['total_sessions']}")
        print(f"   Total Messages: {stats['total_messages']}")
        print(f"   Total Artifacts: {stats['total_artifacts']}")
        print(f"   Active (24h): {stats['active_sessions_24h']}")
        print(f"   Archived: {stats['archived_sessions']}")
        print(f"   Avg Messages/Session: {stats['avg_messages_per_session']}")
        
        if stats.get('artifacts_by_type'):
            print("   Artifacts by Type:")
            for artifact_type, count in stats['artifacts_by_type'].items():
                print(f"     {artifact_type}: {count}")
        
    except Exception as e:
        print(f"❌ Failed to get stats: {e}")

def cleanup_database(days_old: int = 90):
    """Clean up old data"""
    print(f"🧹 Cleaning up data older than {days_old} days...")
    
    try:
        db_service = get_db_service()
        result = db_service.cleanup_old_data(days_old)
        
        if 'error' in result:
            print(f"❌ Cleanup failed: {result['error']}")
            return False
        
        print(f"✓ Cleanup completed:")
        print(f"   Sessions deleted: {result['deleted_sessions']}")
        print(f"   Messages deleted: {result['deleted_messages']}")
        print(f"   Artifacts deleted: {result['deleted_artifacts']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        math_logger.log_error(None, e, "cleanup_database")
        return False

def main():
    """Main migration script"""
    print("=" * 60)
    print("🧮 AI Math Teacher Database Migration")
    print("=" * 60)
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Database migration and setup')
    parser.add_argument('--init', action='store_true', help='Initialize database')
    parser.add_argument('--migrate-sample', action='store_true', help='Migrate sample localStorage data')
    parser.add_argument('--test-data', action='store_true', help='Create test data')
    parser.add_argument('--stats', action='store_true', help='Show database statistics')
    parser.add_argument('--cleanup', type=int, metavar='DAYS', help='Clean up data older than N days')
    parser.add_argument('--all', action='store_true', help='Run all setup steps')
    
    args = parser.parse_args()
    
    success = True
    
    # Run all steps if --all is specified
    if args.all:
        args.init = True
        args.migrate_sample = True
        args.test_data = True
        args.stats = True
    
    # Initialize database
    if args.init:
        success &= init_database()
        print()
    
    # Migrate sample data
    if args.migrate_sample:
        success &= migrate_from_localstorage_sample()
        print()
    
    # Create test data
    if args.test_data:
        success &= create_test_data()
        print()
    
    # Show statistics
    if args.stats:
        show_database_stats()
        print()
    
    # Clean up old data
    if args.cleanup:
        success &= cleanup_database(args.cleanup)
        print()
    
    # If no arguments, show help
    if not any(vars(args).values()):
        parser.print_help()
        print("\nQuick start: python init_database.py --all")
    
    print("=" * 60)
    if success:
        print("✅ Migration completed successfully!")
    else:
        print("❌ Migration completed with errors. Check logs for details.")
    print("=" * 60)

if __name__ == "__main__":
    main()