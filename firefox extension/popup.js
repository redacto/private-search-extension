const searchToggle  = document.getElementById('search-toggle');
const servicesList  = document.getElementById('services-list');

// ── Build a service row using the DOM API (avoids innerHTML injection risk) ──
function buildServiceRow(svc, state) {
  const row = document.createElement('div');
  row.className = 'svc-row';

  const left = document.createElement('div');
  left.className = 'svc-left';

  const icon = document.createElement('span');
  icon.className = 'svc-icon';
  icon.textContent = svc.emoji;

  const label = document.createElement('span');
  label.className = 'svc-label';
  label.textContent = svc.label;

  left.appendChild(icon);
  left.appendChild(label);
  row.appendChild(left);

  if (svc.ruleId === null) {
    // Already covered by the main Search ruleset — show an informational badge.
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '✓ with Search';
    row.appendChild(badge);
  } else {
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.svc = svc.id;
    checkbox.checked = !!state[svc.id];

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(slider);
    row.appendChild(toggleLabel);
  }

  return row;
}

// ── Render all service rows from current storage state ──────────────────────
function renderServices(state) {
  servicesList.innerHTML = '';

  for (const svc of SERVICES) {
    servicesList.appendChild(buildServiceRow(svc, state));
  }

  // Attach change listeners after all rows are in the DOM.
  servicesList.querySelectorAll('input[data-svc]').forEach((input) => {
    input.addEventListener('change', () => {
      const serviceId = input.dataset.svc;
      input.disabled = true; // prevent double-click while in-flight
      chrome.runtime.sendMessage({ type: 'toggleService', serviceId }, (resp) => {
        void chrome.runtime.lastError;
        input.disabled = false;
        if (resp && serviceId in resp) input.checked = resp[serviceId];
      });
    });
  });
}

// ── Bootstrap: load state then render ──────────────────────────────────────
chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
  if (chrome.runtime.lastError || !state) return;
  searchToggle.checked = state.searchEnabled !== false;
  renderServices(state);
});

// ── Main Search toggle ──────────────────────────────────────────────────────
searchToggle.addEventListener('change', function () {
  this.disabled = true;
  chrome.runtime.sendMessage({ type: 'toggleSearch' }, (resp) => {
    void chrome.runtime.lastError;
    this.disabled = false;
    if (resp) this.checked = resp.searchEnabled;
  });
});
