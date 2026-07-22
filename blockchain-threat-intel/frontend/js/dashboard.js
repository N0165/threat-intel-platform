requireAuth();

const user = getUser();

// Analysts get their own dashboard (read-only, different layout/features).
if (user && user.role === "analyst") {
  window.location.href = "analyst-dashboard.html";
}
applyRoleBasedNav();

if (user) {
  document.getElementById("welcomeMsg").textContent =
    `Welcome back, ${user.organizationName} (${user.role})`;
}

async function loadDashboard() {
  try {
    const data = await apiRequest("/stats");

    document.getElementById("statTotal").textContent = data.totalAttacks;
    document.getElementById("statOrgs").textContent = data.totalOrganizations;
    document.getElementById("statTypes").textContent = data.byType.length;

    // Recent threats table
    const tbody = document.querySelector("#recentTable tbody");
    tbody.innerHTML = data.recentThreats
      .map(
        (r) => `<tr>
          <td>${r.attackTitle}</td>
          <td><span class="badge">${r.attackType}</span></td>
          <td>${r.organizationName}</td>
        </tr>`
      )
      .join("");

    // Chart of attacks by type
    const ctx = document.getElementById("typeChart");
    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.byType.map((t) => t._id),
        datasets: [
          {
            data: data.byType.map((t) => t.count),
            backgroundColor: [
              "#3ecf8e", "#4f8cff", "#f4b740", "#ef5350",
              "#ab47bc", "#26c6da", "#ff7043", "#8d6e63", "#78909c"
            ]
          }
        ]
      },
      options: {
        plugins: { legend: { labels: { color: "#e6ebf5" } } }
      }
    });
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
}

loadDashboard();