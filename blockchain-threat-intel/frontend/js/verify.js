requireAuth();
applyRoleBasedNav();

async function verifyReport() {
  const hash = document.getElementById("hashInput").value.trim();
  const resultCard = document.getElementById("resultCard");
  resultCard.innerHTML = "";

  if (!hash) {
    showAlert("alertBox", "Please enter a report hash to verify", "error");
    return;
  }

  try {
    const data = await apiRequest(`/verifyThreat/${encodeURIComponent(hash)}`);

    if (!data.verified) {
      document.getElementById("alertBox").style.display = "none";
      resultCard.innerHTML = `
        <div class="card">
          <span class="badge danger">NOT FOUND</span>
          <p style="margin-top:10px;">${data.message}</p>
        </div>
      `;
      return;
    }

    document.getElementById("alertBox").style.display = "none";
    const badgeClass = data.integrityMatch ? "" : "danger";
    const badgeText = data.integrityMatch ? "VERIFIED ✅" : "MISMATCH ⚠️";

    resultCard.innerHTML = `
      <div class="card">
        <span class="badge ${badgeClass}">${badgeText}</span>
        <p style="margin-top:10px;">${data.message}</p>

        <table style="margin-top:16px;">
          <tr><th>Organization</th><td>${data.onChain.organization}</td></tr>
          <tr><th>IPFS Hash</th><td>${data.onChain.ipfsHash}</td></tr>
          <tr><th>On-chain Timestamp</th><td>${new Date(data.onChain.timestamp * 1000).toLocaleString()}</td></tr>
        </table>
      </div>
    `;
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
}
