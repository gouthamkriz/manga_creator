# backend/character_routes.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import models, schemas
from db_connect import SessionLocal
import httpx
import asyncio
import base64
import time
from urllib.parse import quote
import logging
from sqlalchemy.exc import IntegrityError # Import IntegrityError

router = APIRouter(prefix="/characters", tags=["characters"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def generate_code(prefix: str, db: Session, model_class):
    """
    Generate unique codes like C-0001, CO-0001, etc., with retry logic for concurrency.
    """
    max_retries = 5
    for attempt in range(max_retries):
        try:
            # Use a subquery to get the max existing number for the prefix
            # This is more robust than a simple count, especially if records are deleted
            last_code_query = db.query(model_class.char_code).filter(
                model_class.char_code.like(f"{prefix}-%")
            ).order_by(model_class.char_code.desc()).first()

            if last_code_query and last_code_query[0]:
                try:
                    last_number = int(last_code_query[0].split('-')[-1])
                except ValueError:
                    last_number = 0 # Fallback if code format is unexpected
            else:
                last_number = 0

            new_number = last_number + 1
            new_code = f"{prefix}-{new_number:04d}"
            
            # Check if the code already exists before attempting to use it
            # This is a pre-check, but the unique constraint is the ultimate guard
            if db.query(model_class).filter(model_class.char_code == new_code).first():
                # If it exists, increment and try again in the next loop iteration
                continue 
            
            return new_code
        except Exception as e:
            logging.warning(f"Attempt {attempt + 1} to generate code failed: {e}")
            await asyncio.sleep(0.1 * (attempt + 1)) # Exponential backoff
    
    raise Exception(f"Failed to generate unique code after {max_retries} attempts for prefix {prefix}")


async def generate_image_with_pollinations(prompt: str, timeout: int = 30) -> str:
    """
    Generate image using Pollinations.AI API
    Returns base64 encoded image data URL
    """
    try:
        encoded_prompt = quote(prompt)
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            
            if response.status_code == 200:
                image_data = response.content
                base64_image = base64.b64encode(image_data).decode()
                return f"data:image/png;base64,{base64_image}"
            else:
                raise Exception(f"API returned status {response.status_code}")
                
    except Exception as e:
        logging.error(f"Image generation failed: {e}")
        raise Exception(f"Image generation failed: {str(e)}")

@router.get("/", response_model=List[schemas.CharacterResponse])
async def get_characters(db: Session = Depends(get_db)):
    """Get all characters"""
    return db.query(models.Character).all()

@router.get("/{character_id}", response_model=schemas.CharacterFullResponse)
async def get_character(character_id: int, db: Session = Depends(get_db)):
    """Get character with all related data"""
    character = db.query(models.Character).options(
        joinedload(models.Character.costumes),
        joinedload(models.Character.age_states),
        joinedload(models.Character.changes)
    ).filter(models.Character.id == character_id).first()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return character

@router.post("/", response_model=schemas.CharacterResponse)
async def create_character(character: schemas.CharacterCreate, db: Session = Depends(get_db)):
    """Create a new character"""
    max_retries = 5
    for attempt in range(max_retries):
        try:
            char_code = await generate_code("C", db, models.Character) # Await the async function

            new_character = models.Character(
                char_code=char_code,
                name=character.name,
                description=character.description,
                age=character.age,
                height_cm=character.height_cm,
                image_url=character.image_url,
            )
            db.add(new_character)
            db.commit()
            db.refresh(new_character)
            return new_character
        except IntegrityError as e:
            db.rollback() # Rollback the transaction on unique violation
            logging.warning(f"IntegrityError on character creation (attempt {attempt + 1}): {e}. Retrying...")
            await asyncio.sleep(0.1 * (attempt + 1)) # Exponential backoff
        except Exception as e:
            db.rollback() # Rollback for other errors too
            raise HTTPException(status_code=500, detail=f"Failed to create character: {str(e)}")
    
    raise HTTPException(status_code=500, detail="Failed to create character after multiple retries due to unique code generation conflict.")


@router.post("/generate-variants", response_model=schemas.CharacterGenerationResponse)
async def generate_character_variants(request: schemas.CharacterGenerationRequest):
    """Generate multiple manga character variants using AI"""
    try:
        variants = []
        
        # Build base prompt
        base_prompt = f"manga style character portrait, {request.name}"
        if request.description:
            base_prompt += f", {request.description}"
        if request.age:
            base_prompt += f", {request.age} years old"
        
        # Different manga style variations
        style_variations = [
            "anime style, clean cel shading, bright colors, detailed eyes",
            "manga style, black and white lineart, high contrast", 
            "anime portrait, soft lighting, pastel colors, gentle expression",
            "manga character sheet, multiple angles, reference design",
            "anime art style, dynamic pose, vibrant background",
            "manga illustration, traditional style, detailed shading"
        ]
        
        # Generate variants with error handling
        generation_tasks = []
        for i, style in enumerate(style_variations):
            full_prompt = f"{base_prompt}, {style}, high quality, detailed"
            generation_tasks.append(generate_image_with_pollinations(full_prompt))
        
        # Process results
        results = await asyncio.gather(*generation_tasks, return_exceptions=True)
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logging.warning(f"Variant {i+1} generation failed: {result}")
                continue
            
            variants.append({
                "variant_id": i + 1,
                "image_url": result,
                "style": style_variations[i],
                "prompt_used": f"{base_prompt}, {style_variations[i]}"
            })

        if not variants:
            raise HTTPException(status_code=500, detail="All image generation attempts failed")

        return {
            "character_name": request.name,
            "variants": variants,
            "total_generated": len(variants)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Character generation failed: {str(e)}")

@router.post("/{character_id}/generate-avatar", response_model=schemas.AvatarGenerationResponse)
async def generate_character_avatar(
    character_id: int, 
    style_preference: str = "anime style", 
    db: Session = Depends(get_db)
):
    """Generate a new avatar for existing character"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    try:
        # Build prompt from character data
        prompt = f"manga style character portrait, {character.name}"
        if character.description:
            prompt += f", {character.description}"
        if character.age:
            prompt += f", {character.age} years old"
        
        prompt += f", {style_preference}, high quality, character design"
        
        # Generate image
        start_time = time.time()
        image_url = await generate_image_with_pollinations(prompt)
        generation_time = time.time() - start_time
        
        # Update character
        character.image_url = image_url
        # character.generation_prompt = prompt # This column was removed from the model
        db.commit()
        
        # Log generation history
        history = models.GenerationHistory(
            entity_type="character",
            entity_id=character_id,
            prompt_used=prompt,
            generation_time_seconds=generation_time,
            success=True
        )
        db.add(history)
        db.commit()
        
        return {
            "character_id": character_id,
            "image_url": image_url,
            "prompt_used": prompt
        }
        
    except Exception as e:
        # Log failed generation
        history = models.GenerationHistory(
            entity_type="character",
            entity_id=character_id,
            prompt_used=prompt if 'prompt' in locals() else "Failed to build prompt",
            success=False,
            error_message=str(e)
        )
        db.add(history)
        db.commit()
        
        raise HTTPException(status_code=500, detail=f"Avatar generation failed: {str(e)}")

# Costume management with image generation
@router.post("/{character_id}/costumes", response_model=schemas.CostumeResponse)
async def create_costume(
    character_id: int, 
    costume: schemas.CostumeCreate, 
    generate_image: bool = True,
    db: Session = Depends(get_db)
):
    """Create a new costume for a character with optional image generation"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    max_retries = 5
    for attempt in range(max_retries):
        try:
            costume_code = await generate_code("CO", db, models.Costume) # Await the async function
            
            new_costume = models.Costume(
                costume_code=costume_code,
                character_id=character_id,
                name=costume.name,
                description=costume.description,
                is_default=costume.is_default
            )
            
            if generate_image and costume.description:
                try:
                    prompt = f"manga style character, {character.name}, wearing {costume.description}, {costume.name}, anime art style"
                    if character.age:
                        prompt += f", {character.age} years old"
                    
                    new_costume.image_url = await generate_image_with_pollinations(prompt)
                except Exception as e:
                    logging.warning(f"Costume image generation failed: {e}")
            
            db.add(new_costume)
            db.commit()
            db.refresh(new_costume)
            return new_costume
        except IntegrityError as e:
            db.rollback()
            logging.warning(f"IntegrityError on costume creation (attempt {attempt + 1}): {e}. Retrying...")
            await asyncio.sleep(0.1 * (attempt + 1))
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create costume: {str(e)}")
    
    raise HTTPException(status_code=500, detail="Failed to create costume after multiple retries due to unique code generation conflict.")


@router.get("/{character_id}/costumes", response_model=List[schemas.CostumeResponse])
async def get_character_costumes(character_id: int, db: Session = Depends(get_db)):
    """Get all costumes for a character"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    return db.query(models.Costume).filter(models.Costume.character_id == character_id).all()

# Age state management
@router.post("/{character_id}/age-states", response_model=schemas.AgeStateResponse)
async def create_age_state(
    character_id: int,
    age_state: schemas.AgeStateCreate,
    generate_image: bool = True,
    db: Session = Depends(get_db)
):
    """Create a new age state for a character"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    max_retries = 5
    for attempt in range(max_retries):
        try:
            age_code = await generate_code("A", db, models.AgeState) # Await the async function
            
            new_age_state = models.AgeState(
                age_code=age_code,
                character_id=character_id,
                age=age_state.age,
                notes=age_state.notes
            )
            
            if generate_image:
                try:
                    prompt = f"manga style character, {character.name}, {age_state.age} years old"
                    if character.description:
                        prompt += f", {character.description}"
                    if age_state.notes:
                        prompt += f", {age_state.notes}"
                    prompt += ", anime art style, age progression"
                    
                    new_age_state.image_url = await generate_image_with_pollinations(prompt)
                except Exception as e:
                    logging.warning(f"Age state image generation failed: {e}")
            
            db.add(new_age_state)
            db.commit()
            db.refresh(new_age_state)
            return new_age_state
        except IntegrityError as e:
            db.rollback()
            logging.warning(f"IntegrityError on age state creation (attempt {attempt + 1}): {e}. Retrying...")
            await asyncio.sleep(0.1 * (attempt + 1))
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create age state: {str(e)}")
    
    raise HTTPException(status_code=500, detail="Failed to create age state after multiple retries due to unique code generation conflict.")


# Character search and analytics
@router.get("/search/", response_model=List[schemas.CharacterResponse])
async def search_characters(
    name: Optional[str] = None,
    min_age: Optional[int] = None,
    max_age: Optional[int] = None,
    has_avatar: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Search characters with filters"""
    query = db.query(models.Character)
    
    if name:
        query = query.filter(models.Character.name.ilike(f"%{name}%"))
    if min_age:
        query = query.filter(models.Character.age >= min_age)
    if max_age:
        query = query.filter(models.Character.age <= max_age)
    if has_avatar is not None:
        if has_avatar:
            query = query.filter(models.Character.image_url.isnot(None))
        else:
            query = query.filter(models.Character.image_url.is_(None))
    
    return query.all()

@router.get("/analytics/summary", response_model=schemas.CharacterAnalytics)
async def get_character_analytics(db: Session = Depends(get_db)):
    """Get analytics about your character collection"""
    characters = db.query(models.Character).all()
    
    if not characters:
        return {
            "total_characters": 0,
            "average_age": 0,
            "age_groups": {},
            "characters_with_avatars": 0,
            "recent_creations": 0
        }
    
    # Calculate analytics
    valid_ages = [c.age for c in characters if c.age is not None]
    average_age = sum(valid_ages) / len(valid_ages) if valid_ages else 0
    
    age_groups = {
        "Child (0-12)": len([c for c in characters if c.age and c.age <= 12]),
        "Teen (13-19)": len([c for c in characters if c.age and 13 <= c.age <= 19]),
        "Adult (20-64)": len([c for c in characters if c.age and 20 <= c.age <= 64]),
        "Elder (65+)": len([c for c in characters if c.age and c.age >= 65])
    }
    
    characters_with_avatars = len([c for c in characters if c.image_url])
    
    return {
        "total_characters": len(characters),
        "average_age": round(average_age, 1),
        "age_groups": age_groups,
        "characters_with_avatars": characters_with_avatars,
        "recent_creations": len(characters)  # Simplified for now
    }

@router.put("/{character_id}", response_model=schemas.CharacterResponse)
async def update_character(
    character_id: int, 
    character: schemas.CharacterUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing character"""
    db_character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not db_character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    update_data = character.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_character, field, value)
    
    db.commit()
    db.refresh(db_character)
    return db_character

@router.delete("/{character_id}")
async def delete_character(character_id: int, db: Session = Depends(get_db)):
    """Delete a character and all related data"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    db.delete(character)
    db.commit()
    return {"message": f"Character {character.char_code} deleted successfully"}

@router.post("/bulk-generate", response_model=schemas.BulkGenerationResponse)
async def bulk_generate_characters(request: schemas.BulkGenerationRequest):
    """Generate multiple characters with avatars in batch"""
    results = []
    
    for char_data in request.characters:
        try:
            # Build prompt
            prompt = f"manga style character portrait, {char_data.name}"
            if char_data.description:
                prompt += f", {char_data.description}"
            if char_data.age:
                prompt += f", {char_data.age} years old"
            prompt += ", anime art style, character design, high quality"
            
            # Generate image
            image_url = await generate_image_with_pollinations(prompt)
            
            results.append({
                "name": char_data.name,
                "description": char_data.description,
                "age": char_data.age,
                "height_cm": char_data.height_cm,
                "image_url": image_url,
                "generated": True
            })
            
            # Rate limiting - be respectful to free API
            await asyncio.sleep(2)
            
        except Exception as e:
            results.append({
                "name": char_data.name,
                "description": char_data.description,
                "age": char_data.age,
                "height_cm": char_data.height_cm,
                "image_url": None,
                "generated": False,
                "error": str(e)
            })
    
    return {"results": results}

@router.post("/{character_id}/costumes/{costume_id}/generate-image")
async def generate_costume_image(
    character_id: int,
    costume_id: int,
    db: Session = Depends(get_db)
):
    """Generate image for a specific costume"""
    character = db.query(models.Character).filter(models.Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    costume = db.query(models.Costume).filter(
        models.Costume.id == costume_id,
        models.Costume.character_id == character_id
    ).first()
    if not costume:
        raise HTTPException(status_code=404, detail="Costume not found")
    
    try:
        prompt = f"manga style character, {character.name} wearing {costume.description}, {costume.name}"
        if character.age:
            prompt += f", {character.age} years old"
        prompt += ", anime art style, costume design, full body"
        
        costume.image_url = await generate_image_with_pollinations(prompt)
        db.commit()
        
        return {
            "costume_id": costume_id,
            "image_url": costume.image_url,
            "prompt_used": prompt
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Costume image generation failed: {str(e)}")

@router.get("/health/image-service")
async def check_image_generation_health():
    """Check if Pollinations.AI service is available"""
    try:
        start_time = time.time()
        test_prompt = "test image generation"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"https://image.pollinations.ai/prompt/{quote(test_prompt)}"
            response = await client.head(url)
            
        response_time = (time.time() - start_time) * 1000
        
        return {
            "service": "Pollinations.AI",
            "status": "healthy" if response.status_code == 200 else "degraded",
            "response_time_ms": response_time
        }
    except Exception as e:
        return {
            "service": "Pollinations.AI",
            "status": "unhealthy",
            "error": str(e)
        }
