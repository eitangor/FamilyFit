"""FamilyFit main-program server.

Serves the existing FamilyFit web UI and provides same-origin API endpoints that
communicate with the course microservices over HTTP. Each microservice runs in
its own process; FamilyFit never imports microservice code directly.
"""

from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

TASK_SERVICE_URL = "http://127.0.0.1:8003"
WEATHER_SERVICE_URL = "http://127.0.0.1:8002"
FAVORITES_SERVICE_URL = "http://127.0.0.1:8161"
REQUEST_TIMEOUT_SECONDS = 6


def _json_from_response(response):
    """Return JSON from an upstream service, with a safe fallback."""
    try:
        return response.json()
    except ValueError:
        return {
            "error": "invalid_microservice_response",
            "message": "A microservice returned a response that was not valid JSON.",
        }


def _service_unavailable(service_name):
    return jsonify({
        "error": "service_unavailable",
        "message": f"The {service_name} microservice could not be reached.",
    }), 503


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "program": "FamilyFit"})


@app.post("/api/tasks")
def create_task():
    """Forward a FamilyFit task-creation request to the Task Microservice."""
    payload = request.get_json(silent=True) or {}

    try:
        response = requests.post(
            f"{TASK_SERVICE_URL}/tasks",
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Task")

    return jsonify(_json_from_response(response)), response.status_code


@app.get("/api/weather")
def get_weather():
    """Request a daily forecast from the Weather Forecast Microservice."""
    params = {
        "lat": request.args.get("lat"),
        "lon": request.args.get("lon"),
        "date": request.args.get("date"),
    }

    try:
        response = requests.get(
            f"{WEATHER_SERVICE_URL}/forecast",
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Weather Forecast")

    return jsonify(_json_from_response(response)), response.status_code


@app.post("/api/favorites")
def save_favorite():
    """Save a FamilyFit activity through the Favorites Microservice."""
    payload = request.get_json(silent=True) or {}

    try:
        response = requests.post(
            f"{FAVORITES_SERVICE_URL}/favorites",
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Favorites")

    return jsonify(_json_from_response(response)), response.status_code


@app.get("/api/favorites")
def get_favorites():
    """Retrieve favorites, optionally filtered to one favorite type."""
    favorite_type = request.args.get("type", "").strip()

    if favorite_type:
        upstream_url = f"{FAVORITES_SERVICE_URL}/favorites/type/{favorite_type}"
    else:
        upstream_url = f"{FAVORITES_SERVICE_URL}/favorites"

    try:
        response = requests.get(
            upstream_url,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Favorites")

    # The Favorites service returns 404 when a type has no matches. For the
    # FamilyFit UI, an empty favorites collection is easier to consume.
    if favorite_type and response.status_code == 404:
        return jsonify({}), 200

    return jsonify(_json_from_response(response)), response.status_code


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
