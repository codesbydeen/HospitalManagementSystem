const eyeIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;
const eyeOffIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.8 15.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4-.8"></path>
  </svg>`;

function enhancePasswordInput(input) {
  if (input.dataset.passwordToggle === "true" || !input.parentNode) return;

  const wrapper = document.createElement("div");
  wrapper.className = "password-input";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);
  input.dataset.passwordToggle = "true";

  const button = document.createElement("button");
  button.className = "password-toggle";
  button.type = "button";
  button.setAttribute("aria-label", "Show password");
  button.setAttribute("aria-controls", input.id);
  button.setAttribute("aria-pressed", "false");
  button.title = "Show password";
  button.innerHTML = eyeIcon;
  button.addEventListener("click", () => {
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(visible));
    button.title = visible ? "Hide password" : "Show password";
    button.innerHTML = visible ? eyeOffIcon : eyeIcon;
  });
  wrapper.append(button);
}

function enhancePasswordInputs(root) {
  if (root instanceof Element && root.matches('input[type="password"]')) {
    enhancePasswordInput(root);
  }
  root.querySelectorAll?.('input[type="password"]').forEach(enhancePasswordInput);
}

enhancePasswordInputs(document);
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) enhancePasswordInputs(node);
    });
  }
}).observe(document.body, { childList: true, subtree: true });
