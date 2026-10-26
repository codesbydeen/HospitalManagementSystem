const app = document.querySelector("#doctor-app");
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

async function api(path) {
  const response = await fetch(`/api/${path}`);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) location.assign("patient-login.html");
    throw new Error(result.error || "Unable to load the doctor portal.");
  }
  return result;
}

function showError(error) {
  app.replaceChildren();
  const message = document.createElement("p");
  message.className = "portal-feedback error";
  message.textContent = error.message;
  app.append(message);
}

async function showPatients() {
  const patients = await api("doctor/patients");
  app.innerHTML = `<div class="page-heading"><div><h1>My patients</h1><p>Only patients assigned to your care are shown here.</p></div></div>
    <div class="surface panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Record number</th><th>Date of birth</th><th>Contact</th><th>Last appointment</th><th></th></tr></thead>
    <tbody>${patients.map((patient) => `<tr><td><strong>${escapeHtml(patient.name)}</strong></td><td>${escapeHtml(patient.recordNumber)}</td><td>${formatDate(patient.dateOfBirth)}</td><td>${escapeHtml(patient.phone)}<span class="muted">${escapeHtml(patient.email || "")}</span></td><td>${formatDate(patient.lastAppointment)}</td><td><button class="secondary-btn view-patient" data-id="${Number(patient.id)}">View record</button></td></tr>`).join("")}</tbody></table></div>${patients.length ? "" : '<p class="muted">No patients are currently assigned to your care.</p>'}</div>`;
  app.querySelectorAll(".view-patient").forEach((button) => {
    button.onclick = () => showPatient(Number(button.dataset.id));
  });
}

async function showPatient(id) {
  try {
    const { patient, appointments, consultations } = await api(`doctor/patients/${id}`);
    app.innerHTML = `<div class="page-heading"><div><h1>${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</h1><p>${escapeHtml(patient.recordNumber)} · Patient record</p></div><button class="secondary-btn" id="back-to-patients">Back to my patients</button></div>
      <div class="surface panel"><h2>Patient information</h2><div class="form-grid">
        <div><strong>Date of birth</strong><p>${formatDate(patient.dateOfBirth)}</p></div>
        <div><strong>Sex</strong><p>${escapeHtml(patient.sex)}</p></div>
        <div><strong>Phone</strong><p>${escapeHtml(patient.phone)}</p></div>
        <div><strong>Email</strong><p>${escapeHtml(patient.email || "—")}</p></div>
        <div class="field full"><strong>Address</strong><p>${escapeHtml(patient.address || "—")}</p></div>
        <div class="field full"><strong>Medical history</strong><p>${escapeHtml(patient.medicalHistory || "No medical history recorded")}</p></div>
      </div></div>
      <div class="surface panel" style="margin-top:20px"><h2>Your appointments</h2>${appointments.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Department</th><th>Reason</th><th>Status</th></tr></thead><tbody>${appointments.map((item) => `<tr><td>${formatDate(item.appointmentAt)}</td><td>${escapeHtml(item.department)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.status)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No appointments recorded.</p>'}</div>
      <div class="surface panel" style="margin-top:20px"><h2>Your consultation notes</h2>${consultations.length ? consultations.map((item) => `<article class="activity-item"><div><strong>${formatDate(item.appointmentAt)}</strong><p>${escapeHtml(item.diagnosis)}</p><p class="muted">${escapeHtml(item.clinicalNotes || "")}</p><p class="muted">${escapeHtml(item.treatmentPlan || "")}</p></div></article>`).join("") : '<p class="muted">No consultation notes recorded.</p>'}</div>`;
    document.querySelector("#back-to-patients").onclick = showPatients;
  } catch (error) {
    showError(error);
  }
}

async function start() {
  try {
    const { session } = await api("session");
    if (session.role !== "doctor") {
      location.assign(session.role === "admin" ? "admin.html" : "consultation-history.html");
      return;
    }
    document.querySelector("#doctor-name").textContent = `Dr. ${session.firstName} ${session.lastName}`;
    document.querySelector("#doctor-initials").textContent = [session.firstName, session.lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    await showPatients();
  } catch (error) {
    showError(error);
  }
}

document.querySelector("#doctor-logout").onclick = async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    sessionStorage.removeItem("careflowPatient");
    location.assign("patient-login.html");
  }
};

start();
