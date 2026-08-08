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
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
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


@app.get("/api/tasks")
def get_tasks():
    """Retrieve FamilyFit planning tasks from the Task Microservice."""
    try:
        response = requests.get(
            f"{TASK_SERVICE_URL}/tasks",
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Task")

    return jsonify(_json_from_response(response)), response.status_code


def _geocode_location(location):
    """Resolve a user-friendly place name to coordinates."""
    try:
        response = requests.get(
            GEOCODING_URL,
            params={
                "name": location,
                "count": 1,
                "language": "en",
                "format": "json",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return None, (
            jsonify({
                "error": "geocoding_unavailable",
                "message": "The location service could not be reached.",
            }),
            503,
        )

    if response.status_code != 200:
        return None, (
            jsonify({
                "error": "geocoding_failed",
                "message": "The location could not be resolved.",
            }),
            502,
        )

    data = _json_from_response(response)
    results = data.get("results", []) if isinstance(data, dict) else []
    if not results:
        return None, (
            jsonify({
                "error": "location_not_found",
                "message": f'No location was found for "{location}".',
            }),
            404,
        )

    result = results[0]
    return {
        "lat": result["latitude"],
        "lon": result["longitude"],
        "display_name": ", ".join(
            part for part in [
                result.get("name"),
                result.get("admin1"),
                result.get("country"),
            ]
            if part
        ),
    }, None


@app.get("/api/weather")
def get_weather():
    """Resolve a location and request a daily forecast from the Weather Microservice."""
    location = (request.args.get("location") or "").strip()
    forecast_date = request.args.get("date")

    # Backward compatibility for activities created during earlier development.
    lat = request.args.get("lat")
    lon = request.args.get("lon")

    if location:
        coordinates, geocode_error = _geocode_location(location)
        if geocode_error:
            return geocode_error
        lat = coordinates["lat"]
        lon = coordinates["lon"]
        display_name = coordinates["display_name"]
    elif lat and lon:
        display_name = "Saved location"
    else:
        return jsonify({
            "error": "missing_location",
            "message": "A location is required to check the weather.",
        }), 400

    params = {
        "lat": lat,
        "lon": lon,
        "date": forecast_date,
    }

    try:
        response = requests.get(
            f"{WEATHER_SERVICE_URL}/forecast",
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _service_unavailable("Weather Forecast")

    payload = _json_from_response(response)
    if response.ok and isinstance(payload, dict):
        payload["location"] = display_name

    return jsonify(payload), response.status_code


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
