#!/usr/bin/env python3
"""
Authentication Migration Script for AI Math Teacher - FIXED VERSION
Migrates existing database to support authentication features
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import our modules
sys.path.append(str(Path(__file__).parent))

from database import get_database, User, ChatSession
from auth_service import get_auth_service
from logging_system import math_logger

def migrate_to_auth():
    """Migrate existing database to support authentication"""
    print("🔐 Migrating AI Math Teacher Database for Authentication...")
    print("=" * 60)
    
    try:
        # Get database and create new tables
        db = get_database()
        print("✓ Database connection established")
        
        # Create all tables (including new auth fields)
        db.create_tables()
        print("✓ Database schema updated with authentication support")
        
        # Migrate existing data
        with db.get_session() as session:
            # Check if we have any existing users without auth fields
            users_to_migrate = session.query(User).filter(
                User.account_type == None
            ).all()
            
            print(f"📊 Found {len(users_to_migrate)} users to migrate")
            
            for user in users_to_migrate:
                # Set default account type for existing users
                if user.email:
                    user.account_type = 'registered'
                    user.is_active = True
                    user.is_verified = False
                else:
                    user.account_type = 'anonymous'
                    user.is_active = True
                
                # Ensure user has session token
                if not user.session_token:
                    import uuid
                    user.session_token = str(uuid.uuid4())
                
                print(f"  ✓ Migrated user {user.id} ({user.account_type})")
            
            session.commit()
            print(f"✓ Migrated {len(users_to_migrate)} existing users")
            
            # Update session ownership for existing chat sessions
            orphaned_sessions = session.query(ChatSession).filter(
                ChatSession.user_id == None
            ).all()
            
            if orphaned_sessions:
                # Get or create default anonymous user for orphaned sessions
                default_user = session.query(User).filter(
                    User.account_type == 'anonymous'
                ).first()
                
                if not default_user:
                    default_user = User(
                        username=None,
                        email=None,
                        account_type='anonymous',
                        is_active=True,
                        preferences={
                            'theme': 'dark',
                            'auto_save_interval': 30
                        }
                    )
                    session.add(default_user)
                    session.flush()
                
                for chat_session in orphaned_sessions:
                    chat_session.user_id = default_user.id
                
                session.commit()
                print(f"✓ Assigned {len(orphaned_sessions)} orphaned sessions to default user")
            
        # Test authentication service
        auth_service = get_auth_service()
        test_user_dict, test_token = auth_service.get_or_create_anonymous_user()  # FIXED: This returns a dict
        print(f"✓ Authentication service working - test user {test_user_dict['id']}")  # FIXED: Use dict access
        
        # Show final stats
        with db.get_session() as session:
            total_users = session.query(User).count()
            registered_users = session.query(User).filter(User.account_type == 'registered').count()
            anonymous_users = session.query(User).filter(User.account_type == 'anonymous').count()
            total_sessions = session.query(ChatSession).count()
            
            print("\n📊 Migration Complete - Database Status:")
            print(f"   Total Users: {total_users}")
            print(f"   Registered Users: {registered_users}")
            print(f"   Anonymous Users: {anonymous_users}")
            print(f"   Total Sessions: {total_sessions}")
        
        print("\n✅ Authentication migration completed successfully!")
        print("\nNext steps:")
        print("  1. Update your .env file with JWT_SECRET_KEY if needed")
        print("  2. Start the server: python main.py")
        print("  3. Authentication will be available at /auth/* endpoints")
        print("  4. Frontend will automatically support both anonymous and registered users")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        math_logger.log_error(None, e, "migrate_to_auth")
        return False

def create_test_authenticated_user():
    """Create a test authenticated user for testing"""
    print("\n🧪 Creating test authenticated user...")
    
    try:
        auth_service = get_auth_service()
        
        # Check if test user already exists
        with auth_service.get_session() as session:
            from database import get_user_by_email
            existing_user = get_user_by_email(session, "test@mathteacher.ai")
            if existing_user:
                print("✓ Test user already exists: test@mathteacher.ai")
                return True
        
        # Create test user
        from auth_service import UserRegisterRequest
        test_request = UserRegisterRequest(
            email="test@mathteacher.ai",
            password="testpass123",
            display_name="Test User"
        )
        
        user, tokens = auth_service.register_user(test_request)
        
        print(f"✓ Created test user: {user.email}")
        print(f"  Display Name: {user.display_name}")
        print(f"  Account Type: {user.account_type}")
        print(f"  User ID: {user.id}")
        print("\n🔑 Test Login Credentials:")
        print("  Email: test@mathteacher.ai")
        print("  Password: testpass123")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to create test user: {e}")
        return False

def verify_migration():
    """Verify that migration was successful"""
    print("\n🔍 Verifying migration...")
    
    try:
        # Test database connection
        db = get_database()
        with db.get_session() as session:
            # Check that all tables exist and have expected structure
            user_count = session.query(User).count()
            session_count = session.query(ChatSession).count()
            
            print(f"✓ Database accessible with {user_count} users and {session_count} sessions")
        
        # Test authentication service
        auth_service = get_auth_service()
        
        # Test anonymous user creation
        anon_user_dict, anon_token = auth_service.get_or_create_anonymous_user()  # FIXED: Returns dict
        print(f"✓ Anonymous user creation working: {anon_user_dict['account_type']}")  # FIXED: Use dict access
        
        # Test token validation
        validated_user = auth_service.validate_session_token(anon_token)
        if validated_user and validated_user['id'] == anon_user_dict['id']:  # FIXED: Use dict access
            print("✓ Session token validation working")
        else:
            print("❌ Session token validation failed")
            return False
        
        print("✅ All verification tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        return False

def show_auth_features():
    """Show available authentication features"""
    print("\n🔐 Authentication Features Available:")
    print("=" * 50)
    
    print("\n📱 Frontend Features:")
    print("  • Sign In / Sign Up modals with terminal styling")
    print("  • User profile menu in header")
    print("  • Anonymous user upgrade prompts")
    print("  • Session token management")
    print("  • Password strength validation")
    print("  • Remember me functionality")
    
    print("\n🌐 API Endpoints:")
    print("  • POST /auth/register - User registration")
    print("  • POST /auth/login - User authentication")
    print("  • POST /auth/logout - User logout")
    print("  • GET /auth/me - Get user profile")
    print("  • PUT /auth/profile - Update user profile")
    print("  • POST /auth/password-reset - Request password reset")
    print("  • POST /auth/change-password - Change password")
    print("  • POST /auth/anonymous - Create anonymous user")
    print("  • POST /auth/validate-session - Validate session token")
    
    print("\n💾 Database Features:")
    print("  • Enhanced User model with authentication fields")
    print("  • Session ownership and access control")
    print("  • Anonymous to registered user migration")
    print("  • Password hashing with bcrypt")
    print("  • JWT token management")
    
    print("\n🔒 Security Features:")
    print("  • Secure password hashing")
    print("  • JWT access and refresh tokens")
    print("  • Session ownership validation")
    print("  • Password reset tokens with expiry")
    print("  • Email verification system (ready for implementation)")
    
    print("\n⚙️  Configuration:")
    print("  • Set JWT_SECRET_KEY in .env for production")
    print("  • Token expiry: 24 hours (configurable)")
    print("  • Refresh token: 30 days (configurable)")
    print("  • Backward compatible with existing anonymous sessions")

def main():
    """Main migration function"""
    print("🔐 AI Math Teacher Authentication Migration")
    print("=" * 50)
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Authentication migration and setup')
    parser.add_argument('--migrate', action='store_true', help='Run database migration')
    parser.add_argument('--test-user', action='store_true', help='Create test authenticated user')
    parser.add_argument('--verify', action='store_true', help='Verify migration')
    parser.add_argument('--show-features', action='store_true', help='Show authentication features')
    parser.add_argument('--all', action='store_true', help='Run all migration steps')
    
    args = parser.parse_args()
    
    success = True
    
    # Run all steps if --all is specified
    if args.all:
        args.migrate = True
        args.test_user = True
        args.verify = True
        args.show_features = True
    
    # Run migration
    if args.migrate:
        success &= migrate_to_auth()
        print()
    
    # Create test user
    if args.test_user:
        success &= create_test_authenticated_user()
        print()
    
    # Verify migration
    if args.verify:
        success &= verify_migration()
        print()
    
    # Show features
    if args.show_features:
        show_auth_features()
        print()
    
    # If no arguments, show help
    if not any(vars(args).values()):
        parser.print_help()
        print("\n🚀 Quick start: python auth_migration.py --all")
    
    print("=" * 50)
    if success:
        print("✅ Authentication system ready!")
        print("\n🎉 You can now:")
        print("  1. Start the server: python main.py")
        print("  2. Open your browser to the app")
        print("  3. Click 'SIGN IN' to test authentication")
        print("  4. Use test@mathteacher.ai / testpass123 for testing")
    else:
        print("❌ Migration completed with errors. Check logs for details.")
    print("=" * 50)

if __name__ == "__main__":
    main()