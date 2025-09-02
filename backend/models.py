# backend/models.py
from sqlalchemy import Column, Integer, String, Float, TIMESTAMP, Text, ForeignKey, Boolean, JSON, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db_connect import Base

class Character(Base):
    __tablename__ = "characters"

    # FIXED: Match exact database schema
    id = Column(Integer, primary_key=True, index=True)
    char_code = Column(Text, nullable=False)  # Changed to Text, has default in DB
    name = Column(Text, nullable=False)       # Changed to Text
    description = Column(Text)                # Already correct
    age = Column(Integer)                     # Already correct
    height_cm = Column(Numeric(6,2))         # FIXED: Changed from Float to Numeric(6,2)
    image_url = Column(Text)                 # FIXED: Changed from String to Text
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    
    # REMOVED: These columns don't exist in your database
    # generation_prompt = Column(Text)  # REMOVED - doesn't exist in DB
    # updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())  # REMOVED
    
    # Relationships
    costumes = relationship("Costume", back_populates="character", cascade="all, delete-orphan")
    age_states = relationship("AgeState", back_populates="character", cascade="all, delete-orphan")
    changes = relationship("CharacterChange", back_populates="character", cascade="all, delete-orphan")

class Costume(Base):
    __tablename__ = "costumes"
    
    id = Column(Integer, primary_key=True, index=True)
    costume_code = Column(String, unique=True, index=True, nullable=False)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    is_default = Column(Boolean, default=False)
    image_url = Column(Text)  # Generated costume image
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    
    # Relationship
    character = relationship("Character", back_populates="costumes")

class AgeState(Base):
    __tablename__ = "age_states"
    
    id = Column(Integer, primary_key=True, index=True)
    age_code = Column(String, unique=True, index=True, nullable=False)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False)
    age = Column(Integer, nullable=False)
    notes = Column(Text)
    image_url = Column(Text)  # Age-specific character image
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    
    # Relationship
    character = relationship("Character", back_populates="age_states")

class CharacterChange(Base):
    __tablename__ = "character_changes"
    
    id = Column(Integer, primary_key=True, index=True)
    change_code = Column(String, unique=True, index=True, nullable=False)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False)
    when_occurred = Column(String)  # e.g., "After battle", "Chapter 5"
    what_changed = Column(Text, nullable=False)
    image_url = Column(Text)  # Image showing the change
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    
    # Relationship
    character = relationship("Character", back_populates="changes")

class Object(Base):
    __tablename__ = "objects"
    
    id = Column(Integer, primary_key=True, index=True)
    object_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    height_cm = Column(Float)
    color = Column(String)  # Hex color code
    description = Column(Text)
    image_url = Column(Text)  # Generated object image
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Frame(Base):
    __tablename__ = "frames"
    
    id = Column(Integer, primary_key=True, index=True)
    frame_code = Column(String, unique=True, index=True, nullable=False)
    background_description = Column(Text)
    blocks = Column(JSON)  # Store block data as JSON
    generated_image_url = Column(Text)  # Final composed frame image
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Page(Base):
    __tablename__ = "pages"
    
    id = Column(Integer, primary_key=True, index=True)
    page_code = Column(String, unique=True, index=True, nullable=False)
    layout_type = Column(String)  # e.g., "2-vertical", "4-grid"
    slots = Column(JSON)  # Store slot configuration as JSON
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Book(Base):
    __tablename__ = "books"
    
    id = Column(Integer, primary_key=True, index=True)
    book_code = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    page_ids = Column(JSON)  # Store array of page IDs
    cover_image_url = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class GenerationHistory(Base):
    __tablename__ = "generation_history"
    
    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False)  # "character", "costume", "object", "frame"
    entity_id = Column(Integer, nullable=False)
    prompt_used = Column(Text, nullable=False)
    service_used = Column(String, default="pollinations")  # Track which service was used
    generation_time_seconds = Column(Float)
    success = Column(Boolean, default=True)
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())