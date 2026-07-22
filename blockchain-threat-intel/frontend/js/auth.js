// Handles the login/register forms on index.html

function showForm(which) {
  document.getElementById("loginForm").style.display = which === "login" ? "block" : "none";
  document.getElementById("registerForm").style.display = which === "register" ? "block" : "none";
  document.getElementById("tabLogin").classList.toggle("active", which === "login");
  document.getElementById("tabRegister").classList.toggle("active", which === "register");
  document.getElementById("alertBox").style.display = "none";
}

// If already logged in, skip straight to dashboard
if (getToken()) {
  window.location.href = "dashboard.html";
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await apiRequest("/login", "POST", { email, password }, false);
    localStorage.setItem("threatIntelToken", data.token);
    localStorage.setItem("threatIntelUser", JSON.stringify(data.organization));

    if (data.organization.role === "analyst") {
      window.location.href = "analyst-dashboard.html";
    } else {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const organizationName = document.getElementById("regOrgName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const role = document.getElementById("regRole").value;

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    await apiRequest("/register", "POST", { organizationName, email, password, role }, false);
    showAlert("alertBox", "Account created! You can now log in.", "success");
    showForm("login");
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
});