#!/usr/bin/env python3
"""
AI Context Migration Script
Adds AI context storage columns to existing database
"""

import sys
from pathlib import Path
from sqlalchemy import text

# Add parent directory to path to import our modules
sys.path.append(str(Path(__file__).parent))

from database import get_database
from logging_system import math_logger

def migrate_ai_context():
    """Add AI context columns to existing database"""
    print("🤖 Adding AI Context Support to Database...")
    print("=" * 50)
    
    try:
        db = get_database()
        
        with db.get_session() as session:
            # Check if columns already exist
            try:
                result = session.execute(text("PRAGMA table_info(chat_sessions)"))
                columns = [row[1] for row in result.fetchall()]
                
                has_ai_context = 'ai_context' in columns
                has_last_ai_message_id = 'last_ai_message_id' in columns
                
                if has_ai_context and has_last_ai_message_id:
                    print("✓ AI context columns already exist")
                    return True
                
                # Add missing columns
                if not has_ai_context:
                    session.execute(text("""
                        ALTER TABLE chat_sessions 
                        ADD COLUMN ai_context TEXT DEFAULT '{}'
                    """))
                    print("✓ Added ai_context column")
                
                if not has_last_ai_message_id:
                    session.execute(text("""
                        ALTER TABLE chat_sessions 
                        ADD COLUMN last_ai_message_id TEXT
                    """))
                    print("✓ Added last_ai_message_id column")
                
                session.commit()
                
                # Verify the migration
                result = session.execute(text("SELECT COUNT(*) FROM chat_sessions"))
                session_count = result.fetchone()[0]
                
                print(f"✓ Migration completed successfully")
                print(f"  Database has {session_count} existing sessions")
                print(f"  All sessions will now support AI context persistence")
                
                return True
                
            except Exception as e:
                print(f"❌ Migration failed: {e}")
                session.rollback()
                return False
                
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def test_ai_context():
    """Test AI context functionality"""
    print("\n🧪 Testing AI Context Functionality...")
    
    try:
        from db_service import get_db_service
        
        db_service = get_db_service()
        
        # Create a test session
        user = db_service.get_or_create_user()
        session = db_service.create_chat_session(
            user_id=user['id'],
            title="AI Context Test Session"
        )
        
        session_id = session['session_id']
        
        # Test storing AI context
        test_context = [
            {
                'role': 'user',
                'parts': [{'text': 'What is 2+2?'}]
            },
            {
                'role': 'model',
                'parts': [{'text': 'Obviously, 2+2 = 4. Basic arithmetic.'}]
            }
        ]
        
        success = db_service.store_ai_context(session_id, test_context)
        if success:
            print("✓ AI context storage working")
        else:
            print("❌ AI context storage failed")
            return False
        
        # Test retrieving AI context
        retrieved_context = db_service.get_ai_context(session_id)
        if retrieved_context == test_context:
            print("✓ AI context retrieval working")
        else:
            print("❌ AI context retrieval failed")
            return False
        
        # Test clearing AI context
        clear_success = db_service.clear_ai_context(session_id)
        if clear_success:
            print("✓ AI context clearing working")
        else:
            print("❌ AI context clearing failed")
            return False
        
        # Clean up test session
        db_service.delete_chat_session(session_id)
        print("✓ Test session cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Testing failed: {e}")
        return False

def main():
    """Main migration function"""
    print("🤖 AI Context Persistence Migration")
    print("=" * 40)
    
    # Run migration
    migration_success = migrate_ai_context()
    
    if migration_success:
        # Test functionality
        test_success = test_ai_context()
        
        if test_success:
            print("\n✅ AI Context Migration Completed Successfully!")
            print("\n🎉 Your application now supports:")
            print("  • AI conversation context persists across device switches")
            print("  • Users can seamlessly continue conversations on any device")
            print("  • Server restarts no longer lose AI conversation context")
            print("  • Multi-device experience is now truly seamless")
            
            print("\n🔄 No changes needed to your frontend!")
            print("  • All existing functionality works exactly the same")
            print("  • Users will automatically get the enhanced experience")
            print("  • The AI will remember conversation context across devices")
        else:
            print("\n⚠️  Migration completed but tests failed")
            print("Check the error messages above for troubleshooting")
    else:
        print("\n❌ Migration failed")
        print("Check the error messages above and try again")

if __name__ == "__main__":
    main()