const searchToggle  = document.getElementById('search-toggle');
const servicesList  = document.getElementById('services-list');

// ── Render all service rows from current storage state ──────────────────────
function renderServices(state) {
  servicesList.innerHTML = '';

  for (const svc of SERVICES) {
    const row = document.createElement('div');
    row.className = 'svc-row';

    const left = `<div class="svc-left">
      <span class="svc-icon">${svc.emoji}</span>
      <span class="svc-label">${svc.label}</span>
    </div>`;

    if (svc.ruleId === null) {
      // Already covered by the main Search ruleset — show an informational badge.
      row.innerHTML = `${left}<span class="badge">✓ with Search</span>`;
    } else {
      const checked = state[svc.id] ? 'checked' : '';
      row.innerHTML = `${left}
        <label class="toggle">
          <input type="checkbox" data-svc="${svc.id}" ${checked}>
          <span class="slider"></span>
        </label>`;
    }

    servicesList.appendChild(row);
  }

  // Attach change listeners after all rows are in the DOM.
  servicesList.querySelectorAll('input[data-svc]').forEach((input) => {
    input.addEventListener('change', () => {
      const serviceId = input.dataset.svc;
      input.disabled = true; // prevent double-click while in-flight
      chrome.runtime.sendMessage({ type: 'toggleService', serviceId }, (resp) => {
        input.disabled = false;
        if (resp && serviceId in resp) input.checked = resp[serviceId];
      });
    });
  });
}

// ── Bootstrap: load state then render ──────────────────────────────────────
chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
  searchToggle.checked = state.searchEnabled !== false;
  renderServices(state);
});

// ── Main Search toggle ──────────────────────────────────────────────────────
searchToggle.addEventListener('change', function () {
  this.disabled = true;
  chrome.runtime.sendMessage({ type: 'toggleSearch' }, (resp) => {
    this.disabled = false;
    if (resp) this.checked = resp.searchEnabled;
  });
});
