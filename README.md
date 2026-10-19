# Emotion Lens

Emotion Lens is a web app that reads a sentence and predicts the emotion behind it. It uses a Bidirectional GRU (BiGRU) deep learning model trained for emotion classification, served through a FastAPI backend with a lightweight, animated frontend.

## Features

- Predicts one of six emotions: sadness, joy, love, anger, fear, and surprise
- Shows the top emotion, its confidence score, and probabilities for all six classes
- Quick-try example sentences to explore the model
- Keeps a local history of recent analyses (stored in the browser only)
- Live model status indicator
- Responsive layout that works on mobile and desktop

## Tech Stack

- **Model:** TensorFlow / Keras (BiGRU)
- **Backend:** FastAPI, Uvicorn, Pydantic
- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Deployment:** Render

## Project Structure

```
Emotion-Lens/
├── main.py              # FastAPI app: model loading, routes, prediction logic
├── Artifacts/
│   ├── bigru_model.keras   # Trained BiGRU model
│   └── tokenizer.pkl       # Fitted Keras tokenizer
├── static/
│   ├── index.html       # Frontend page
│   ├── style.css        # Styles and animations
│   └── script.js        # API calls, rendering, history
├── requirements.txt     # Python dependencies (used by Render)
├── runtime.txt          # Python version (used by Render)
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.12 (matches `runtime.txt`)
- pip

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/APNA_USERNAME/emotion-lens.git
   cd emotion-lens
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```

3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

5. Open the app in your browser at `http://127.0.0.1:8000`.

## API

Interactive API docs are available at `/docs` when the server is running.

### `GET /health`

Returns whether the model and tokenizer are loaded.

```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### `POST /predict`

Predicts the emotion for a sentence.

**Request body:**

```json
{
  "text": "I feel so happy and excited"
}
```

- `text`: required, 1 to 200 characters

**Response:**

```json
{
  "text": "I feel so happy and excited",
  "predicted_emotion": "joy",
  "emoji": "😄",
  "confidence": 0.93,
  "all_probabilities": {
    "sadness": 0.01,
    "joy": 0.93,
    "love": 0.03,
    "anger": 0.01,
    "fear": 0.01,
    "surprise": 0.01
  }
}
```

**Errors:**

- `422`: the text has no meaningful words after cleaning
- `503`: the model is still loading

## How It Works

1. The input text is lowercased, stripped of apostrophes and punctuation, and whitespace is normalized.
2. The cleaned text is converted to integer sequences with the saved tokenizer.
3. Sequences are padded or truncated to a fixed length of 50 tokens.
4. The BiGRU model returns a probability for each emotion, and the highest one is the prediction.

## Deployment on Render

1. Push the repository to GitHub.
2. On [Render](https://render.com), create a new **Web Service** and connect the repository.
3. Use these settings:
   - **Runtime:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/health`
4. Deploy. Render reads the Python version from `runtime.txt`.

The model loads at startup, so the first request after the service has been idle may take a little longer.

## Notes

- Recent analyses are saved only in your browser's local storage. Nothing is stored on the server.
- The model is trained for short, single-sentence English text. Results on other languages or long passages may be less reliable.

## License

Add a license here if you plan to share the project publicly.
