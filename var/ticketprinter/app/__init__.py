# app/__init__.py
from flask import Flask
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from a local .env if present (e.g., OPENAI_API_KEY)
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

from app.models import DB_PATH, init_db  # noqa: E402

# Create the Flask app instance
app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"

# Ensure database schema exists
init_db()

# Import routes AFTER app is created to avoid circular imports
from app import main  # noqa: E402
