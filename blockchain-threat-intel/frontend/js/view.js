requireAuth();
applyRoleBasedNav();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderThreatCard(report) {
  const date = new Date(report.dateOfAttack).toLocaleDateString();
  const iocs = [
    ...(report.ioc?.ipAddresses || []),
    ...(report.ioc?.fileHashes || []),
    ...(report.ioc?.domains || [])
  ];

  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h3 style="margin:0 0 6px 0;">${escapeHtml(report.attackTitle)}</h3>
          <span class="badge">${escapeHtml(report.attackType)}</span>
          <span class="muted" style="margin-left:10px;">by ${escapeHtml(report.organizationName)} · ${date}</span>
        </div>
      </div>

      <p style="margin-top:14px;"><strong>Description:</strong> ${escapeHtml(report.attackDescription)}</p>
      <p><strong>How it happened:</strong> ${escapeHtml(report.howItHappened)}</p>
      <p><strong>Impact:</strong> ${escapeHtml(report.impact)}</p>
      <p><strong>Mitigation:</strong> ${escapeHtml(report.mitigationSteps)}</p>

      ${iocs.length ? `<p><strong>IOCs:</strong> ${iocs.map(escapeHtml).join(", ")}</p>` : ""}

      <p style="margin-top:10px; margin-bottom:0;"><span class="muted">Blockchain Hash:</span></p>
      <div class="hash-box">${report.reportHash}</div>
    </div>
  `;
}

async function loadThreats() {
  const attackType = document.getElementById("filterType").value;
  const search = document.getElementById("searchBox").value.trim();

  const params = new URLSearchParams();
  if (attackType) params.set("attackType", attackType);
  if (search) params.set("search", search);

  try {
    const data = await apiRequest(`/getThreats?${params.toString()}`);
    const listEl = document.getElementById("threatList");

    if (data.reports.length === 0) {
      listEl.innerHTML = `<div class="card muted">No threat reports found.</div>`;
      return;
    }

    listEl.innerHTML = data.reports.map(renderThreatCard).join("");
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
}

loadThreats();
