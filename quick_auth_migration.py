
#!/usr/bin/env python3
"""
Quick fix and migration script for authentication issues
"""

import sys
from pathlib import Path

# Add current directory to Python path
sys.path.append(str(Path(__file__).parent))

def run_quick_migration():
    """Run a quick migration to fix authentication issues"""
    print("🔧 Running quick authentication migration...")
    
    try:
        # Import and initialize database
        from database import get_database
        
        print("✓ Database imported successfully")
        
        # Get database and create tables
        db = get_database()
        db.create_tables()
        print("✓ Database tables ensured")
        
        # Test database connection
        with db.get_session() as session:
            from database import User
            user_count = session.query(User).count()
            print(f"✓ Database connection working - {user_count} users found")
        
        # Test auth service
        from auth_service import get_auth_service
        auth_service = get_auth_service()
        print("✓ Auth service imported successfully")
        
        # Create a test anonymous user
        test_user, test_token = auth_service.get_or_create_anonymous_user()
        print(f"✓ Anonymous user creation working - User ID: {test_user['id']}")
        
        print("\n✅ Quick migration completed successfully!")
        print("\nYou can now:")
        print("  1. Start the server: python main.py")
        print("  2. The authentication errors should be resolved")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False

def check_imports():
    """Check if all required modules can be imported"""
    print("🔍 Checking imports...")
    
    modules_to_check = [
        'database',
        'auth_service', 
        'logging_system',
        'sqlalchemy',
        'bcrypt',
        'jwt'
    ]
    
    for module in modules_to_check:
        try:
            __import__(module)
            print(f"✓ {module}")
        except ImportError as e:
            print(f"❌ {module}: {e}")
            return False
    
    print("✓ All imports successful")
    return True

def main():
    print("🧮 AI Math Teacher - Quick Authentication Fix")
    print("=" * 50)
    
    # Check imports first
    if not check_imports():
        print("\n❌ Import errors detected. Please install missing dependencies:")
        print("  pip install -r requirements.txt")
        return
    
    # Run migration
    success = run_quick_migration()
    
    if success:
        print("\n🎉 Authentication system is now ready!")
    else:
        print("\n💥 Migration failed. Check the error messages above.")

if __name__ == "__main__":
    main()