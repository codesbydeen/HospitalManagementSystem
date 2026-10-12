const bookingForm = document.querySelector("#booking-form");

if (bookingForm) {
  const specialty = document.querySelector("#booking-specialty");
  const date = document.querySelector("#booking-date");
  const clinicianList = document.querySelector("#clinician-list");
  const timeGrid = document.querySelector("#time-grid");
  const summary = document.querySelector("#booking-summary");
  const feedback = document.querySelector("#booking-feedback");
  const refreshButton = document.querySelector("#find-slots");
  const submitButton = document.querySelector("#confirm-booking");
  let clinicians = [];
  let selectedDoctorId = null;
  let selectedTime = null;

  function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("error", isError);
  }

  function renderAvailability() {
    clinicianList.replaceChildren();
    timeGrid.replaceChildren();
    const available = clinicians.filter(
      (doctor) => !specialty.value || doctor.specialty === specialty.value,
    );
    if (!available.length) {
      clinicianList.textContent =
        "No clinicians are available for this specialty and date.";
      selectedDoctorId = null;
      selectedTime = null;
      summary.textContent = "Choose another specialty or date.";
      submitButton.disabled = true;
      return;
    }
    if (!available.some((doctor) => doctor.id === selectedDoctorId))
      selectedDoctorId = available[0].id;
    const selectedDoctor = available.find(
      (doctor) => doctor.id === selectedDoctorId,
    );
    available.forEach((doctor) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `clinician${doctor.id === selectedDoctorId ? " selected" : ""}`;
      card.setAttribute("aria-pressed", String(doctor.id === selectedDoctorId));
      const name = document.createElement("strong");
      name.textContent = doctor.name;
      const specialtyLabel = document.createElement("small");
      specialtyLabel.className = "muted";
      specialtyLabel.textContent = doctor.specialty;
      card.append(name, specialtyLabel);
      card.addEventListener("click", () => {
        selectedDoctorId = doctor.id;
        selectedTime = null;
        renderAvailability();
      });
      clinicianList.append(card);
    });

    if (!selectedDoctor.availableTimes.length) {
      timeGrid.textContent = "No available times for this clinician on that date.";
      selectedTime = null;
    } else {
      if (!selectedDoctor.availableTimes.includes(selectedTime))
        selectedTime = selectedDoctor.availableTimes[0];
      selectedDoctor.availableTimes.forEach((time) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `time-slot${time === selectedTime ? " chosen" : ""}`;
        button.textContent = time;
        button.setAttribute("aria-pressed", String(time === selectedTime));
        button.addEventListener("click", () => {
          selectedTime = time;
          renderAvailability();
        });
        timeGrid.append(button);
      });
    }
    summary.textContent = selectedTime
      ? `${selectedDoctor.name} · ${selectedDoctor.specialty} · ${new Date(`${date.value}T00:00:00`).toLocaleDateString()} at ${selectedTime}`
      : "Choose a date with an available appointment time.";
    submitButton.disabled = !selectedTime;
  }

  async function loadAvailability() {
    refreshButton.disabled = true;
    submitButton.disabled = true;
    setFeedback("");
    clinicianList.textContent = "Loading availability…";
    timeGrid.replaceChildren();
    try {
      const params = new URLSearchParams({
        date: date.value,
        specialty: specialty.value,
      });
      const response = await fetch(`/api/appointments/availability?${params}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to load appointment availability.");
      clinicians = result;
      if (!specialty.value && clinicians.length) {
        const specialties = [...new Set(clinicians.map((doctor) => doctor.specialty))];
        specialties.forEach((item) => specialty.add(new Option(item, item)));
      }
      renderAvailability();
      setFeedback(
        clinicians.length
          ? ""
          : "No active clinicians are listed yet. Please contact the clinic.",
      );
    } catch (error) {
      clinicians = [];
      clinicianList.textContent = error.message;
      summary.textContent = "Availability could not be loaded.";
      setFeedback(error.message, true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  specialty.addEventListener("change", loadAvailability);
  date.addEventListener("change", loadAvailability);
  refreshButton.addEventListener("click", loadAvailability);
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!bookingForm.reportValidity() || !selectedDoctorId || !selectedTime)
      return;
    submitButton.disabled = true;
    setFeedback("Sending your appointment request…");
    const selectedDoctor = clinicians.find(
      (doctor) => doctor.id === selectedDoctorId,
    );
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          department: selectedDoctor.specialty,
          preferredDate: date.value,
          preferredTime: selectedTime,
          reason: document.querySelector("#booking-reason").value.trim(),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        setFeedback("Log in to request an appointment. ");
        const link = document.createElement("a");
        link.className = "link";
        link.href = "patient-login.html?next=appointment-booking.html";
        link.textContent = "Log in";
        feedback.append(link);
        return;
      }
      if (!response.ok)
        throw new Error(result.error || "Unable to request this appointment.");
      selectedTime = null;
      await loadAvailability();
      setFeedback("Your appointment request was sent and is pending confirmation.");
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      submitButton.disabled = !selectedTime;
    }
  });

  loadAvailability();
}
