
import os
import re
import pickle
import numpy as np

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences



# 1. CONSTANTS
BASE_DIR = Path(__file__).resolve().parent

# Model and tokenizer paths
model_path = BASE_DIR / "Artifacts" / "bigru_model.keras"
tokenizer_path = BASE_DIR / "Artifacts" / "tokenizer.pkl"

# Static frontend path
static_path = BASE_DIR / "static"

# Maximum sequence length
max_sequence_length = 50

# Emotion labels
emotion_labels = [
    "sadness",
    "joy",
    "love",
    "anger",
    "fear",
    "surprise"
]

# Emotion emojis
emotion_emoji = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😡",
    "fear": "😨",
    "surprise": "😲"
}

# 2. TEXT PREPROCESSING
def preprocess_text(text: str) -> str:
    text = text.lower()
    text = text.replace("'", "")
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ==================================================
# 3. REQUEST AND RESPONSE SCHEMAS
# ==================================================

class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="The sentence to analyze",
        json_schema_extra={
            "example": "I feel so happy and excited"
        }
    )


class PredictionResponse(BaseModel):
    text: str
    predicted_emotion: str
    emoji: str
    confidence: float
    all_probabilities: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# ==================================================
# 4. MODEL LOADING AND LIFESPAN
# ==================================================

dl_model = {}


@asynccontextmanager
async def lifespan(app: FastAPI):

    print("Loading BiGRU model and tokenizer...")

    try:
        dl_model["bigru"] = load_model(model_path)

        with open(tokenizer_path, "rb") as file:
            dl_model["tokenizer"] = pickle.load(file)

        print("Model and tokenizer loaded successfully.")

        yield

    finally:
        dl_model.clear()
        print("Model resources cleared.")


# ==================================================
# 5. FASTAPI APP AND STATIC FILES
# ==================================================

app = FastAPI(
    title="Emotion Classification API",
    description="Emotion prediction using a trained BiGRU model",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.mount(
    "/static",
    StaticFiles(directory=str(static_path)),
    name="static"
)


# ==================================================
# 6. HOMEPAGE
# ==================================================

@app.get("/", include_in_schema=False)
def serve_ui():
    index_path = static_path / "index.html"

    if not index_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Homepage static/index.html not found"
        )

    return FileResponse(index_path)


# ==================================================
# 7. HEALTH CHECK
# ==================================================

@app.get("/health", response_model=HealthResponse)
def health_check():

    is_loaded = (
        dl_model.get("bigru") is not None
        and dl_model.get("tokenizer") is not None
    )

    return HealthResponse(
        status="healthy" if is_loaded else "not ready",
        model_loaded=is_loaded
    )


# ==================================================
# 8. PREDICT EMOTION
# ==================================================

@app.post("/predict", response_model=PredictionResponse)
def predict_emotion(text_input: TextInput):

    bigru_model = dl_model.get("bigru")
    tokenizer_model = dl_model.get("tokenizer")

    if bigru_model is None or tokenizer_model is None:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded yet"
        )

    cleaned_text = preprocess_text(text_input.text)

    if not cleaned_text:
        raise HTTPException(
            status_code=422,
            detail="Please provide meaningful text"
        )

    # Convert words into integer sequences
    tokenized_text = tokenizer_model.texts_to_sequences(
        [cleaned_text]
    )

    # Ensure the input has the expected sequence length
    padded_sequence = pad_sequences(
        tokenized_text,
        maxlen=max_sequence_length,
        padding="post",
        truncating="post"
    )

    # Predict emotion probabilities
    probabilities = bigru_model.predict(
        padded_sequence,
        verbose=0
    )[0]

    if len(probabilities) != len(emotion_labels):
        raise HTTPException(
            status_code=500,
            detail="Model output does not match emotion labels"
        )

    top_emotion_index = int(np.argmax(probabilities))
    predicted_emotion = emotion_labels[top_emotion_index]

    all_probabilities = {
        label: float(probability)
        for label, probability in zip(
            emotion_labels,
            probabilities
        )
    }

    return PredictionResponse(
        text=text_input.text,
        predicted_emotion=predicted_emotion,
        emoji=emotion_emoji[predicted_emotion],
        confidence=float(probabilities[top_emotion_index]),
        all_probabilities=all_probabilities
    )
