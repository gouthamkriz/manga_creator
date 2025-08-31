# backend/app.py
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from db_connect import SessionLocal, engine
import httpx
import asyncio
import base64
from io import BytesIO
import json

# Create DB tables if not exists
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Manga Studio API", version="1.0.0")

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Manga Gen AI backend is running 🚀"}

# Dependency for DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Character management endpoints
@app.get("/characters", response_model=List[schemas.CharacterResponse])
def get_characters(db: Session = Depends(get_db)):
    return db.query(models.Character).all()

@app.post("/characters", response_model=schemas.CharacterResponse)
def create_character(character: schemas.CharacterCreate, db: Session = Depends(get_db)):
    # Generate char_code dynamically like C-000X
    count = db.query(models.Character).count() + 1
    char_code = f"C-{count:04d}"

    new_character = models.Character(
        char_code=char_code,
        name=character.name,
        description=character.description,
        age=character.age,
        height_cm=character.height_cm,
        avatar_url=character.avatar_url,
    )
    db.add(new_character)
    db.commit()
    db.refresh(new_character)
    return new_character

@app.get("/characters/{character_id}", response_model=schemas.CharacterResponse)
def get_character(character_id: int, db: Session = Depends(get_db)):
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return character

@app.put("/characters/{character_id}", response_model=schemas.CharacterResponse)
def update_character(character_id: int, character: schemas.CharacterUpdate, db: Session = Depends(get_db)):
    db_character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not db_character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    for field, value in character.dict(exclude_unset=True).items():
        setattr(db_character, field, value)
    
    db.commit()
    db.refresh(db_character)
    return db_character

@app.delete("/characters/{character_id}")
def delete_character(character_id: int, db: Session = Depends(get_db)):
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    db.delete(character)
    db.commit()
    return {"message": "Character deleted successfully"}

# Image generation with Pollinations.AI
@app.post("/characters/generate-variants")
async def generate_character_variants(request: schemas.CharacterGenerationRequest):
    """
    Generate multiple manga character variants using Pollinations.AI
    """
    try:
        variants = []
        
        # Create manga-style prompts with different variations
        base_prompt = f"manga style character, {request.name}"
        if request.description:
            base_prompt += f", {request.description}"
        if request.age:
            base_prompt += f", {request.age} years old"
        
        # Different style variations for manga characters
        style_variations = [
            "anime style, clean lines, cel shading",
            "manga style, black and white, detailed lineart", 
            "anime portrait, colorful, studio lighting",
            "manga character design, reference sheet style",
            "anime art style, vibrant colors, detailed eyes",
            "manga illustration, soft colors, gentle expression"
        ]
        
        # Generate 6 variants concurrently
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = []
            
            for i, style in enumerate(style_variations):
                full_prompt = f"{base_prompt}, {style}, high quality"
                # Pollinations.AI simple URL-based API
                url = f"https://image.pollinations.ai/prompt/{full_prompt}"
                tasks.append(client.get(url))
            
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            for i, response in enumerate(responses):
                if isinstance(response, Exception):
                    print(f"Error generating variant {i}: {response}")
                    continue
                    
                if response.status_code == 200:
                    # Convert image to base64 for frontend display
                    image_data = response.content
                    base64_image = base64.b64encode(image_data).decode()
                    
                    variants.append({
                        "variant_id": i + 1,
                        "image_url": f"data:image/png;base64,{base64_image}",
                        "style": style_variations[i],
                        "prompt_used": f"{base_prompt}, {style_variations[i]}"
                    })
        
        return {
            "character_name": request.name,
            "variants": variants,
            "total_generated": len(variants)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

@app.post("/characters/{character_id}/generate-avatar")
async def generate_character_avatar(character_id: int, style_preference: str = "anime style", db: Session = Depends(get_db)):
    """
    Generate a single avatar for an existing character
    """
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    try:
        # Build prompt from character data
        prompt = f"manga style character, {character.name}"
        if character.description:
            prompt += f", {character.description}"
        if character.age:
            prompt += f", {character.age} years old"
        
        prompt += f", {style_preference}, high quality, character portrait"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"https://image.pollinations.ai/prompt/{prompt}"
            response = await client.get(url)
            
            if response.status_code == 200:
                image_data = response.content
                base64_image = base64.b64encode(image_data).decode()
                avatar_url = f"data:image/png;base64,{base64_image}"
                
                # Update character with new avatar
                character.avatar_url = avatar_url
                db.commit()
                
                return {
                    "character_id": character_id,
                    "avatar_url": avatar_url,
                    "prompt_used": prompt
                }
            else:
                raise HTTPException(status_code=500, detail="Failed to generate image")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Avatar generation failed: {str(e)}")

# Enhanced character search and filtering
@app.get("/characters/search")
def search_characters(
    name: Optional[str] = None,
    min_age: Optional[int] = None,
    max_age: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Character)
    
    if name:
        query = query.filter(models.Character.name.ilike(f"%{name}%"))
    if min_age:
        query = query.filter(models.Character.age >= min_age)
    if max_age:
        query = query.filter(models.Character.age <= max_age)
    
    return query.all()

# Bulk operations
@app.post("/characters/bulk-generate")
async def bulk_generate_characters(request: schemas.BulkGenerationRequest):
    """
    Generate multiple characters at once with their avatars
    """
    try:
        results = []
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            for char_data in request.characters:
                # Build prompt
                prompt = f"manga style character, {char_data.name}"
                if char_data.description:
                    prompt += f", {char_data.description}"
                if char_data.age:
                    prompt += f", {char_data.age} years old"
                prompt += ", anime art style, character design, high quality"
                
                # Generate image
                url = f"https://image.pollinations.ai/prompt/{prompt}"
                response = await client.get(url)
                
                if response.status_code == 200:
                    image_data = response.content
                    base64_image = base64.b64encode(image_data).decode()
                    avatar_url = f"data:image/png;base64,{base64_image}"
                    
                    results.append({
                        "name": char_data.name,
                        "description": char_data.description,
                        "age": char_data.age,
                        "height_cm": char_data.height_cm,
                        "avatar_url": avatar_url,
                        "generated": True
                    })
                else:
                    results.append({
                        "name": char_data.name,
                        "description": char_data.description,
                        "age": char_data.age,
                        "height_cm": char_data.height_cm,
                        "avatar_url": None,
                        "generated": False,
                        "error": "Image generation failed"
                    })
                
                # Small delay to be respectful to the free API
                await asyncio.sleep(1)
        
        return {"results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk generation failed: {str(e)}")

# Health check for the image generation service
@app.get("/health/image-generation")
async def check_image_generation_health():
    """
    Check if Pollinations.AI is responsive
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            test_url = "https://image.pollinations.ai/prompt/test%20image"
            response = await client.head(test_url)
            return {
                "service": "Pollinations.AI",
                "status": "healthy" if response.status_code == 200 else "degraded",
                "response_time_ms": response.elapsed.total_seconds() * 1000
            }
    except Exception as e:
        return {
            "service": "Pollinations.AI", 
            "status": "unhealthy",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)