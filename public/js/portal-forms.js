const portalForm = document.querySelector("form");
if (portalForm) {
  portalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!portalForm.reportValidity()) return;
    const button = portalForm.querySelector('button[type="submit"]');
    const feedback = document.querySelector("#form-feedback");
    const formData = Object.fromEntries(new FormData(portalForm));
    const endpoint =
      document.body.dataset.portalForm === "register"
        ? "/api/register"
        : "/api/login";
    button.disabled = true;
    button.textContent =
      document.body.dataset.portalForm === "register"
        ? "Creating account…"
        : "Logging in…";
    feedback.textContent = "";
    feedback.classList.remove("error");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Unable to complete your request. Please try again.",
        );
      if (!["patient", "admin"].includes(result.session?.role))
        throw new Error(
          "Your account role is missing or invalid. Contact an administrator.",
        );
      sessionStorage.setItem("careflowPatient", JSON.stringify(result.session));
      if (result.session.role === "admin") {
        location.assign("admin.html");
        return;
      }
      const nextPage = new URLSearchParams(location.search).get("next");
      location.assign(
        nextPage === "appointment-booking.html"
          ? nextPage
          : "consultation-history.html",
      );
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add("error");
    } finally {
      button.disabled = false;
      button.textContent =
        document.body.dataset.portalForm === "register"
          ? "Create account"
          : "Log in";
    }
  });
  const dateInput = portalForm.querySelector('input[type="date"]');
  if (dateInput) dateInput.max = new Date().toISOString().slice(0, 10);
}
