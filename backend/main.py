# backend/main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import models
from db_connect import engine
import logging
from sqlalchemy import func  # Added import for func

# Import route modules
from character_routes import router as character_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="Manga Studio API",
    description="Backend API for manga character and story creation with AI image generation",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(character_router)

@app.get("/")
async def root():
    return {
        "message": "Manga Studio API is running",
        "version": "1.0.0",
        "docs": "/api/docs",
        "features": [
            "Character creation with AI image generation",
            "Costume and age state management", 
            "Bulk character operations",
            "Character search and analytics"
        ]
    }

@app.get("/health")
async def health_check():
    """Basic health check endpoint"""
    try:
        # Test database connection
        from db_connect import SessionLocal
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": func.now()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Enable auto-reload during development
        log_level="info"
    )