const app = document.querySelector("#app");
const pageLabel = document.querySelector("#page-label");
const toast = document.querySelector("#toast");
let adminName = "";
let directoryTabAfterReload = "patients";
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
const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
const money = (value) => `R ${Number(value || 0).toFixed(2)}`;
const pill = (value) => {
  const state = String(value || "");
  const style =
    state === "Unpaid" || state === "Pending" || state === "Scheduled"
      ? "warn"
      : state === "Cancelled" || state === "Low stock" || state === "Expiring soon"
        ? "danger"
        : "";
  return `<span class="pill ${style}">${escapeHtml(state || "—")}</span>`;
};

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach CareFlow. Check that the server is running.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("CareFlow returned an unexpected response. Restart the server and try again.");
  }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      location.assign("patient-login.html");
      throw new Error("Please log in to continue.");
    }
    throw new Error(result.error || "Unable to load CareFlow data.");
  }
  return result;
}

function page(title, subtitle, action = "") {
  pageLabel.textContent = title;
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action}</div>`;
}

function showError(error) {
  app.replaceChildren();
  const message = document.createElement("p");
  message.className = "portal-feedback error";
  message.textContent = error.message;
  app.append(message);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function chartBars(days) {
  const max = Math.max(1, ...days.map((day) => Number(day.total)));
  return `<div class="bar-chart">${days
    .map((day) => {
      const height = Math.max(3, (Number(day.total) / max) * 100);
      return `<div class="bar-col"><div class="bar" style="height:${height}%"></div><span>${escapeHtml(new Date(`${String(day.day).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }))}</span></div>`;
    })
    .join("")}</div>`;
}

async function dashboard() {
  const data = await api("admin/dashboard");
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  app.innerHTML =
    page(
      `Welcome, ${adminName}`,
      `Operational overview for ${today}.`,
      '<a class="primary-btn" href="#patients">+ Add patient or doctor</a>',
    ) +
    `<div class="kpi-grid">
      <div class="surface kpi"><span class="kpi-label">Patient records</span><div class="kpi-value">${Number(data.patientCount)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Appointments today</span><div class="kpi-value">${Number(data.appointmentsToday)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Medication stock units</span><div class="kpi-value">${Number(data.inventory.stockUnits)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Inventory items needing attention</span><div class="kpi-value">${Number(data.inventory.attentionCount)}</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="surface panel"><div class="panel-header"><h2>Appointments over the last 7 days</h2><a class="link" href="#reports">View report</a></div>${chartBars(data.visits)}</div>
      <div class="surface panel"><div class="panel-header"><h2>Recent activity</h2><a class="link" href="#patients">Patient directory</a></div>
      ${data.activity.length ? data.activity.map((item) => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${escapeHtml(item.type)}</strong><small>${escapeHtml(item.description)} · ${formatDate(item.occurredAt)}</small></div></div>`).join("") : '<p class="muted">No activity recorded yet.</p>'}</div>
    </div>
    <div class="surface panel" style="margin-top:24px"><div class="panel-header"><h2>Today's appointments</h2><a class="link" href="#appointments">Manage appointments</a></div>
    ${data.todayAppointments.length ? `<ul class="appointment-list">${data.todayAppointments.map((item) => `<li class="appointment-row"><div class="avatar">${escapeHtml(item.patient.split(/\s+/).map((part) => part[0]).join("").slice(0, 2))}</div><div><strong>${escapeHtml(item.patient)}</strong><small class="muted">${escapeHtml(item.doctor)} · ${escapeHtml(item.reason)}</small></div><span class="time">${formatTime(item.appointmentAt)}</span>${pill(item.status)}</li>`).join("")}</ul>` : '<p class="muted">No appointments scheduled for today.</p>'}</div>`;
}

async function patients() {
  const rows = await api("patients");
  app.innerHTML =
    page(
      "Patients & staff",
      "Manage patient records and the clinical team.",
      '<button class="primary-btn" id="add-record">+ Add patient</button> <button class="secondary-btn" id="add-doctor">+ Add doctor</button>',
    ) +
    `<div class="tabs"><button class="tab active" data-directory="patients">Patients (${rows.length})</button><button class="tab" data-directory="doctors">Doctors</button></div><div class="surface panel" id="directory-content"></div>`;
  const directory = document.querySelector("#directory-content");
  const renderPatients = () => {
    directory.innerHTML = `<div class="toolbar"><h2>Patient directory</h2><input class="search" id="directory-search" placeholder="Search patients..." aria-label="Search patients"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Record number</th><th>Date of birth</th><th>Contact</th><th>Registered</th></tr></thead><tbody>${rows.map((patient) => `<tr><td><strong>${escapeHtml(patient.name)}</strong><span class="muted">${escapeHtml(patient.email || "No email recorded")}</span></td><td>${escapeHtml(patient.recordNumber)}</td><td>${formatDate(patient.dateOfBirth)}</td><td>${escapeHtml(patient.phone)}</td><td>${formatDate(patient.createdAt)}</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<p class="muted">No patient records yet.</p>'}`;
    document.querySelector("#directory-search").addEventListener("input", (event) => {
      const query = event.target.value.toLowerCase();
      directory.querySelectorAll("tbody tr").forEach((row) => {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    });
  };
  renderPatients();
  document.querySelector("#add-record").onclick = patientForm;
  document.querySelector("#add-doctor").onclick = doctorForm;
  document.querySelectorAll("[data-directory]").forEach((tab) => {
    tab.onclick = async () => {
      document.querySelectorAll("[data-directory]").forEach((item) =>
        item.classList.toggle("active", item === tab),
      );
      if (tab.dataset.directory === "patients") {
        renderPatients();
        return;
      }
      try {
        const doctors = await api("doctors/directory");
        directory.innerHTML = `<div class="toolbar"><h2>Doctor directory</h2><input class="search" id="directory-search" placeholder="Search doctors..." aria-label="Search doctors"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Doctor</th><th>Specialty</th><th>License</th><th>Contact</th><th>Status</th></tr></thead><tbody>${doctors.map((doctor) => `<tr><td>${escapeHtml(doctor.name)}</td><td>${escapeHtml(doctor.specialty)}</td><td>${escapeHtml(doctor.licenseNumber)}</td><td>${escapeHtml([doctor.email, doctor.phone].filter(Boolean).join(" · ") || "No contact recorded")}</td><td>${pill(doctor.isActive ? "Active" : "Inactive")}</td></tr>`).join("")}</tbody></table></div>${doctors.length ? "" : '<p class="muted">No doctors have been added yet.</p>'}`;
        document.querySelector("#directory-search").addEventListener("input", (event) => {
          const query = event.target.value.toLowerCase();
          directory.querySelectorAll("tbody tr").forEach((row) => {
            row.hidden = !row.textContent.toLowerCase().includes(query);
          });
        });
      } catch (error) {
        showError(error);
      }
    };
  });
  if (directoryTabAfterReload === "doctors") {
    directoryTabAfterReload = "patients";
    document.querySelector('[data-directory="doctors"]').click();
  }
}

function patientForm() {
  app.innerHTML =
    page("Register patient", "Create a patient record.") +
    `<form class="surface panel" id="patient-form"><div class="form-grid">
      <div class="field"><label for="firstName">First name</label><input id="firstName" name="firstName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="lastName">Last name</label><input id="lastName" name="lastName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="dateOfBirth">Date of birth</label><input id="dateOfBirth" name="dateOfBirth" type="date" required></div>
      <div class="field"><label for="sex">Sex</label><select id="sex" name="sex" required><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></div>
      <div class="field"><label for="phone">Phone number</label><input id="phone" name="phone" type="tel" required minlength="7" maxlength="30"></div>
      <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" maxlength="160"></div>
      <div class="field full"><label for="address">Home address</label><input id="address" name="address" maxlength="255"></div>
      <div class="field full"><label for="medicalHistory">Medical history</label><textarea id="medicalHistory" name="medicalHistory"></textarea></div>
    </div><div class="form-actions"><a class="secondary-btn" href="#patients">Cancel</a><button class="primary-btn" type="submit">Create patient record</button></div></form>`;
  document.querySelector("#patient-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("patients", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      showToast("Patient record created");
      await patients();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}

function doctorForm() {
  app.innerHTML =
    page("Add doctor", "Add a clinician to the CareFlow directory.") +
    `<form class="surface panel" id="doctor-form"><div class="form-grid">
      <div class="field"><label for="doctor-firstName">First name</label><input id="doctor-firstName" name="firstName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="doctor-lastName">Last name</label><input id="doctor-lastName" name="lastName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="doctor-specialty">Specialty</label><input id="doctor-specialty" name="specialty" required minlength="2" maxlength="120"></div>
      <div class="field"><label for="doctor-license">License number</label><input id="doctor-license" name="licenseNumber" required minlength="3" maxlength="60"></div>
      <div class="field"><label for="doctor-phone">Phone</label><input id="doctor-phone" name="phone" type="tel" minlength="7" maxlength="30"></div>
      <div class="field"><label for="doctor-email">Email</label><input id="doctor-email" name="email" type="email" maxlength="160"></div>
    </div><div class="form-actions"><a class="secondary-btn" href="#patients">Cancel</a><button class="primary-btn" type="submit">Add doctor</button></div></form>`;
  document.querySelector("#doctor-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("doctors", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      showToast("Doctor added to the directory");
      directoryTabAfterReload = "doctors";
      await patients();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}

async function appointments() {
  const rows = await api("appointments");
  app.innerHTML =
    page(
      "Appointments",
      "Review appointments and update their status.",
      '<button class="primary-btn" id="add-appointment">+ New appointment</button>',
    ) +
    `<div class="surface panel"><div class="toolbar"><h2>Appointment schedule</h2><input class="search" id="appointment-search" placeholder="Search appointments..." aria-label="Search appointments"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date & time</th><th>Patient</th><th>Clinician</th><th>Reason</th><th>Status</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${formatDate(item.appointmentAt)}</strong><span class="muted">${formatTime(item.appointmentAt)} · ${escapeHtml(item.source)}</span></td><td>${escapeHtml(item.patient)}</td><td>${escapeHtml(item.doctor)}<span class="muted">${escapeHtml(item.specialty)}</span></td><td>${escapeHtml(item.reason)}</td><td><select class="search status-select" aria-label="Appointment status" data-id="${Number(item.id)}">${["Pending", "Scheduled", "Checked in", "Completed", "Cancelled"].map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<p class="muted">No appointments have been recorded.</p>'}</div>`;
  document.querySelector("#add-appointment").onclick = newAppointmentForm;
  document.querySelector("#appointment-search").addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    app.querySelectorAll("tbody tr").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  });
  document.querySelectorAll(".status-select").forEach((select) => {
    select.onchange = async () => {
      select.disabled = true;
      try {
        await api(`appointments/${select.dataset.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value }),
        });
        showToast("Appointment status updated");
      } catch (error) {
        showToast(error.message);
        await appointments();
      }
    };
  });
}

async function newAppointmentForm() {
  try {
    const [patients, doctors] = await Promise.all([
      api("patients"),
      api("doctors/directory"),
    ]);
    const activeDoctors = doctors.filter((doctor) => doctor.isActive);
    if (!patients.length || !activeDoctors.length) {
      showError(new Error(
        !patients.length
          ? "Add a patient record before creating an appointment."
          : "Add an active doctor before creating an appointment.",
      ));
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minimumDate = new Date(
      tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);
    app.innerHTML =
      page("New appointment", "Schedule an appointment for a patient.") +
      `<form class="surface panel" id="admin-appointment-form"><div class="form-grid">
        <div class="field"><label for="appointment-patient">Patient</label><select id="appointment-patient" name="patientId" required><option value="">Select a patient</option>${patients.map((patient) => `<option value="${Number(patient.id)}">${escapeHtml(patient.name)} · ${escapeHtml(patient.recordNumber)}</option>`).join("")}</select></div>
        <div class="field"><label for="appointment-doctor">Doctor</label><select id="appointment-doctor" name="doctorId" required><option value="">Select a doctor</option>${activeDoctors.map((doctor) => `<option value="${Number(doctor.id)}">${escapeHtml(doctor.name)} · ${escapeHtml(doctor.specialty)}</option>`).join("")}</select></div>
        <div class="field"><label for="appointment-date">Date</label><input id="appointment-date" name="preferredDate" type="date" min="${minimumDate}" required></div>
        <div class="field"><label for="appointment-time">Time</label><select id="appointment-time" name="preferredTime" required><option value="">Select a time</option>${Array.from({ length: 17 }, (_, index) => {
          const minutes = 8 * 60 + 30 + index * 30;
          return `<option value="${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}">${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}</option>`;
        }).join("")}</select></div>
        <div class="field full"><label for="appointment-reason">Reason for visit</label><input id="appointment-reason" name="reason" required minlength="3" maxlength="255"></div>
      </div><div class="form-actions"><button class="secondary-btn" id="cancel-appointment" type="button">Cancel</button><button class="primary-btn" type="submit">Create appointment</button></div></form>`;
    document.querySelector("#cancel-appointment").onclick = appointments;
    document.querySelector("#admin-appointment-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api("appointments/admin", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        showToast("Appointment created");
        await appointments();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    };
  } catch (error) {
    showError(error);
  }
}

async function pharmacy() {
  const items = await api("pharmacy/inventory");
  const stockUnits = items.reduce((total, item) => total + Number(item.stock), 0);
  const value = items.reduce(
    (total, item) => total + Number(item.stock) * Number(item.unitPrice),
    0,
  );
  const lowStock = items.filter((item) => item.alert === "Low stock").length;
  const expiring = items.filter((item) => item.alert === "Expiring soon").length;
  app.innerHTML =
    page(
      "Pharmacy & inventory",
      "Live medication stock and expiry status.",
      '<button class="primary-btn" id="add-medication">+ Add medication</button>',
    ) +
    `<div class="kpi-grid">
      <div class="surface kpi"><span class="kpi-label">Inventory value</span><div class="kpi-value">${money(value)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Stock units</span><div class="kpi-value">${stockUnits}</div></div>
      <div class="surface kpi"><span class="kpi-label">Low stock items</span><div class="kpi-value">${lowStock}</div></div>
      <div class="surface kpi"><span class="kpi-label">Expiring within 30 days</span><div class="kpi-value">${expiring}</div></div>
    </div><div class="surface panel"><div class="panel-header"><h2>Medication inventory</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Medication</th><th>Stock</th><th>Reorder level</th><th>Expiry</th><th>Alert</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><span class="muted">${escapeHtml(item.dosage)} · ${money(item.unitPrice)}</span></td><td>${Number(item.stock)}</td><td>${Number(item.reorderLevel)}</td><td>${formatDate(item.expiryDate)}</td><td>${pill(item.alert)}</td></tr>`).join("")}</tbody></table></div>${items.length ? "" : '<p class="muted">No medication inventory has been entered.</p>'}</div>`;
  document.querySelector("#add-medication").onclick = medicationForm;
}

function medicationForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minimumExpiry = new Date(
    tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  app.innerHTML =
    page("Add medication", "Enter medication details to add it to inventory.") +
    `<form class="surface panel" id="medication-form"><div class="form-grid">
      <div class="field"><label for="medication-name">Medication name</label><input id="medication-name" name="name" required maxlength="160"></div>
      <div class="field"><label for="medication-dosage">Dosage</label><input id="medication-dosage" name="dosage" required maxlength="80" placeholder="e.g. 500 mg"></div>
      <div class="field"><label for="medication-stock">Stock quantity</label><input id="medication-stock" name="stock" type="number" min="0" max="4294967295" step="1" value="0" required></div>
      <div class="field"><label for="medication-reorder">Reorder level</label><input id="medication-reorder" name="reorderLevel" type="number" min="0" max="4294967295" step="1" value="10" required></div>
      <div class="field"><label for="medication-price">Unit price (R)</label><input id="medication-price" name="unitPrice" type="number" min="0" max="99999999.99" step="0.01" value="0.00" required></div>
      <div class="field"><label for="medication-expiry">Expiry date</label><input id="medication-expiry" name="expiryDate" type="date" min="${minimumExpiry}" required></div>
    </div><div class="form-actions"><button class="secondary-btn" id="cancel-medication" type="button">Cancel</button><button class="primary-btn" type="submit">Add to inventory</button></div></form>`;
  document.querySelector("#cancel-medication").onclick = pharmacy;
  document.querySelector("#medication-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("pharmacy/inventory", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      showToast("Medication added to inventory");
      await pharmacy();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}

async function billing() {
  const data = await api("billing/invoices");
  const invoices = data.invoices;
  app.innerHTML =
    page("Billing", "Review recorded invoices and payment status.") +
    `<div class="kpi-grid">
      <div class="surface kpi"><span class="kpi-label">Collected this month</span><div class="kpi-value">${money(data.totals.collectedThisMonth)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Outstanding balance</span><div class="kpi-value">${money(data.totals.outstanding)}</div><span class="trend">${Number(data.totals.outstandingCount || 0)} unpaid invoice(s)</span></div>
    </div><div class="surface panel"><div class="panel-header"><h2>Invoices</h2><span class="muted">${invoices.length} record(s)</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Patient</th><th>Issued</th><th>Total</th><th>Status</th></tr></thead><tbody>${invoices.map((item) => `<tr><td><strong>${escapeHtml(item.invoiceNumber)}</strong></td><td>${escapeHtml(item.patient)}</td><td>${formatDate(item.issuedAt)}</td><td><strong>${money(item.total)}</strong></td><td>${pill(item.status)}</td></tr>`).join("")}</tbody></table></div>${invoices.length ? "" : '<p class="muted">No invoices have been issued.</p>'}</div>`;
}

async function clinical() {
  const data = await api("admin/clinical");
  app.innerHTML =
    page("Clinical workflow", "Today's patient queue and recorded consultations.") +
    `<div class="three-column">
      <div class="surface panel"><div class="panel-header"><h2>Today's queue</h2>${pill(`${data.appointments.length} patients`)}</div>${data.appointments.length ? data.appointments.map((item) => `<div class="appointment-row"><div class="avatar">${escapeHtml(item.patient.split(/\s+/).map((part) => part[0]).join("").slice(0, 2))}</div><div><strong>${escapeHtml(item.patient)}</strong><small class="muted">${escapeHtml(item.reason)} · ${formatTime(item.appointmentAt)}</small></div></div>`).join("") : '<p class="muted">No patients are currently in today’s queue.</p>'}</div>
      <div class="surface panel"><div class="panel-header"><h2>Active care team</h2><a class="link" href="#patients">Manage staff</a></div>${data.doctors.length ? data.doctors.map((item) => `<div class="metric-line"><span>${escapeHtml(item.specialty)}</span><strong>${Number(item.total)}</strong></div>`).join("") : '<p class="muted">No active doctors have been added.</p>'}</div>
      <div class="surface panel"><div class="panel-header"><h2>Queue status</h2></div>${["Pending", "Scheduled", "Checked in"].map((status) => `<div class="metric-line"><span>${status}</span><strong>${data.appointments.filter((item) => item.status === status).length}</strong></div>`).join("")}</div>
    </div><div class="surface panel" style="margin-top:24px"><div class="panel-header"><h2>Recent consultations</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Clinician</th><th>Diagnosis</th><th>Treatment plan</th><th>Recorded</th></tr></thead><tbody>${data.consultations.map((item) => `<tr><td><strong>${escapeHtml(item.patient)}</strong><span class="muted">${escapeHtml(item.recordNumber)}</span></td><td>${escapeHtml(item.doctor)}</td><td>${escapeHtml(item.diagnosis)}</td><td>${escapeHtml(item.treatmentPlan || "—")}</td><td>${formatDate(item.createdAt)}</td></tr>`).join("")}</tbody></table></div>${data.consultations.length ? "" : '<p class="muted">No consultations have been recorded.</p>'}</div>`;
}

async function reports() {
  const data = await api("admin/reports");
  app.innerHTML =
    page("Reports", "Operational totals calculated from recorded activity.") +
    `<div class="kpi-grid">
      <div class="surface kpi"><span class="kpi-label">Patient records</span><div class="kpi-value">${Number(data.patientCount)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Completed visits</span><div class="kpi-value">${Number(data.completedVisits)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Paid revenue this month</span><div class="kpi-value">${money(data.monthlyRevenue)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Active doctors</span><div class="kpi-value">${Number(data.activeDoctors)}</div></div>
    </div><div class="surface panel"><div class="panel-header"><h2>Appointments over the last 7 days</h2></div>${chartBars(data.visits)}</div>
    <div class="surface panel" style="margin-top:24px"><div class="panel-header"><h2>Appointments by department</h2></div>${data.departments.length ? data.departments.map((item) => `<div class="metric-line"><span>${escapeHtml(item.department)}</span><strong>${Number(item.appointments)} total · ${Number(item.completed)} completed</strong></div>`).join("") : '<p class="muted">No appointment activity has been recorded.</p>'}</div>`;
}

const views = { dashboard, patients, appointments, pharmacy, billing, clinical, reports };

async function route() {
  if (!adminName) return;
  const name = location.hash.slice(1) || document.body.dataset.page || "dashboard";
  document.querySelectorAll(".nav-link").forEach((link) =>
    link.classList.toggle("active", link.dataset.view === name),
  );
  try {
    await (views[name] || dashboard)();
  } catch (error) {
    showError(error);
  }
}

async function startAdmin() {
  try {
    const result = await api("session");
    if (result.session.role !== "admin") {
      location.assign(result.session.role === "patient" ? "consultation-history.html" : "patient-login.html");
      return;
    }
    adminName = [result.session.firstName, result.session.lastName]
      .filter(Boolean)
      .join(" ");
    if (!adminName) throw new Error("Your account name is unavailable.");
    const initials = [result.session.firstName, result.session.lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    document.querySelectorAll(".user-card strong").forEach((element) => {
      element.textContent = adminName;
    });
    document.querySelectorAll(".user-card .avatar, .topbar .avatar-light").forEach((element) => {
      element.textContent = initials;
    });
    window.addEventListener("hashchange", route);
    await route();
  } catch (error) {
    showError(error);
  }
}

startAdmin();
