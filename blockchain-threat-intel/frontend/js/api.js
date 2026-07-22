// Small shared helper for talking to the backend REST API.
// Change API_BASE if your backend runs somewhere other than localhost:5000.

const API_BASE = "http://localhost:5000";

function getToken() {
  return localStorage.getItem("threatIntelToken");
}

function getUser() {
  const raw = localStorage.getItem("threatIntelUser");
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem("threatIntelToken");
  localStorage.removeItem("threatIntelUser");
  window.location.href = "index.html";
}

// Redirect to login if there's no token (used on protected pages)
function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

async function apiRequest(path, method = "GET", body = null, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || (data.errors && data.errors[0]?.msg) || "Request failed";
    const detail = data.details ? ` — ${data.details}` : "";
    throw new Error(message + detail);
  }
  return data;
}

// Adjusts the nav bar based on the logged-in user's role:
// - Analysts don't get a "Submit Report" link (they're read-only)
// - Analysts' "Dashboard" link points to their own analyst dashboard
function applyRoleBasedNav() {
  const user = getUser();
  if (!user) return;

  const dashLink = document.getElementById("navDashboardLink");
  const submitLink = document.getElementById("navSubmitLink");

  if (user.role === "analyst") {
    if (dashLink) dashLink.href = "analyst-dashboard.html";
    if (submitLink) submitLink.style.display = "none";
  } else if (dashLink) {
    dashLink.href = "dashboard.html";
  }
}

function showAlert(elementId, message, type = "error") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `alert ${type}`;
  el.textContent = message;
  el.style.display = "block";
}