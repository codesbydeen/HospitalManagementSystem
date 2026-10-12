const portalRoot = document.querySelector("#app");
const formatDate = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        undefined,
        { year: "numeric", month: "long", day: "numeric" },
      )
    : "—";

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

async function portalApi(path) {
  const response = await fetch(path);
  const result = await response.json();
  if (response.status === 401) {
    location.assign("patient-login.html");
    throw new Error("Please log in to continue.");
  }
  if (!response.ok)
    throw new Error(result.error || "Unable to load your account data.");
  return result;
}

function pageHeading(title, subtitle) {
  const heading = document.createElement("div");
  heading.className = "patient-heading";
  const content = document.createElement("div");
  addText(content, "h1", "", title);
  addText(content, "p", "", subtitle);
  heading.append(content);
  portalRoot.append(heading);
}

function showEmpty(panel, message) {
  addText(panel, "p", "portal-empty", message);
}

async function loadConsultationHistory(session) {
  const result = await portalApi(`/api/patients/${session.id}`);
  pageHeading(
    "Consultation history",
    "Review your appointments and recorded clinical notes.",
  );
  const layout = document.createElement("div");
  layout.className = "history-layout";
  const historyPanel = document.createElement("section");
  historyPanel.className = "surface panel";
  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";
  const title = document.createElement("div");
  addText(title, "span", "section-kicker", `Record ${result.patient.recordNumber}`);
  addText(title, "h2", "", "Your consultations");
  panelHeader.append(title);
  historyPanel.append(panelHeader);
  if (!result.consultations.length) {
    showEmpty(historyPanel, "No consultations have been added to your record yet.");
  } else {
    result.consultations.forEach((consultation) => {
      const card = document.createElement("article");
      card.className = "consultation-card";
      const detail = document.createElement("div");
      detail.className = "consultation-detail";
      const cardHeader = document.createElement("div");
      cardHeader.className = "panel-header";
      const heading = document.createElement("div");
      addText(heading, "h3", "", consultation.department);
      addText(
        heading,
        "span",
        "muted",
        `${consultation.doctor || "Care team"} · ${formatDate(consultation.appointmentAt)}`,
      );
      cardHeader.append(heading);
      addText(cardHeader, "span", "pill", consultation.status);
      detail.append(cardHeader);
      const notes = document.createElement("div");
      notes.className = "note-grid";
      const diagnosis = document.createElement("div");
      addText(diagnosis, "span", "label", "Diagnosis");
      addText(diagnosis, "p", "", consultation.diagnosis);
      notes.append(diagnosis);
      if (consultation.treatmentPlan) {
        const plan = document.createElement("div");
        addText(plan, "span", "label", "Treatment plan");
        addText(plan, "p", "", consultation.treatmentPlan);
        notes.append(plan);
      }
      if (consultation.clinicalNotes) {
        const clinicalNotes = document.createElement("div");
        addText(clinicalNotes, "span", "label", "Clinical notes");
        addText(clinicalNotes, "p", "", consultation.clinicalNotes);
        notes.append(clinicalNotes);
      }
      detail.append(notes);
      card.append(detail);
      historyPanel.append(card);
    });
  }
  const appointmentPanel = document.createElement("section");
  appointmentPanel.className = "surface panel";
  addText(appointmentPanel, "h2", "", "Your appointments");
  if (!result.appointments.length) {
    showEmpty(appointmentPanel, "You do not have any appointment requests yet.");
  } else {
    result.appointments.forEach((appointment) => {
      const row = document.createElement("article");
      row.className = "portal-appointment";
      addText(row, "strong", "", appointment.department);
      addText(
        row,
        "p",
        "",
        `${formatDate(appointment.appointmentAt)} · ${appointment.doctor || "Clinician to be assigned"} · ${appointment.reason}`,
      );
      addText(row, "span", "pill", appointment.status);
      appointmentPanel.append(row);
    });
  }
  layout.append(historyPanel, appointmentPanel);
  portalRoot.append(layout);
}

async function loadBillingNotifications(profile) {
  const invoices = await portalApi("/api/billing/mine");
  pageHeading(
    "Billing & notifications",
    "Review your invoices and updates based on your CareFlow records.",
  );
  const layout = document.createElement("div");
  layout.className = "billing-layout";
  const finance = document.createElement("section");
  finance.className = "finance-main";
  const invoicePanel = document.createElement("section");
  invoicePanel.className = "surface panel";
  const invoiceHeader = document.createElement("div");
  invoiceHeader.className = "panel-header";
  addText(invoiceHeader, "h2", "", "Your invoices");
  addText(invoiceHeader, "span", "muted", `${invoices.length} record(s)`);
  invoicePanel.append(invoiceHeader);
  if (!invoices.length) {
    showEmpty(invoicePanel, "You do not have any invoices yet.");
  } else {
    invoices.forEach((invoice) => {
      const row = document.createElement("article");
      row.className = "invoice-row";
      const icon = addText(row, "div", "invoice-icon", "R");
      if (invoice.status === "Unpaid") icon.classList.add("pending");
      const description = document.createElement("div");
      addText(
        description,
        "strong",
        "",
        `${invoice.invoiceNumber} · ${invoice.department || "CareFlow service"}`,
      );
      addText(description, "small", "muted", `Issued ${formatDate(invoice.issuedAt)}`);
      row.append(description);
      addText(row, "strong", "invoice-total", `R ${Number(invoice.total).toFixed(2)}`);
      addText(row, "span", "pill", invoice.status);
      invoicePanel.append(row);
    });
  }
  finance.append(invoicePanel);

  const notifications = document.createElement("aside");
  notifications.className = "surface panel pharmacy-notifications";
  addText(notifications, "h2", "", "Account updates");
  const updates = [];
  invoices
    .filter((invoice) => invoice.status === "Unpaid")
    .forEach((invoice) =>
      updates.push({
        title: "Unpaid invoice",
        detail: `${invoice.invoiceNumber} has an outstanding balance of R ${Number(invoice.total).toFixed(2)}.`,
        date: invoice.issuedAt,
      }),
    );
  profile.prescriptions
    .filter((prescription) => prescription.status === "Pending")
    .forEach((prescription) =>
      updates.push({
        title: "Prescription pending",
        detail: `${prescription.medication} ${prescription.dosage} is awaiting fulfilment.`,
        date: prescription.createdAt,
      }),
    );
  profile.appointments
    .filter((appointment) =>
      ["Pending", "Scheduled"].includes(appointment.status),
    )
    .forEach((appointment) =>
      updates.push({
        title: "Appointment update",
        detail: `${appointment.department} appointment · ${formatDate(appointment.appointmentAt)} · ${appointment.status}.`,
        date: appointment.createdAt,
      }),
    );
  if (!updates.length) {
    showEmpty(notifications, "There are no new account updates.");
  } else {
    updates
      .sort((first, second) => new Date(second.date) - new Date(first.date))
      .forEach((update) => {
        const item = document.createElement("article");
        item.className = "notification-item";
        const dot = document.createElement("span");
        dot.className = "notification-dot";
        const text = document.createElement("div");
        addText(text, "strong", "", update.title);
        addText(text, "p", "", update.detail);
        addText(text, "small", "muted", formatDate(update.date));
        item.append(dot, text);
        notifications.append(item);
      });
  }
  layout.append(finance, notifications);
  portalRoot.append(layout);
  const avatar = document.querySelector("#portal-avatar");
  if (avatar) {
    avatar.textContent = [profile.patient.firstName, profile.patient.lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
}

async function loadPatientPortal() {
  portalRoot.replaceChildren();
  addText(portalRoot, "p", "muted", "Loading your secure patient portal…");
  try {
    const { session } = await portalApi("/api/session");
    if (session.role === "admin") {
      location.assign("admin.html");
      return;
    }
    if (session.role !== "patient")
      throw new Error("Your account role is missing or invalid. Contact an administrator.");
    const dataPage = document.body.dataset.page;
    if (dataPage === "consultation-history") {
      await loadConsultationHistory(session);
    } else {
      const profile = await portalApi(`/api/patients/${session.id}`);
      await loadBillingNotifications(profile);
    }
  } catch (error) {
    portalRoot.replaceChildren();
    addText(portalRoot, "p", "portal-feedback error", error.message);
  }
}

loadPatientPortal();

document.querySelector("#logout-button")?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    sessionStorage.removeItem("careflowPatient");
    location.assign("patient-login.html");
  }
});
