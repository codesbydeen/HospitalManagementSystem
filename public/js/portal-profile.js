const portalRoot = document.querySelector("#app");
const formatDate = (value) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

async function loadPatientPortal() {
  portalRoot.replaceChildren();
  addText(portalRoot, "p", "muted", "Loading your secure patient portal…");
  try {
    const sessionResponse = await fetch("/api/session");
    if (sessionResponse.status === 401) {
      location.assign("patient-login.html");
      return;
    }
    const sessionResult = await sessionResponse.json();
    if (!sessionResponse.ok)
      throw new Error(sessionResult.error || "Unable to load your account.");
    const response = await fetch(`/api/patients/${sessionResult.session.id}`);
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Unable to load your patient profile.");
    const patient = result.patient;
    const header = document.createElement("div");
    header.className = "portal-profile-header";
    const title = document.createElement("div");
    addText(title, "p", "section-kicker", "Your CareFlow patient portal");
    addText(title, "h1", "", `Welcome, ${patient.firstName}`);
    addText(
      title,
      "p",
      "portal-profile-meta",
      `${patient.email} · ${patient.phone} · Record ${patient.recordNumber}`,
    );
    header.append(title);
    portalRoot.append(header);
    const patientPanel = document.createElement("section");
    patientPanel.className = "surface panel";
    addText(patientPanel, "h2", "", "Your profile");
    addText(
      patientPanel,
      "p",
      "muted",
      `Date of birth: ${formatDate(patient.dob)} · ${patient.sex}`,
    );
    portalRoot.append(patientPanel);
    const appointmentsPanel = document.createElement("section");
    appointmentsPanel.className = "surface panel";
    appointmentsPanel.style.marginTop = "20px";
    addText(appointmentsPanel, "h2", "", "Your appointments");
    if (!result.appointments.length) {
      addText(
        appointmentsPanel,
        "p",
        "portal-empty",
        "You do not have any appointment requests yet.",
      );
    } else {
      result.appointments.forEach((appointment) => {
        const row = document.createElement("article");
        row.className = "portal-appointment";
        addText(row, "strong", "", appointment.department);
        const time = new Date(appointment.appointmentAt).toLocaleTimeString(
          undefined,
          { hour: "2-digit", minute: "2-digit" },
        );
        addText(
          row,
          "p",
          "",
          `${formatDate(appointment.preferredDate)} · ${time} · ${appointment.reason}`,
        );
        addText(row, "span", "pill warn", appointment.status);
        appointmentsPanel.append(row);
      });
    }
    portalRoot.append(appointmentsPanel);
  } catch (error) {
    portalRoot.replaceChildren();
    addText(portalRoot, "p", "portal-feedback error", error.message);
  }
}

loadPatientPortal();

document
  .querySelector("#logout-button")
  ?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      sessionStorage.removeItem("careflowPatient");
      location.assign("patient-login.html");
    }
  });
