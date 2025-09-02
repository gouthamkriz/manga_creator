# backend/schemas.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CharacterBase(BaseModel):
    name: str
    description: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    image_url: Optional[str] = None

class CharacterCreate(CharacterBase):
    pass

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    image_url: Optional[str] = None

class CharacterResponse(CharacterBase):
    id: int
    char_code: str
    created_at: datetime

    class Config:
        from_attributes = True  # FIXED: Changed from orm_mode = True

# New schemas for image generation
class CharacterGenerationRequest(BaseModel):
    name: str
    description: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    style_preference: Optional[str] = "anime style"

class CharacterVariant(BaseModel):
    variant_id: int
    image_url: str
    style: str
    prompt_used: str

class CharacterGenerationResponse(BaseModel):
    character_name: str
    variants: List[CharacterVariant]
    total_generated: int

class BulkCharacterData(BaseModel):
    name: str
    description: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None

class BulkGenerationRequest(BaseModel):
    characters: List[BulkCharacterData]

class BulkGenerationResult(BaseModel):
    name: str
    description: Optional[str]
    age: Optional[int]
    height_cm: Optional[float]
    image_url: Optional[str]
    generated: bool
    error: Optional[str] = None

class BulkGenerationResponse(BaseModel):
    results: List[BulkGenerationResult]

class AvatarGenerationResponse(BaseModel):
    character_id: int
    image_url: str
    prompt_used: str

class HealthCheckResponse(BaseModel):
    service: str
    status: str
    response_time_ms: Optional[float] = None
    error: Optional[str] = None

# Enhanced schemas for costumes, ages, and changes
class CostumeBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: bool = False

class CostumeCreate(CostumeBase):
    pass

class CostumeResponse(CostumeBase):
    id: int
    costume_code: str
    character_id: int
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True  # FIXED: Changed from orm_mode = True

class AgeStateBase(BaseModel):
    age: int
    notes: Optional[str] = None

class AgeStateCreate(AgeStateBase):
    pass

class AgeStateResponse(AgeStateBase):
    id: int
    age_code: str
    character_id: int
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True  # FIXED: Changed from orm_mode = True

class CharacterChangeBase(BaseModel):
    when_occurred: Optional[str] = None
    what_changed: str

class CharacterChangeCreate(CharacterChangeBase):
    pass

class CharacterChangeResponse(CharacterChangeBase):
    id: int
    change_code: str
    character_id: int
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True  # FIXED: Changed from orm_mode = True

# Enhanced character response with relationships
class CharacterFullResponse(CharacterResponse):
    costumes: List[CostumeResponse] = []
    age_states: List[AgeStateResponse] = []
    changes: List[CharacterChangeResponse] = []

class CharacterAnalytics(BaseModel):
    total_characters: int
    average_age: Optional[float]  # FIXED: Made optional since not all characters have age
    age_groups: dict
    characters_with_avatars: int
    recent_creations: int