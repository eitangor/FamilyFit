# FamilyFit Planner

FamilyFit Planner is a small monolithic web application for CS361 Milestone #1.

## Implemented user stories

1. Add Child Profile
2. Add Activity
3. View Activities

## Run locally

No packages are required.

### Recommended

From the project folder:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

You can also open `index.html` directly in a browser, but the local web server is more reliable.

## Data storage

The app stores test data in the browser's `localStorage`. It does not use passwords, API keys, or private information.

## Inclusivity Heuristics

- IH1: The welcome card explains the benefits of the app.
- IH2: The welcome card communicates an estimated setup time.
- IH3: The welcome card can be dismissed.
- IH4: Familiar labels, forms, navigation, and standard controls are used.
- IH5: Back buttons allow users to return to earlier steps.
- IH6: Step numbers and Next buttons identify what to do next.
- IH7: Forms can be submitted using buttons or the keyboard.
- IH8: Resetting stored data requires confirmation and offers Cancel.

## Quality attributes

- Usability: Every input has a visible text label and action buttons have explicit labels.
- Reliability: Saved children and activities remain after refresh/reopening because they are stored in localStorage.
- Responsiveness: The View Activities page reports the render time for the activity list and includes a button for loading 20 test activities.

## Milestone release

Recommended release tag:

```text
v1.0.0
```


## Portfolio microservice integrations

FamilyFit's Python `server.py` acts as the Main Program backend. The browser
communicates only with FamilyFit, and FamilyFit communicates with each
microservice programmatically over HTTP. No microservice code is imported into
the Main Program.

Current integrations:

- **Favorites Microservice** — saves activity ideas as favorites and retrieves
  saved FamilyFit favorites.
- **Weather Forecast Microservice** — checks the forecast for an activity date
  and user-friendly location. FamilyFit resolves the location to coordinates
  before requesting the forecast.
- **Task Microservice** — adds activities to a Family Plan and retrieves the
  current plan.

Each service runs in a separate process from FamilyFit.
