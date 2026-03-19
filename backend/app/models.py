from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())

    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)          # stored name on disk
    original_name = Column(String, nullable=False)     # user's original file name
    page_count = Column(Integer, nullable=False)
    selected_start = Column(Integer, nullable=True)
    selected_end = Column(Integer, nullable=True)
    status = Column(String, default="uploaded")        # uploaded | processing | done | failed
    error_message = Column(Text, nullable=True)        # populated on failure
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())

    owner = relationship("User", back_populates="documents")
    cards = relationship("ContextCard", back_populates="document", cascade="all, delete-orphan")


class ContextCard(Base):
    __tablename__ = "context_cards"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    page_range_start = Column(Integer, nullable=False)
    page_range_end = Column(Integer, nullable=False)
    model_used = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())

    document = relationship("Document", back_populates="cards")
    messages = relationship("ChatMessage", back_populates="card", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("context_cards.id"), nullable=False)
    role = Column(String, nullable=False)   # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())

    card = relationship("ContextCard", back_populates="messages")
