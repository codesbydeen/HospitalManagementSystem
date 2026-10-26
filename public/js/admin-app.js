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
    state === "Unpaid" || state === "Pending" || state === "Scheduled" || state === "Ready for pickup"
      ? "warn"
      : state === "Cancelled" || state === "Low stock" || state === "Expiring soon" || state === "Expired"
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
        directory.innerHTML = `<div class="toolbar"><h2>Doctor directory</h2><input class="search" id="directory-search" placeholder="Search doctors..." aria-label="Search doctors"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Doctor</th><th>Specialty</th><th>License</th><th>Contact</th><th>Fee</th><th>Status</th><th>Portal access</th><th>Manage</th></tr></thead><tbody>${doctors.map((doctor) => `<tr><td>${escapeHtml(doctor.name)}</td><td>${escapeHtml(doctor.specialty)}</td><td>${escapeHtml(doctor.licenseNumber)}</td><td>${escapeHtml([doctor.email, doctor.phone].filter(Boolean).join(" · ") || "No contact recorded")}</td><td>${money(doctor.consultationFee)}</td><td>${pill(doctor.isActive ? "Active" : "Inactive")}</td><td>${doctor.hasAccount ? '<span class="muted">Doctor login ready</span>' : `<button class="secondary-btn create-doctor-login" data-id="${Number(doctor.id)}" data-name="${escapeHtml(doctor.name)}" data-email="${escapeHtml(doctor.email || "")}">Set up login</button>`}</td><td><button class="secondary-btn edit-doctor-profile" data-id="${Number(doctor.id)}">Edit profile</button> <button class="secondary-btn edit-doctor-schedule" data-id="${Number(doctor.id)}">Schedule</button></td></tr>`).join("")}</tbody></table></div>${doctors.length ? "" : '<p class="muted">No doctors have been added yet.</p>'}`;
        directory.querySelectorAll(".create-doctor-login").forEach((button) => {
          button.onclick = () => doctorAccountForm({
            id: Number(button.dataset.id),
            name: button.dataset.name,
            email: button.dataset.email,
          });
        });
        directory.querySelectorAll(".edit-doctor-schedule").forEach((button) => {
          button.onclick = () => doctorScheduleForm(doctors.find((doctor) => Number(doctor.id) === Number(button.dataset.id)));
        });
        directory.querySelectorAll(".edit-doctor-profile").forEach((button) => {
          button.onclick = () => doctorProfileForm(doctors.find((doctor) => Number(doctor.id) === Number(button.dataset.id)));
        });
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

function doctorProfileForm(doctor) {
  app.innerHTML = page(`Edit ${doctor.name}`, "Update clinician details and portal availability.") +
    `<form class="surface panel" id="doctor-profile-form"><div class="form-grid">
      <div class="field"><label for="profile-first-name">First name</label><input id="profile-first-name" name="firstName" value="${escapeHtml(doctor.firstName)}" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="profile-last-name">Last name</label><input id="profile-last-name" name="lastName" value="${escapeHtml(doctor.lastName)}" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="profile-specialty">Specialty</label><input id="profile-specialty" name="specialty" value="${escapeHtml(doctor.specialty)}" required minlength="2" maxlength="120"></div>
      <div class="field"><label for="profile-phone">Phone</label><input id="profile-phone" name="phone" type="tel" value="${escapeHtml(doctor.phone || "")}" minlength="7" maxlength="30"></div>
      <div class="field"><label for="profile-active">Portal availability</label><select id="profile-active" name="isActive"><option value="true" ${doctor.isActive ? "selected" : ""}>Active</option><option value="false" ${!doctor.isActive ? "selected" : ""}>Inactive</option></select></div>
    </div><div class="form-actions"><button class="secondary-btn" id="cancel-doctor-profile" type="button">Cancel</button><button class="primary-btn" type="submit">Save profile</button></div></form>`;
  document.querySelector("#cancel-doctor-profile").onclick = async () => {
    await patients();
    document.querySelector('[data-directory="doctors"]').click();
  };
  document.querySelector("#doctor-profile-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    values.isActive = values.isActive === "true";
    button.disabled = true;
    try {
      await api(`doctors/${doctor.id}/profile`, { method: "PATCH", body: JSON.stringify(values) });
      showToast("Doctor profile updated");
      await patients();
      document.querySelector('[data-directory="doctors"]').click();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}

function doctorScheduleForm(doctor) {
  let schedule = doctor.availabilitySchedule;
  if (typeof schedule === "string") schedule = JSON.parse(schedule);
  schedule ||= { days: [0, 1, 2, 3, 4, 5, 6], startTime: "08:30", endTime: "17:00", slotMinutes: 30 };
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  app.innerHTML = page(`Schedule for ${doctor.name}`, "Set the doctor's appointment availability and consultation fee.") +
    `<form class="surface panel" id="doctor-schedule-form"><div class="form-grid">
      <div class="field full"><span class="label">Available days</span><div class="form-grid">${weekdays.map((day, index) => `<label><input type="checkbox" name="day" value="${index}" ${schedule.days.includes(index) ? "checked" : ""}> ${day}</label>`).join("")}</div></div>
      <div class="field"><label for="schedule-start">Start time</label><input id="schedule-start" name="startTime" type="time" value="${escapeHtml(schedule.startTime)}" required></div>
      <div class="field"><label for="schedule-end">End time</label><input id="schedule-end" name="endTime" type="time" value="${escapeHtml(schedule.endTime)}" required></div>
      <div class="field"><label for="schedule-slot">Appointment length (minutes)</label><select id="schedule-slot" name="slotMinutes">${[15, 30, 45, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${Number(schedule.slotMinutes) === minutes ? "selected" : ""}>${minutes}</option>`).join("")}</select></div>
      <div class="field"><label for="schedule-fee">Consultation fee (R)</label><input id="schedule-fee" name="consultationFee" type="number" min="0" max="99999999.99" step="0.01" value="${Number(doctor.consultationFee)}" required></div>
    </div><div class="form-actions"><button class="secondary-btn" id="cancel-doctor-schedule" type="button">Cancel</button><button class="primary-btn" type="submit">Save schedule</button></div></form>`;
  document.querySelector("#cancel-doctor-schedule").onclick = async () => {
    await patients();
    document.querySelector('[data-directory="doctors"]').click();
  };
  document.querySelector("#doctor-schedule-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    button.disabled = true;
    try {
      await api(`doctors/${doctor.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          availabilitySchedule: {
            days: values.getAll("day").map(Number),
            startTime: values.get("startTime"),
            endTime: values.get("endTime"),
            slotMinutes: Number(values.get("slotMinutes")),
          },
          consultationFee: Number(values.get("consultationFee")),
        }),
      });
      showToast("Doctor schedule updated");
      await patients();
      document.querySelector('[data-directory="doctors"]').click();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
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
    page("Add doctor", "Add a clinician and create their restricted doctor-portal login.") +
    `<form class="surface panel" id="doctor-form"><div class="form-grid">
      <div class="field"><label for="doctor-firstName">First name</label><input id="doctor-firstName" name="firstName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="doctor-lastName">Last name</label><input id="doctor-lastName" name="lastName" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="doctor-specialty">Specialty</label><input id="doctor-specialty" name="specialty" required minlength="2" maxlength="120"></div>
      <div class="field"><label for="doctor-license">License number</label><input id="doctor-license" name="licenseNumber" required minlength="3" maxlength="60"></div>
      <div class="field"><label for="doctor-phone">Phone</label><input id="doctor-phone" name="phone" type="tel" minlength="7" maxlength="30"></div>
      <div class="field"><label for="doctor-email">Login email</label><input id="doctor-email" name="email" type="email" required maxlength="160" autocomplete="email"></div>
      <div class="field"><label for="doctor-password">Temporary password</label><input id="doctor-password" name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
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
      showToast("Doctor added with a restricted portal account");
      directoryTabAfterReload = "doctors";
      await patients();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}

function doctorAccountForm(doctor) {
  app.innerHTML =
    page(`Set up login for ${doctor.name}`, "The doctor will only be able to access patients assigned to them.") +
    `<form class="surface panel" id="doctor-account-form"><div class="form-grid">
      <div class="field"><label for="doctor-account-email">Login email</label><input id="doctor-account-email" name="email" type="email" value="${escapeHtml(doctor.email)}" required maxlength="160" autocomplete="email"></div>
      <div class="field"><label for="doctor-account-password">Temporary password</label><input id="doctor-account-password" name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
    </div><div class="form-actions"><a class="secondary-btn" href="#patients">Cancel</a><button class="primary-btn" type="submit">Create doctor login</button></div></form>`;
  document.querySelector("#doctor-account-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(`doctors/${doctor.id}/account`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      showToast("Doctor login created");
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
    `<div class="surface panel"><div class="toolbar"><h2>Appointment schedule</h2><input class="search" id="appointment-search" placeholder="Search appointments..." aria-label="Search appointments"></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date & time</th><th>Patient</th><th>Clinician</th><th>Reason</th><th>Status</th><th>Check-in log</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${formatDate(item.appointmentAt)}</strong><span class="muted">${formatTime(item.appointmentAt)} · ${escapeHtml(item.source)}</span></td><td>${escapeHtml(item.patient)}</td><td>${escapeHtml(item.doctor)}<span class="muted">${escapeHtml(item.specialty)}</span></td><td>${escapeHtml(item.reason)}</td><td><select class="search status-select" aria-label="Appointment status" data-id="${Number(item.id)}">${["Pending", "Scheduled", "Checked in", "Cancelled", ...(item.status === "Completed" ? ["Completed"] : [])].map((status) => `<option ${status === item.status ? "selected" : ""} ${status === "Completed" ? "disabled" : ""}>${status}</option>`).join("")}</select></td><td><button class="secondary-btn appointment-history" data-id="${Number(item.id)}">History</button></td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<p class="muted">No appointments have been recorded.</p>'}</div>`;
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
  app.querySelectorAll(".appointment-history").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const history = await api(`appointments/${button.dataset.id}/history`);
        const tableRow = button.closest("tr");
        const nextRow = tableRow.nextElementSibling;
        if (nextRow?.classList.contains("appointment-history-row")) {
          nextRow.remove();
          return;
        }
        const details = document.createElement("tr");
        details.className = "appointment-history-row";
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = history.length
          ? history.map((item) => `${item.status} · ${item.changedByRole} · ${formatDate(item.changedAt)} ${formatTime(item.changedAt)}`).join(" | ")
          : "No status changes have been recorded.";
        details.append(cell);
        tableRow.after(details);
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
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
        <div class="field"><label for="appointment-time">Available time</label><select id="appointment-time" name="preferredTime" required disabled><option value="">Select a doctor and date first</option></select></div>
        <div class="field full"><label for="appointment-reason">Reason for visit</label><input id="appointment-reason" name="reason" required minlength="3" maxlength="255"></div>
      </div><div class="form-actions"><button class="secondary-btn" id="cancel-appointment" type="button">Cancel</button><button class="primary-btn" type="submit">Create appointment</button></div></form>`;
    document.querySelector("#cancel-appointment").onclick = appointments;
    const doctorSelect = document.querySelector("#appointment-doctor");
    const dateInput = document.querySelector("#appointment-date");
    const timeSelect = document.querySelector("#appointment-time");
    const updateAvailability = async () => {
      timeSelect.replaceChildren(new Option("Loading availability…", ""));
      timeSelect.disabled = true;
      if (!doctorSelect.value || !dateInput.value) {
        timeSelect.replaceChildren(new Option("Select a doctor and date first", ""));
        return;
      }
      const requestedDate = dateInput.value;
      const doctor = activeDoctors.find((item) => Number(item.id) === Number(doctorSelect.value));
      try {
        const availability = await api(`appointments/availability?date=${encodeURIComponent(requestedDate)}&specialty=${encodeURIComponent(doctor.specialty)}`);
        if (doctorSelect.value !== String(doctor.id) || dateInput.value !== requestedDate) return;
        const selected = availability.find((item) => Number(item.id) === Number(doctor.id));
        timeSelect.replaceChildren(new Option(
          selected?.availableTimes.length ? "Select an available time" : "No available times",
          "",
        ));
        (selected?.availableTimes || []).forEach((time) => timeSelect.add(new Option(time, time)));
        timeSelect.disabled = !selected?.availableTimes.length;
      } catch (error) {
        timeSelect.replaceChildren(new Option(error.message, ""));
      }
    };
    doctorSelect.addEventListener("change", updateAvailability);
    dateInput.addEventListener("change", updateAvailability);
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
  const [items, prescriptions, dispensing] = await Promise.all([
    api("pharmacy/inventory"),
    api("pharmacy/prescriptions"),
    api("pharmacy/dispensing"),
  ]);
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
      "Manage inventory, prescription fulfillment, and counter sales.",
      '<button class="secondary-btn" id="counter-sale">+ Counter sale</button> <button class="primary-btn" id="add-medication">+ Add medication</button>',
    ) +
    `<div class="kpi-grid">
      <div class="surface kpi"><span class="kpi-label">Inventory value</span><div class="kpi-value">${money(value)}</div></div>
      <div class="surface kpi"><span class="kpi-label">Stock units</span><div class="kpi-value">${stockUnits}</div></div>
      <div class="surface kpi"><span class="kpi-label">Low stock items</span><div class="kpi-value">${lowStock}</div></div>
      <div class="surface kpi"><span class="kpi-label">Expiring within 30 days</span><div class="kpi-value">${expiring}</div></div>
    </div><div class="surface panel"><div class="panel-header"><h2>Medication inventory</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Medication</th><th>Stock</th><th>Reorder level</th><th>Expiry</th><th>Alert</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><span class="muted">${escapeHtml(item.dosage)} · ${money(item.unitPrice)}</span></td><td>${Number(item.stock)}</td><td>${Number(item.reorderLevel)}</td><td>${formatDate(item.expiryDate)}</td><td>${pill(item.alert)}</td></tr>`).join("")}</tbody></table></div>${items.length ? "" : '<p class="muted">No medication inventory has been entered.</p>'}</div>
    <div class="surface panel" style="margin-top:24px"><div class="panel-header"><h2>Prescription queue</h2><span class="muted">${prescriptions.length} awaiting action</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Medication</th><th>Quantity</th><th>Instructions</th><th>Status</th><th>Action</th></tr></thead><tbody>${prescriptions.map((item) => `<tr><td><strong>${escapeHtml(item.patient)}</strong><span class="muted">${escapeHtml(item.doctor)}</span></td><td>${escapeHtml(item.medication)} ${escapeHtml(item.dosage)}</td><td>${Number(item.quantity)}</td><td>${escapeHtml(item.instructions)}</td><td>${pill(item.status)}</td><td>${item.status === "Pending" ? `<button class="secondary-btn prescription-ready" data-id="${Number(item.id)}">Ready for pickup</button>` : ""} <button class="primary-btn prescription-dispense" data-id="${Number(item.id)}">Dispense</button></td></tr>`).join("")}</tbody></table></div>${prescriptions.length ? "" : '<p class="muted">No prescriptions are awaiting fulfillment.</p>'}</div>
    <div class="surface panel" style="margin-top:24px"><div class="panel-header"><h2>Recent dispensing records</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Medication</th><th>Quantity</th><th>Dispensed</th><th>Invoice</th></tr></thead><tbody>${dispensing.map((item) => `<tr><td>${escapeHtml(item.patient)}</td><td>${escapeHtml(item.medication)} ${escapeHtml(item.dosage)}</td><td>${Number(item.quantity)}</td><td>${formatDate(item.dispensedAt)}</td><td>${escapeHtml(item.invoiceNumber || "—")} · ${money(item.invoiceTotal)}</td></tr>`).join("")}</tbody></table></div>${dispensing.length ? "" : '<p class="muted">No prescriptions have been dispensed.</p>'}</div>`;
  document.querySelector("#add-medication").onclick = medicationForm;
  document.querySelector("#counter-sale").onclick = counterSaleForm;
  app.querySelectorAll(".prescription-ready").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`pharmacy/prescriptions/${button.dataset.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "Ready for pickup" }),
        });
        showToast("Prescription marked ready for pickup");
        await pharmacy();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    };
  });
  app.querySelectorAll(".prescription-dispense").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`pharmacy/prescriptions/${button.dataset.id}/dispense`, { method: "POST" });
        showToast("Prescription dispensed and invoice generated");
        await pharmacy();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    };
  });
}

async function counterSaleForm() {
  try {
    const [patients, inventory] = await Promise.all([api("patients"), api("pharmacy/inventory")]);
    const available = inventory.filter((item) => Number(item.stock) > 0 && item.alert !== "Expired");
    if (!patients.length || !available.length) {
      showError(new Error(!patients.length ? "Add a patient record before recording a sale." : "There are no unexpired medications in stock."));
      return;
    }
    app.innerHTML = page("Counter sale", "Record a pharmacy sale, update stock, and issue an invoice.") +
      `<form class="surface panel" id="counter-sale-form"><div class="field"><label for="sale-patient">Patient</label><select id="sale-patient" name="patientId" required><option value="">Select a patient</option>${patients.map((patient) => `<option value="${Number(patient.id)}">${escapeHtml(patient.name)} · ${escapeHtml(patient.recordNumber)}</option>`).join("")}</select></div>
      <div class="panel-header" style="margin-top:20px"><h2>Sale items</h2><button class="secondary-btn" id="add-sale-item" type="button">Add item</button></div><div id="sale-items"></div>
      <div class="form-actions"><button class="secondary-btn" id="cancel-sale" type="button">Cancel</button><button class="primary-btn" type="submit">Complete sale and invoice</button></div></form>`;
    const saleItems = document.querySelector("#sale-items");
    const options = available.map((item) => `<option value="${Number(item.id)}">${escapeHtml(item.name)} ${escapeHtml(item.dosage)} · ${Number(item.stock)} in stock · ${money(item.unitPrice)}</option>`).join("");
    const addLine = () => {
      const row = document.createElement("div");
      row.className = "form-grid sale-item-row";
      row.innerHTML = `<div class="field"><label>Medication</label><select class="sale-medication" required><option value="">Select medication</option>${options}</select></div>
        <div class="field"><label>Quantity</label><input class="sale-quantity" type="number" min="1" max="10000" value="1" required></div>
        <div class="field"><button class="secondary-btn remove-sale-item" type="button">Remove</button></div>`;
      row.querySelector(".remove-sale-item").onclick = () => row.remove();
      saleItems.append(row);
    };
    addLine();
    document.querySelector("#add-sale-item").onclick = addLine;
    document.querySelector("#cancel-sale").onclick = pharmacy;
    document.querySelector("#counter-sale-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const items = [...form.querySelectorAll(".sale-item-row")].map((row) => ({
        medicationId: row.querySelector(".sale-medication").value,
        quantity: row.querySelector(".sale-quantity").value,
      }));
      button.disabled = true;
      try {
        const result = await api("pharmacy/sales", {
          method: "POST",
          body: JSON.stringify({ patientId: form.elements.patientId.value, items }),
        });
        showToast(`Sale completed · invoice INV-${String(result.invoiceId).padStart(5, "0")}`);
        await pharmacy();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    };
  } catch (error) {
    showError(error);
  }
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
    </div><div class="surface panel"><div class="panel-header"><h2>Invoices</h2><span class="muted">${invoices.length} record(s)</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Type</th><th>Patient</th><th>Issued</th><th>Total</th><th>Status</th></tr></thead><tbody>${invoices.map((item) => `<tr><td><strong>${escapeHtml(item.invoiceNumber)}</strong><span class="muted">${item.items.map((line) => `${escapeHtml(line.description)} × ${Number(line.quantity)}`).join(", ")}</span></td><td>${escapeHtml(item.invoiceType)}</td><td>${escapeHtml(item.patient)}</td><td>${formatDate(item.issuedAt)}</td><td><strong>${money(item.total)}</strong></td><td>${item.status === "Unpaid" ? `<select class="search invoice-status" aria-label="Invoice status" data-id="${Number(item.id)}"><option value="Unpaid" selected>Unpaid</option><option value="Paid">Paid</option><option value="Void">Void</option></select>` : pill(item.status)}</td></tr>`).join("")}</tbody></table></div>${invoices.length ? "" : '<p class="muted">No invoices have been issued.</p>'}</div>`;
  app.querySelectorAll(".invoice-status").forEach((select) => {
    select.onchange = async () => {
      select.disabled = true;
      try {
        await api(`billing/invoices/${select.dataset.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value }),
        });
        showToast(`Invoice marked ${select.value.toLowerCase()}`);
        await billing();
      } catch (error) {
        showToast(error.message);
        select.disabled = false;
      }
    };
  });
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
      location.assign(result.session.role === "doctor" ? "doctor.html" : result.session.role === "patient" ? "consultation-history.html" : "patient-login.html");
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
    document.querySelector("#admin-logout")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Logging out…";
      try {
        const response = await fetch("/api/logout", { method: "POST" });
        if (!response.ok && response.status !== 401) {
          throw new Error("Could not log out. Please try again.");
        }
        sessionStorage.removeItem("careflowPatient");
        location.assign("patient-login.html");
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
        button.textContent = "Log out";
      }
    });
    window.addEventListener("hashchange", route);
    await route();
  } catch (error) {
    showError(error);
  }
}

startAdmin();
