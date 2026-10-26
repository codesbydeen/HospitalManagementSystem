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
    const { patient, appointments, consultations, prescriptions } = await api(`doctor/patients/${id}`);
    const appointmentActions = appointments.map((item) => {
      const action = item.status === "Checked in"
        ? `<button class="secondary-btn record-consultation" data-id="${Number(item.id)}">Record consultation</button>`
        : ["Pending", "Scheduled"].includes(item.status)
          ? `<button class="secondary-btn check-in" data-id="${Number(item.id)}">Check in</button>`
          : "";
      return `<tr><td>${formatDate(item.appointmentAt)}</td><td>${escapeHtml(item.department)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.status)}</td><td>${action}</td></tr>`;
    }).join("");
    app.innerHTML = `<div class="page-heading"><div><h1>${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</h1><p>${escapeHtml(patient.recordNumber)} · Patient record</p></div><button class="secondary-btn" id="back-to-patients">Back to my patients</button></div>
      <div class="surface panel"><h2>Patient information</h2><div class="form-grid">
        <div><strong>Date of birth</strong><p>${formatDate(patient.dateOfBirth)}</p></div>
        <div><strong>Sex</strong><p>${escapeHtml(patient.sex)}</p></div>
        <div><strong>Phone</strong><p>${escapeHtml(patient.phone)}</p></div>
        <div><strong>Email</strong><p>${escapeHtml(patient.email || "—")}</p></div>
        <div class="field full"><strong>Address</strong><p>${escapeHtml(patient.address || "—")}</p></div>
        <div class="field full"><strong>Medical history</strong><p>${escapeHtml(patient.medicalHistory || "No medical history recorded")}</p></div>
      </div></div>
      <div class="surface panel" style="margin-top:20px"><h2>Your appointments</h2>${appointments.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Department</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>${appointmentActions}</tbody></table></div>` : '<p class="muted">No appointments recorded.</p>'}</div>
      <div class="surface panel" style="margin-top:20px"><h2>Your consultation notes</h2>${consultations.length ? consultations.map((item) => `<article class="activity-item"><div><strong>${formatDate(item.appointmentAt)}</strong><p>${escapeHtml(item.diagnosis)}</p><p class="muted">${escapeHtml(item.clinicalNotes || "")}</p><p class="muted">${escapeHtml(item.treatmentPlan || "")}</p></div></article>`).join("") : '<p class="muted">No consultation notes recorded.</p>'}</div>`;
    app.insertAdjacentHTML("beforeend", `<div class="surface panel" style="margin-top:20px"><h2>Prescription history</h2>${prescriptions.length ? prescriptions.map((item) => `<article class="activity-item"><div><strong>${escapeHtml(item.medication)} ${escapeHtml(item.dosage)}</strong><p>${Number(item.quantity)} · ${escapeHtml(item.instructions)}</p><p class="muted">${escapeHtml(item.status)} · ${formatDate(item.createdAt)}</p></div></article>`).join("") : '<p class="muted">No prescriptions recorded.</p>'}</div>`);
    document.querySelector("#back-to-patients").onclick = showPatients;
    app.querySelectorAll(".check-in").forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          await api(`doctor/appointments/${button.dataset.id}/check-in`, { method: "POST" });
          await showPatient(id);
        } catch (error) {
          showError(error);
        }
      };
    });
    app.querySelectorAll(".record-consultation").forEach((button) => {
      button.onclick = () => consultationForm(id, Number(button.dataset.id));
    });
  } catch (error) {
    showError(error);
  }
}

async function consultationForm(patientId, appointmentId) {
  try {
    const medications = await api("doctor/medications");
    const medicationOptions = medications.map((item) =>
      `<option value="${Number(item.id)}">${escapeHtml(item.name)} ${escapeHtml(item.dosage)} · ${Number(item.stock)} in stock</option>`,
    ).join("");
    app.innerHTML = `<div class="page-heading"><div><h1>Record consultation</h1><p>Save the clinical record and any prescriptions for this checked-in visit.</p></div><button class="secondary-btn" id="cancel-consultation">Cancel</button></div>
      <form class="surface panel" id="consultation-form"><div class="form-grid">
        <div class="field full"><label for="diagnosis">Diagnosis</label><textarea id="diagnosis" name="diagnosis" required maxlength="10000"></textarea></div>
        <div class="field full"><label for="treatmentPlan">Treatment plan</label><textarea id="treatmentPlan" name="treatmentPlan" maxlength="10000"></textarea></div>
        <div class="field full"><label for="clinicalNotes">Clinical notes</label><textarea id="clinicalNotes" name="clinicalNotes" maxlength="10000"></textarea></div>
        <div class="field"><label for="followUpDate">Follow-up date</label><input id="followUpDate" name="followUpDate" type="date"></div>
      </div><div class="panel-header"><h2>Treatments and services</h2><button class="secondary-btn" id="add-charge" type="button">Add billable service</button></div>
      <div id="consultation-charges"></div>
      <div class="panel-header"><h2>Prescriptions</h2><button class="secondary-btn" id="add-prescription" type="button">Add medication</button></div>
      <div id="prescription-lines"></div>
      <div class="form-actions"><button class="primary-btn" type="submit">Save consultation</button></div></form>`;
    document.querySelector("#cancel-consultation").onclick = () => showPatient(patientId);
    const prescriptionLines = document.querySelector("#prescription-lines");
    const consultationCharges = document.querySelector("#consultation-charges");
    const addCharge = () => {
      const row = document.createElement("div");
      row.className = "form-grid consultation-charge";
      row.innerHTML = `<div class="field"><label>Treatment or service</label><input class="charge-description" maxlength="255" required></div>
        <div class="field"><label>Charge (R)</label><input class="charge-price" type="number" min="0" max="99999999.99" step="0.01" required></div>
        <div class="field"><button class="secondary-btn remove-charge" type="button">Remove</button></div>`;
      row.querySelector(".remove-charge").onclick = () => row.remove();
      consultationCharges.append(row);
    };
    const addPrescription = () => {
      const row = document.createElement("div");
      row.className = "form-grid prescription-row";
      row.innerHTML = `<div class="field"><label>Medication</label><select class="prescription-medication"><option value="">Select medication (optional)</option>${medicationOptions}</select></div>
        <div class="field"><label>Quantity</label><input class="prescription-quantity" type="number" min="1" max="10000" value="1"></div>
        <div class="field"><label>Instructions</label><input class="prescription-instructions" maxlength="255" placeholder="Dose and directions"></div>
        <div class="field"><button class="secondary-btn remove-prescription" type="button">Remove</button></div>`;
      row.querySelector(".remove-prescription").onclick = () => row.remove();
      prescriptionLines.append(row);
    };
    document.querySelector("#add-charge").onclick = addCharge;
    document.querySelector("#add-prescription").onclick = addPrescription;
    document.querySelector("#consultation-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const prescriptions = [...form.querySelectorAll(".prescription-row")]
        .map((row) => ({
          medicationId: row.querySelector(".prescription-medication").value,
          quantity: row.querySelector(".prescription-quantity").value,
          instructions: row.querySelector(".prescription-instructions").value.trim(),
        }))
        .filter((item) => item.medicationId);
      const additionalCharges = [...form.querySelectorAll(".consultation-charge")]
        .map((row) => ({
          description: row.querySelector(".charge-description").value.trim(),
          unitPrice: Number(row.querySelector(".charge-price").value),
        }));
      if (prescriptions.some((item) => !item.instructions)) {
        showError(new Error("Add dosage and directions for each selected medication."));
        return;
      }
      button.disabled = true;
      try {
        await api(`doctor/appointments/${appointmentId}/consultations`, {
          method: "POST",
          body: JSON.stringify({
            diagnosis: form.elements.diagnosis.value,
            treatmentPlan: form.elements.treatmentPlan.value,
            clinicalNotes: form.elements.clinicalNotes.value,
            followUpDate: form.elements.followUpDate.value,
            additionalCharges,
            prescriptions,
          }),
        });
        await showPatient(patientId);
      } catch (error) {
        showError(error);
      }
    };
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
