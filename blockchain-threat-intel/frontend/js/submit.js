requireAuth();

// Analysts are read-only - they shouldn't be able to reach this page at all.
const currentUser = getUser();
if (currentUser && currentUser.role === "analyst") {
  alert("Analyst accounts are read-only and cannot submit threat reports.");
  window.location.href = "analyst-dashboard.html";
}
applyRoleBasedNav();

// Holds any files the user attaches (either via "Auto-Fill" or "Attach Another File").
// Each entry: { filename, mimeType, data } where data is base64-encoded content.
let attachedFiles = [];

function splitCSV(value) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachmentList() {
  const list = document.getElementById("attachmentList");
  if (attachedFiles.length === 0) {
    list.innerHTML = `<li class="muted">No files attached yet.</li>`;
    return;
  }
  list.innerHTML = attachedFiles
    .map(
      (f, i) =>
        `<li>${f.filename} <button type="button" onclick="removeAttachment(${i})" class="danger" style="padding:2px 8px; margin-left:8px;">Remove</button></li>`
    )
    .join("");
}

function removeAttachment(i) {
  attachedFiles.splice(i, 1);
  renderAttachmentList();
}

// "Attach Another File" - just attaches the file to the submission,
// without trying to parse/auto-fill anything from it.
async function addAttachment() {
  const input = document.getElementById("fileInput");
  if (!input.files.length) {
    showAlert("alertBox", "Choose a file first", "error");
    return;
  }
  for (const file of input.files) {
    const data = await fileToBase64(file);
    attachedFiles.push({ filename: file.name, mimeType: file.type || "text/plain", data });
  }
  renderAttachmentList();
  input.value = "";
  showAlert("alertBox", "File attached. It will be uploaded to IPFS with your report.", "success");
}

// Very simple heuristic parser for plain-text incident write-ups.
// It looks for lines like "Label: value" and maps common labels to our
// form fields. Anything it can't confidently match goes into
// "additionalInformation" instead of being silently dropped.
function parseReportText(text) {
  const fieldMap = {
    "attack title": "attackTitle",
    "title": "attackTitle",
    "attack type": "attackType",
    "type": "attackType",
    "date of attack": "dateOfAttack",
    "date": "dateOfAttack",
    "ip address": "ip",
    "ip addresses": "ip",
    "file hash": "hash",
    "file hashes": "hash",
    "domain": "domain",
    "domains": "domain",
    "description": "attackDescription",
    "attack description": "attackDescription",
    "how it happened": "howItHappened",
    "how the attack happened": "howItHappened",
    "impact": "impact",
    "mitigation": "mitigationSteps",
    "mitigation steps": "mitigationSteps"
  };

  const result = { ip: "", hash: "", domain: "" };
  const leftover = [];

  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^([^:]{2,30}):\s*(.+)$/);
    if (match) {
      const label = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (fieldMap[label]) {
        result[fieldMap[label]] = value;
        return;
      }
    }
    leftover.push(line);
  });

  // If attack type wasn't explicitly labeled, try to guess it from the text
  if (!result.attackType) {
    const knownTypes = [
      "DDoS", "Phishing", "Malware", "Ransomware", "SQL Injection",
      "Man-in-the-Middle", "Zero-Day", "Insider Threat"
    ];
    const found = knownTypes.find((t) => text.toLowerCase().includes(t.toLowerCase()));
    if (found) result.attackType = found;
  }

  result.additionalInformation = leftover.join("\n");
  return result;
}

// "Auto-Fill Form From File" - reads the file as text, parses it,
// fills in whatever fields it can match, attaches the original file,
// and puts anything unmatched into Additional Information.
async function parseUploadedFile() {
  const input = document.getElementById("fileInput");
  if (!input.files.length) {
    showAlert("alertBox", "Choose a file first", "error");
    return;
  }

  const file = input.files[0];
  const text = await file.text();
  const parsed = parseReportText(text);

  if (parsed.attackTitle) document.getElementById("attackTitle").value = parsed.attackTitle;
  if (parsed.attackType) document.getElementById("attackType").value = parsed.attackType;

  if (parsed.dateOfAttack) {
    const d = new Date(parsed.dateOfAttack);
    if (!isNaN(d)) document.getElementById("dateOfAttack").value = d.toISOString().split("T")[0];
  }

  if (parsed.ip) document.getElementById("iocIps").value = parsed.ip;
  if (parsed.hash) document.getElementById("iocHashes").value = parsed.hash;
  if (parsed.domain) document.getElementById("iocDomains").value = parsed.domain;

  if (parsed.attackDescription) document.getElementById("attackDescription").value = parsed.attackDescription;
  if (parsed.howItHappened) document.getElementById("howItHappened").value = parsed.howItHappened;
  if (parsed.impact) document.getElementById("impact").value = parsed.impact;
  if (parsed.mitigationSteps) document.getElementById("mitigationSteps").value = parsed.mitigationSteps;

  document.getElementById("additionalInformation").value = parsed.additionalInformation || "";

  // Also attach the original file so it's preserved in full on IPFS
  const data = await fileToBase64(file);
  attachedFiles.push({ filename: file.name, mimeType: file.type || "text/plain", data });
  renderAttachmentList();

  showAlert("alertBox", "Form auto-filled from the uploaded file. Review the fields (especially Additional Information) before submitting.", "success");
}

document.getElementById("submitForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    attackTitle: document.getElementById("attackTitle").value.trim(),
    attackType: document.getElementById("attackType").value,
    dateOfAttack: document.getElementById("dateOfAttack").value,
    ioc: {
      ipAddresses: splitCSV(document.getElementById("iocIps").value),
      fileHashes: splitCSV(document.getElementById("iocHashes").value),
      domains: splitCSV(document.getElementById("iocDomains").value)
    },
    attackDescription: document.getElementById("attackDescription").value.trim(),
    howItHappened: document.getElementById("howItHappened").value.trim(),
    impact: document.getElementById("impact").value.trim(),
    mitigationSteps: document.getElementById("mitigationSteps").value.trim(),
    additionalInformation: document.getElementById("additionalInformation").value.trim(),
    attachments: attachedFiles
  };

  try {
    const data = await apiRequest("/submitThreat", "POST", payload);
    showAlert("alertBox", "Threat report submitted and anchored on the blockchain!", "success");

    document.getElementById("resultCard").style.display = "block";
    document.getElementById("resultHash").textContent = data.report.reportHash;
    document.getElementById("resultIpfs").textContent = data.report.ipfsHash;
    document.getElementById("resultTx").textContent = data.report.blockchainTxHash;

    // Show the success popup
    document.getElementById("successModal").style.display = "flex";

    document.getElementById("submitForm").reset();
    attachedFiles = [];
    renderAttachmentList();
  } catch (err) {
    showAlert("alertBox", err.message, "error");
  }
});

renderAttachmentList();