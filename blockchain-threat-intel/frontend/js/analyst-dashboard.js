requireAuth();

const user = getUser();

// This page is analyst-only. Admins/orgs should use the regular dashboard,
// which has submit/manage capabilities analysts intentionally don't get.
if (user && user.role !== "analyst") {
  window.location.href = "dashboard.html";
}

if (user) {
  document.getElementById("welcomeMsg").textContent =
    `Signed in as ${user.organizationName}`;
}

let allReports = []; // cached for IOC search / export, loaded once on page load

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function loadAnalystDashboard() {
  try {
    const [statsData, threatsData] = await Promise.all([
      apiRequest("/stats"),
      apiRequest("/getThreats")
    ]);

    allReports = threatsData.reports;

    document.getElementById("statTotal").textContent = statsData.totalAttacks;
    document.getElementById("statOrgs").textContent = statsData.totalOrganizations;

    // Count unique IOCs across all reports
    const iocSet = new Set();
    allReports.forEach((r) => {
      (r.ioc?.ipAddresses || []).forEach((v) => iocSet.add(v));
      (r.ioc?.fileHashes || []).forEach((v) => iocSet.add(v));
      (r.ioc?.domains || []).forEach((v) => iocSet.add(v));
    });
    document.getElementById("statIocs").textContent = iocSet.size;

    // Attack type chart (bar, to look distinct from the admin doughnut chart)
    const ctx = document.getElementById("typeChart");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: statsData.byType.map((t) => t._id),
        datasets: [
          {
            label: "Reports",
            data: statsData.byType.map((t) => t.count),
            backgroundColor: "#4f8cff"
          }
        ]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8b95ab" }, grid: { color: "#2a3350" } },
          y: { ticks: { color: "#8b95ab" }, grid: { color: "#2a3350" }, beginAtZero: true }
        }
      }
    });

    // Top reporting organizations leaderboard
    const orgCounts = {};
    allReports.forEach((r) => {
      orgCounts[r.organizationName] = (orgCounts[r.organizationName] || 0) + 1;
    });
    const sortedOrgs = Object.entries(orgCounts).sort((a, b) => b[1] - a[1]);
    document.querySelector("#orgTable tbody").innerHTML = sortedOrgs
      .map(([org, count]) => `<tr><td>${escapeHtml(org)}</td><td>${count}</td></tr>`)
      .join("");

    // Recent activity feed
    const feed = document.getElementById("activityFeed");
    feed.innerHTML = allReports
      .slice(0, 8)
      .map((r) => {
        const date = new Date(r.createdAt || r.dateOfAttack).toLocaleString();
        return `
          <div class="feed-item">
            <strong>${escapeHtml(r.attackTitle)}</strong>
            <span class="badge" style="margin-left:8px;">${escapeHtml(r.attackType)}</span>
            <div class="muted" style="font-size:0.8rem; margin-top:4px;">
              ${escapeHtml(r.organizationName)} · ${date}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
}

function searchIOC() {
  const query = document.getElementById("iocSearchInput").value.trim().toLowerCase();
  const resultsEl = document.getElementById("iocResults");

  if (!query) {
    resultsEl.innerHTML = "";
    return;
  }

  const matches = allReports.filter((r) => {
    const all = [
      ...(r.ioc?.ipAddresses || []),
      ...(r.ioc?.fileHashes || []),
      ...(r.ioc?.domains || [])
    ];
    return all.some((v) => v.toLowerCase().includes(query));
  });

  if (matches.length === 0) {
    resultsEl.innerHTML = `<p class="muted">No reports reference an IOC matching "${escapeHtml(query)}".</p>`;
    return;
  }

  resultsEl.innerHTML = matches
    .map((r) => {
      const iocs = [
        ...(r.ioc?.ipAddresses || []),
        ...(r.ioc?.fileHashes || []),
        ...(r.ioc?.domains || [])
      ];
      return `
        <div class="feed-item">
          <strong>${escapeHtml(r.attackTitle)}</strong>
          <span class="badge" style="margin-left:8px;">${escapeHtml(r.attackType)}</span>
          <div class="muted" style="font-size:0.8rem; margin:6px 0;">Reported by ${escapeHtml(r.organizationName)}</div>
          <div>${iocs.map((v) => `<span class="ioc-tag">${escapeHtml(v)}</span>`).join("")}</div>
        </div>
      `;
    })
    .join("");
}

function exportCSV() {
  if (allReports.length === 0) {
    showAlert("alertBox", "No reports to export yet.", "error");
    return;
  }

  const headers = ["Title", "Type", "Organization", "Date of Attack", "Impact", "Report Hash"];
  const rows = allReports.map((r) => [
    r.attackTitle,
    r.attackType,
    r.organizationName,
    new Date(r.dateOfAttack).toLocaleDateString(),
    r.impact,
    r.reportHash
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "threat_intelligence_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("iocSearchInput").addEventListener("keyup", (e) => {
  if (e.key === "Enter") searchIOC();
});

loadAnalystDashboard();