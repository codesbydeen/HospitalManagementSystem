const bookingDate = document.querySelector("#booking-date");
const bookingButton = document.querySelector("#confirm-booking");
const bookingSidebar = document.querySelector(".filter-panel");

if (bookingDate && bookingButton && bookingSidebar) {
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  bookingDate.min = localDate;
  if (bookingDate.value < localDate) {
    const tomorrow = new Date(
      today.getTime() + 86400000 - today.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);
    bookingDate.value = tomorrow;
  }
  const formatBookingDate = (value) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const updateBookingDate = () => {
    const formattedDate = formatBookingDate(bookingDate.value);
    const selectedTime =
      document.querySelector(".time-slot.chosen")?.textContent || "09:00";
    document.querySelector("#summary-time").textContent =
      `${formattedDate} · ${selectedTime}`;
    document.querySelector(".booking-main .panel-header .muted").textContent =
      new Date(`${bookingDate.value}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
      });
  };
  document.querySelectorAll(".time-slot").forEach((slot) => {
    slot.onclick = () => {
      document
        .querySelectorAll(".time-slot")
        .forEach((item) => item.classList.remove("chosen"));
      slot.classList.add("chosen");
      updateBookingDate();
    };
  });
  bookingDate.addEventListener("change", updateBookingDate);
  updateBookingDate();
  const reasonField = document.createElement("div");
  reasonField.className = "field";
  reasonField.innerHTML =
    '<label for="booking-reason">Reason for visit</label><input id="booking-reason" name="reason" maxlength="255" required placeholder="Briefly describe what you need help with">';
  bookingSidebar.insertBefore(
    reasonField,
    bookingSidebar.querySelector("#find-slots"),
  );
  const feedback = document.createElement("p");
  feedback.className = "portal-feedback";
  feedback.id = "booking-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  bookingSidebar.append(feedback);
  bookingButton.textContent = "Book appointment";
  bookingButton.onclick = async () => {
    const reason = document.querySelector("#booking-reason");
    if (!bookingDate.reportValidity() || !reason.reportValidity()) return;
    bookingButton.disabled = true;
    bookingButton.textContent = "Sending request…";
    feedback.textContent = "";
    feedback.classList.remove("error");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: document.querySelector("#booking-specialty").value,
          preferredDate: bookingDate.value,
          preferredTime:
            document.querySelector(".time-slot.chosen")?.textContent || "09:00",
          reason: reason.value.trim(),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        feedback.textContent = "Log in to send your appointment request.";
        const login = document.createElement("a");
        login.className = "link";
        login.href = "patient-login.html?next=appointment-booking.html";
        login.textContent = " Log in";
        feedback.append(login);
        return;
      }
      if (!response.ok)
        throw new Error(
          result.error || "Unable to book this appointment. Please try again.",
        );
      feedback.textContent =
        "Your appointment request has been received. Status: Pending.";
      feedback.classList.remove("error");
      const status = document.querySelector(".schedule-panel .pill");
      status.textContent = "Request sent";
      status.classList.remove("warn");
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add("error");
    } finally {
      bookingButton.disabled = false;
      bookingButton.textContent = "Book appointment";
    }
  };
}
