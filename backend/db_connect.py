# backend/db_connect.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Adjust with your actual Postgres connection URL
DATABASE_URL = "postgresql://postgres:HeLL99%40me@localhost:5432/manga_studio"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
