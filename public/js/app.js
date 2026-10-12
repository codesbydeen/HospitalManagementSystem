const bookingRoot = document.querySelector("#app");

if (bookingRoot && document.body.dataset.page === "appointment-booking") {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minimumDate = new Date(
    tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  bookingRoot.innerHTML = `<div class="patient-heading"><div><h1>Book an appointment</h1><p>Choose a specialty, clinician, and available time.</p></div></div>
    <div class="booking-layout">
      <form class="surface filter-panel" id="booking-form">
        <div class="panel-header"><h2>Find care</h2></div>
        <div class="field"><label for="booking-specialty">Specialty</label><select id="booking-specialty" required><option value="">Select a specialty</option></select></div>
        <div class="field"><label for="booking-date">Preferred date</label><input id="booking-date" type="date" min="${minimumDate}" value="${minimumDate}" required></div>
        <div class="field"><label for="booking-reason">Reason for visit</label><input id="booking-reason" maxlength="255" required placeholder="Briefly describe what you need help with"></div>
        <button class="primary-btn wide" id="find-slots" type="button">Refresh availability</button>
        <p class="portal-feedback" id="booking-feedback" role="status" aria-live="polite"></p>
      </form>
      <section class="booking-main">
        <div class="surface panel"><div class="panel-header"><h2>Available clinicians</h2></div><div id="clinician-list" class="muted">Choose a specialty and date.</div></div>
        <div class="surface panel"><div class="panel-header"><h2>Available times</h2></div><div id="time-grid" class="time-grid"></div></div>
        <div class="surface panel"><div class="panel-header"><h2>Your booking</h2></div><p id="booking-summary" class="muted">Select a clinician and time to continue.</p><button class="primary-btn" id="confirm-booking" type="submit" form="booking-form">Request appointment</button></div>
      </section>
    </div>`;
}
