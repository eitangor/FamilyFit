const STORAGE_KEYS = {
  children: "familyfit-children",
  activities: "familyfit-activities",
};

const state = {
  children: loadArray(STORAGE_KEYS.children),
  activities: loadArray(STORAGE_KEYS.activities)
};

const views = document.querySelectorAll(".view");
const stepButtons = document.querySelectorAll(".step-button");
const statusMessage = document.getElementById("statusMessage");
const childForm = document.getElementById("childForm");
const activityForm = document.getElementById("activityForm");
const childrenList = document.getElementById("childrenList");
const activitiesList = document.getElementById("activitiesList");
const activityChild = document.getElementById("activityChild");
const confirmDialog = document.getElementById("confirmDialog");
const favoritesPanel = document.getElementById("favoritesPanel");
const favoritesList = document.getElementById("favoritesList");
const familyPlanPanel = document.getElementById("familyPlanPanel");
const familyPlanList = document.getElementById("familyPlanList");

function loadArray(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.children, JSON.stringify(state.children));
  localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(state.activities));
}

function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function switchView(viewId) {
  views.forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  stepButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.getElementById(viewId).querySelector("h2")?.focus?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderChildren() {
  childrenList.innerHTML = "";
  activityChild.innerHTML = '<option value="">Whole family / not assigned</option>';

  if (state.children.length === 0) {
    childrenList.innerHTML = '<div class="empty-state">No child profiles have been saved yet.</div>';
    return;
  }

  state.children.forEach((child) => {
    const card = document.createElement("article");
    card.className = "item-card";
    card.innerHTML = `
      <h3>${escapeHtml(child.name)}</h3>
      <p><strong>Age:</strong> ${child.age}</p>
      <p><strong>Interests:</strong> ${escapeHtml(child.interests || "Not provided")}</p>
    `;
    childrenList.appendChild(card);

    const option = document.createElement("option");
    option.value = child.name;
    option.textContent = child.name;
    activityChild.appendChild(option);
  });
}

function formatActivityDate(dateString) {
  if (!dateString) {
    return "Date not set";
  }

  const date = new Date(`${dateString}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? dateString
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
}

function renderActivities() {
  const start = performance.now();
  activitiesList.innerHTML = "";

  if (state.activities.length === 0) {
    activitiesList.innerHTML = '<div class="empty-state">No activities have been saved yet.</div>';
  } else {
    state.activities.forEach((activity, index) => {
      const card = document.createElement("article");
      card.className = "item-card";

      const planningDetails = [
        activity.date
          ? `<p><strong>Date:</strong> ${escapeHtml(formatActivityDate(activity.date))}</p>`
          : "",
        activity.location
          ? `<p><strong>Location:</strong> ${escapeHtml(activity.location)}</p>`
          : ""
      ].join("");

      card.innerHTML = `
        <h3>${escapeHtml(activity.name)}</h3>
        <p><strong>Category:</strong> ${escapeHtml(activity.category)}</p>
        <p><strong>Child:</strong> ${escapeHtml(activity.child || "Whole family / not assigned")}</p>
        <p><strong>Description:</strong> ${escapeHtml(activity.description)}</p>
        ${planningDetails}
        <div class="activity-actions">
          <button
            class="secondary favorite-button"
            type="button"
            data-activity-index="${index}"
          >
            ♡ Save Favorite
          </button>
          <button
            class="secondary weather-button"
            type="button"
            data-activity-index="${index}"
          >
            Check Weather
          </button>
          <button
            class="secondary task-button"
            type="button"
            data-activity-index="${index}"
          >
            Add to Family Plan
          </button>
        </div>
        <div
          id="weather-result-${index}"
          class="microservice-result weather-result"
          hidden
        ></div>
        <div
          id="task-result-${index}"
          class="microservice-result task-result"
          hidden
        ></div>
      `;
      activitiesList.appendChild(card);
    });
  }

  const elapsed = performance.now() - start;
  document.getElementById("renderTime").textContent =
    `Displayed ${state.activities.length} activities in ${elapsed.toFixed(2)} milliseconds.`;
}

async function saveFavorite(activityIndex, button) {
  const activity = state.activities[activityIndex];

  if (!activity) {
    showStatus("That activity could not be found.", "error");
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Saving...";

  try {
    const response = await fetch("/api/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: activity.name,
        type: "family_activity",
        description: activity.description,
        data: {
          category: activity.category,
          child: activity.child || "Whole family / not assigned",
          date: activity.date || null,
          location: activity.location || null
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.message || "Favorite could not be saved.");
    }

    button.textContent = "♥ Saved";
    showStatus(`"${activity.name}" was saved through the Favorites Microservice.`);
  } catch (error) {
    button.textContent = previousText;
    showStatus(error.message || "Favorites Microservice is unavailable.", "error");
  } finally {
    button.disabled = false;
  }
}

async function checkWeather(activityIndex, button) {
  const activity = state.activities[activityIndex];
  const result = document.getElementById(`weather-result-${activityIndex}`);

  if (!activity) {
    showStatus("That activity could not be found.", "error");
    return;
  }

  if (!activity.date || (!activity.location && !(activity.latitude && activity.longitude))) {
    result.hidden = false;
    result.className = "microservice-result error-result";
    result.textContent =
      "Add a date and location to this activity before checking the forecast.";
    showStatus("A date and location are needed for the forecast.", "error");
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Checking...";

  const params = new URLSearchParams({
    date: activity.date
  });

  if (activity.location) {
    params.set("location", activity.location);
  } else {
    // Supports activities created during earlier development.
    params.set("lat", activity.latitude);
    params.set("lon", activity.longitude);
  }

  try {
    const response = await fetch(`/api/weather?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Forecast could not be retrieved.");
    }

    result.hidden = false;
    result.className = "microservice-result weather-result";
    result.innerHTML = `
      <div class="result-heading">Weather for ${escapeHtml(data.location || activity.location || "activity location")}</div>
      <div class="forecast-values">
        <span><strong>High</strong> ${escapeHtml(data.temp_max_f)}°F</span>
        <span><strong>Low</strong> ${escapeHtml(data.temp_min_f)}°F</span>
      </div>
      <div class="service-note">Provided by the Weather Forecast Microservice</div>
    `;

    showStatus(`Weather forecast retrieved for "${activity.name}".`);
  } catch (error) {
    result.hidden = false;
    result.className = "microservice-result error-result";
    result.textContent = error.message || "Weather Forecast Microservice is unavailable.";
    showStatus(
      error.message || "Weather Forecast Microservice is unavailable.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}


async function createTask(activityIndex, button) {
  const activity = state.activities[activityIndex];
  const result = document.getElementById(`task-result-${activityIndex}`);

  if (!activity) {
    showStatus("That activity could not be found.", "error");
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Adding...";

  const dueDate = activity.date
    ? `${activity.date}T12:00:00Z`
    : null;

  const payload = {
    title: activity.name,
    description: activity.description,
    due_date: dueDate,
    assignee: activity.child || null,
    status: "not_started",
    priority: "medium"
  };

  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data.message ||
        data.error ||
        (Array.isArray(data.details) && data.details[0]?.message) ||
        "Activity could not be added to the family plan.";
      throw new Error(errorMessage);
    }

    const assignee = data.assignee || "Whole family";
    const dateText = activity.date
      ? formatActivityDate(activity.date)
      : "Date to be decided";

    result.hidden = false;
    result.className = "microservice-result task-result";
    result.innerHTML = `
      <div class="result-heading">Added to Family Plan</div>
      <strong>${escapeHtml(activity.name)}</strong><br>
      ${escapeHtml(assignee)} · ${escapeHtml(dateText)}
      <div class="service-note">Tracked by the Task Microservice</div>
    `;

    button.textContent = "✓ Added to Plan";
    showStatus(`"${activity.name}" was added to the family plan.`);
  } catch (error) {
    result.hidden = false;
    result.className = "microservice-result error-result";
    result.textContent = error.message || "Task Microservice is unavailable.";
    button.textContent = previousText;
    showStatus(error.message || "Task Microservice is unavailable.", "error");
  } finally {
    button.disabled = false;
  }
}


async function loadFavorites() {
  favoritesPanel.hidden = false;
  favoritesList.innerHTML = '<div class="empty-state">Loading favorites...</div>';

  try {
    const response = await fetch("/api/favorites?type=family_activity");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.message || "Favorites could not be retrieved.");
    }

    const favorites = Object.entries(data);

    if (favorites.length === 0) {
      favoritesList.innerHTML =
        '<div class="empty-state">No FamilyFit favorites have been saved yet.</div>';
      return;
    }

    favoritesList.innerHTML = "";

    favorites.forEach(([favoriteId, favorite]) => {
      const card = document.createElement("article");
      card.className = "item-card favorite-card";
      card.innerHTML = `
        <h4>${escapeHtml(favorite.name)}</h4>
        <p><strong>Favorite ID:</strong> ${escapeHtml(favoriteId)}</p>
        <p><strong>Category:</strong> ${escapeHtml(favorite.data?.category || "Not provided")}</p>
        <p><strong>Child:</strong> ${escapeHtml(favorite.data?.child || "Not provided")}</p>
        <p><strong>Description:</strong> ${escapeHtml(favorite.description || "Not provided")}</p>
      `;
      favoritesList.appendChild(card);
    });

    showStatus(`Retrieved ${favorites.length} favorite${favorites.length === 1 ? "" : "s"} from the Favorites Microservice.`);
  } catch (error) {
    favoritesList.innerHTML =
      `<div class="empty-state error-text">${escapeHtml(error.message || "Favorites Microservice is unavailable.")}</div>`;
    showStatus(error.message || "Favorites Microservice is unavailable.", "error");
  }
}

async function loadFamilyPlan() {
  familyPlanPanel.hidden = false;
  familyPlanList.innerHTML = '<div class="empty-state">Loading family plan...</div>';

  try {
    const response = await fetch("/api/tasks");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Family plan could not be retrieved.");
    }

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    if (tasks.length === 0) {
      familyPlanList.innerHTML =
        '<div class="empty-state">No activities have been added to the family plan yet.</div>';
      return;
    }

    familyPlanList.innerHTML = "";

    tasks.forEach((task) => {
      const card = document.createElement("article");
      card.className = "item-card plan-card";

      const dueDate = task.due_date
        ? formatActivityDate(task.due_date.slice(0, 10))
        : "Date to be decided";

      card.innerHTML = `
        <h4>${escapeHtml(task.title)}</h4>
        <p><strong>For:</strong> ${escapeHtml(task.assignee || "Whole family")}</p>
        <p><strong>When:</strong> ${escapeHtml(dueDate)}</p>
        <p><strong>Details:</strong> ${escapeHtml(task.description || "No description")}</p>
        <p class="service-note">Tracked by the Task Microservice</p>
      `;

      familyPlanList.appendChild(card);
    });

    showStatus(`Retrieved ${tasks.length} planned activit${tasks.length === 1 ? "y" : "ies"} from the Task Microservice.`);
  } catch (error) {
    familyPlanList.innerHTML =
      `<div class="empty-state error-text">${escapeHtml(error.message || "Task Microservice is unavailable.")}</div>`;
    showStatus(error.message || "Task Microservice is unavailable.", "error");
  }
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

childForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!childForm.reportValidity()) {
    showStatus("Please complete the required child fields.", "error");
    return;
  }

  state.children.push({
    name: document.getElementById("childName").value.trim(),
    age: document.getElementById("childAge").value,
    interests: document.getElementById("childInterests").value.trim()
  });

  saveState();
  renderChildren();
  childForm.reset();
  showStatus("Child profile saved.");
});

activityForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!activityForm.reportValidity()) {
    showStatus("Please complete the required activity fields.", "error");
    return;
  }

  state.activities.push({
    name: document.getElementById("activityName").value.trim(),
    category: document.getElementById("activityCategory").value,
    child: activityChild.value,
    date: document.getElementById("activityDate").value,
    location: document.getElementById("activityLocation").value.trim(),
    description: document.getElementById("activityDescription").value.trim()
  });

  saveState();
  renderActivities();
  activityForm.reset();
  showStatus("Activity saved.");
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.getElementById("clearChildFormButton").addEventListener("click", () => {
  childForm.reset();
  showStatus("Child form cleared.");
});

document.getElementById("clearActivityFormButton").addEventListener("click", () => {
  activityForm.reset();
  showStatus("Activity form cleared.");
});

document.getElementById("dismissWelcomeButton").addEventListener("click", () => {
  document.getElementById("welcomeCard").hidden = true;
});

document.getElementById("resetAppButton").addEventListener("click", () => {
  confirmDialog.showModal();
});

confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue !== "confirm") {
    showStatus("Reset canceled.");
    return;
  }

  state.children = [];
  state.activities = [];
  localStorage.removeItem(STORAGE_KEYS.children);
  localStorage.removeItem(STORAGE_KEYS.activities);
  renderChildren();
  renderActivities();
  showStatus("All saved data was deleted.");
});

document.getElementById("loadSampleDataButton").addEventListener("click", () => {
  state.activities = Array.from({ length: 20 }, (_, index) => ({
    name: `Sample Activity ${index + 1}`,
    category: ["Sports", "Health", "Indoor", "Outdoor"][index % 4],
    child: state.children[0]?.name || "",
    description: `Test activity used to verify that a list of 20 activities displays quickly.`
  }));
  saveState();
  renderActivities();
  showStatus("Loaded 20 sample activities.");
});


activitiesList.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest(".favorite-button");
  if (favoriteButton) {
    const activityIndex = Number(favoriteButton.dataset.activityIndex);
    saveFavorite(activityIndex, favoriteButton);
    return;
  }

  const weatherButton = event.target.closest(".weather-button");
  if (weatherButton) {
    const activityIndex = Number(weatherButton.dataset.activityIndex);
    checkWeather(activityIndex, weatherButton);
    return;
  }

  const taskButton = event.target.closest(".task-button");
  if (taskButton) {
    const activityIndex = Number(taskButton.dataset.activityIndex);
    createTask(activityIndex, taskButton);
  }
});

document.getElementById("viewFavoritesButton").addEventListener("click", () => {
  loadFavorites();
});

document.getElementById("closeFavoritesButton").addEventListener("click", () => {
  favoritesPanel.hidden = true;
});

document.getElementById("viewFamilyPlanButton").addEventListener("click", () => {
  loadFamilyPlan();
});

document.getElementById("closeFamilyPlanButton").addEventListener("click", () => {
  familyPlanPanel.hidden = true;
});

renderChildren();
renderActivities();
