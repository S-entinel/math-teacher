#!/usr/bin/env python3
"""
Quick database setup script for AI Math Teacher
Run this to initialize the database with sample data
"""

import sys
import os
from pathlib import Path

# Add current directory to Python path
sys.path.append(str(Path(__file__).parent))

def setup_database():
    """Setup database with error handling"""
    print("🧮 Setting up AI Math Teacher Database...")
    print("=" * 50)
    
    try:
        # Import after adding to path
        from database import get_database
        from db_service import get_db_service
        
        print("📦 Initializing database...")
        
        # Initialize database
        db = get_database()
        print("✓ Database connection established")
        
        # Create tables
        db.create_tables()
        print("✓ Database tables created")
        
        # Initialize with default data
        db.init_database()
        print("✓ Default user created")
        
        # Get service and create sample data
        db_service = get_db_service()
        
        # Get or create user
        user = db_service.get_or_create_user()
        print(f"✓ User ready: {user['id']}")
        
        # Create a sample session
        sample_session = db_service.create_chat_session(
            user_id=user['id'],
            title="Welcome to Math Teacher"
        )
        
        if sample_session:
            print(f"✓ Sample session created: {sample_session['session_id'][:8]}...")
            
            # Add welcome messages
            db_service.add_message(
                session_id=sample_session['session_id'],
                role="assistant",
                content="Right, I'm your AI math teacher. Ask me whatever mathematical questions you have - I'll give you clear, direct explanations. Try to keep up."
            )
            
            db_service.add_message(
                session_id=sample_session['session_id'],
                role="user", 
                content="Hello! Can you help me with quadratic equations?"
            )
            
            db_service.add_message(
                session_id=sample_session['session_id'],
                role="assistant",
                content="Obviously, quadratic equations. They're in the form $ax^2 + bx + c = 0$. What specifically do you need help with - solving them, graphing them, or understanding their properties?"
            )
            
            print("✓ Sample conversation added")
        
        # Show final stats
        stats = db_service.get_system_stats()
        print("\n📊 Database Status:")
        print(f"   Users: {stats['total_users']}")
        print(f"   Sessions: {stats['total_sessions']}")
        print(f"   Messages: {stats['total_messages']}")
        
        print("\n✅ Database setup completed successfully!")
        print("\nYou can now:")
        print("  1. Start the server: python main.py")
        print("  2. Open index.html in your browser")
        print("  3. Your conversations will be saved to the database")
        
        return True
        
    except ImportError as e:
        print(f"❌ Missing dependencies: {e}")
        print("\nPlease install required packages:")
        print("  pip install -r requirements.txt")
        return False
        
    except Exception as e:
        print(f"❌ Setup failed: {e}")
        print("\nTroubleshooting:")
        print("  1. Make sure you're in the correct directory")
        print("  2. Check that all Python files are present")
        print("  3. Verify requirements.txt dependencies are installed")
        return False

def check_requirements():
    """Check if required packages are available"""
    required_packages = [
        'sqlalchemy',
        'fastapi', 
        'google.generativeai'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print("❌ Missing required packages:")
        for pkg in missing_packages:
            print(f"   {pkg}")
        print("\nInstall with: pip install -r requirements.txt")
        return False
    
    return True

def main():
    """Main setup function"""
    print("🧮 AI Math Teacher Database Setup")
    print("=" * 40)
    
    # Check requirements first
    if not check_requirements():
        sys.exit(1)
    
    # Setup database
    if setup_database():
        print("\n🎉 Setup completed! Ready to start teaching math.")
        sys.exit(0)
    else:
        print("\n💥 Setup failed. Check errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()