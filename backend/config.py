# backend/config.py
import os
from pydantic import BaseSettings

class Settings(BaseSettings):
    # Database settings
    database_url: str = "postgresql://postgres:HeLL99%40me@localhost:5432/manga_studio"
    
    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug_mode: bool = True
    
    # Image generation settings
    pollinations_base_url: str = "https://image.pollinations.ai"
    image_generation_timeout: int = 30
    rate_limit_delay: float = 1.0  # Seconds between requests
    max_retries: int = 3
    
    # CORS settings
    allowed_origins: list = ["*"]  # Configure for production
    
    class Config:
        env_file = ".env"

settings = Settings()

# backend/startup.py
import asyncio
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from main import app
from db_connect import engine, SessionLocal
import models
import uvicorn
import logging

async def initialize_database():
    """Initialize database with tables and sample data if needed"""
    try:
        # Create all tables
        models.Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
        
        # Check if we need sample data
        db = SessionLocal()
        character_count = db.query(models.Character).count()
        
        if character_count == 0:
            print("📝 Adding sample character data...")
            
            # Create a sample character
            sample_character = models.Character(
                char_code="C-0001",
                name="Akira Tanaka",
                description="A young warrior with spiky black hair and determined eyes",
                age=17,
                height_cm=175
            )
            
            db.add(sample_character)
            db.commit()
            print("✅ Sample character added")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        sys.exit(1)

async def test_image_generation():
    """Test the image generation service"""
    try:
        from character_routes import generate_image_with_pollinations
        
        print("🎨 Testing image generation service...")
        test_prompt = "manga style character, test character, anime art style"
        
        result = await generate_image_with_pollinations(test_prompt, timeout=10)
        
        if result and result.startswith("data:image"):
            print("✅ Image generation service is working")
            return True
        else:
            print("⚠️  Image generation service returned unexpected result")
            return False
            
    except Exception as e:
        print(f"⚠️  Image generation service test failed: {e}")
        print("📝 The API will still work, but image generation may be limited")
        return False

async def startup_checks():
    """Run all startup checks"""
    print("🚀 Starting Manga Studio Backend...")
    print("=" * 50)
    
    await initialize_database()
    await test_image_generation()
    
    print("=" * 50)
    print("✅ Startup checks completed")
    print(f"📖 API Documentation: http://localhost:8000/api/docs")
    print(f"🔄 Health Check: http://localhost:8000/health")
    print(f"👥 Characters: http://localhost:8000/characters")

def run_server():
    """Run the FastAPI server with startup checks"""
    try:
        # Run startup checks
        asyncio.run(startup_checks())
        
        # Start the server
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
        
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server startup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_server()

# backend/requirements.txt (updated)
"""
annotated-types==0.7.0
anyio==4.10.0
click==8.2.1
colorama==0.4.6
fastapi==0.116.1
greenlet==3.2.4
h11==0.16.0
httpx==0.27.0  # Added for HTTP requests to image API
idna==3.10
psycopg2-binary==2.9.10
pydantic==2.11.7
pydantic_core==2.33.2
python-dotenv==1.1.1
sniffio==1.3.1
SQLAlchemy==2.0.43
starlette==0.47.3
typing-inspection==0.4.1
typing_extensions==4.15.0
uvicorn==0.35.0
pydantic-settings==2.0.3  # Added for settings management
"""

# backend/.env (environment variables template)
"""
# Database Configuration
DATABASE_URL=postgresql://postgres:HeLL99%40me@localhost:5432/manga_studio

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEBUG_MODE=true

# Image Generation Settings
POLLINATIONS_BASE_URL=https://image.pollinations.ai
IMAGE_GENERATION_TIMEOUT=30
RATE_LIMIT_DELAY=1.0
MAX_RETRIES=3

# CORS Settings (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080
"""