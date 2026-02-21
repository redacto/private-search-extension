// services.js is loaded as a separate background script before this file.
// No importScripts() needed in MV2 background pages.

// ── Tracking cookie blocker ─────────────────────────────────────────────────
const BLOCKED_COOKIE_NAMES = new Set([
  'NID',    // Stores user preferences & tracks searches
  'ANID',   // Advertising ID
  'IDE',    // DoubleClick advertising
  'DSID',   // DoubleClick session
  'OTZ',    // Geo-targeting / account optimization
  'AEC',    // Anti-abuse / session binding
  '1P_JAR', // Aggregated conversion / ad targeting
  'DV',     // Real-time geo-targeting
  'UULE',   // Encoded location for local results
]);

function isGoogleDomain(domain) {
  const d = domain.startsWith('.') ? domain.slice(1) : domain;
  return d === 'google.com' || d.endsWith('.google.com');
}

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.removed) return;
  const { cookie } = changeInfo;
  if (!BLOCKED_COOKIE_NAMES.has(cookie.name)) return;
  if (!isGoogleDomain(cookie.domain)) return;

  const host = cookie.domain.startsWith('.')
    ? 'www' + cookie.domain
    : cookie.domain;
  const url = `https://${host}${cookie.path || '/'}`;
  chrome.cookies.remove({ url, name: cookie.name });
});

// ── Dynamic content script management ──────────────────────────────────────
const SCRIPT_PREFIX = 'cookie_hide_';

function buildScriptDef(svc) {
  return {
    id: SCRIPT_PREFIX + svc.id,
    matches: svc.matches,
    js: ['cookie-hide.js'],
    runAt: 'document_start',
    world: 'MAIN',
    persistAcrossSessions: true,
  };
}

async function syncServiceScript(svc, enable) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_PREFIX + svc.id] });
  } catch (_) {}
  if (enable) {
    await chrome.scripting.registerContentScripts([buildScriptDef(svc)]);
  }
}

// ── Service state (persistent background page = stable in-memory state) ─────
//
// Chrome uses declarativeNetRequest dynamic rules with initiatorDomains to
// strip cookies from *.google.com requests initiated by service pages.
// Firefox's DNR does not support initiatorDomains, so we use
// webRequest.onBeforeSendHeaders instead: it has access to details.originUrl,
// which tells us which page initiated the request.

const enabledServices = new Set();

// Precompile per-service regexes once at startup.
const serviceEntries = SERVICES.map((svc) => ({
  svc,
  ownRe: new RegExp(svc.regex),
}));

// Regex matching any *.google.com URL (for cross-origin identity-check requests).
const GOOGLE_RE = /^https:\/\/(?:[^/]*\.)?google\.com\//;

// ── webRequest: strip cookies from service domains + cross-origin google.com ─
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (enabledServices.size === 0) return {};

    let shouldStrip = false;

    for (const { svc, ownRe } of serviceEntries) {
      if (!enabledServices.has(svc.id)) continue;

      // Requests TO the service's own domain (youtube.com, music.youtube.com).
      if (ownRe.test(details.url)) {
        shouldStrip = true;
        break;
      }

      // Requests TO *.google.com initiated by the service's page.
      // This blocks cross-origin identity checks (accounts.google.com, etc.)
      // from revealing the signed-in user — the Firefox equivalent of Chrome's
      // declarativeNetRequest initiatorDomains condition.
      if (GOOGLE_RE.test(details.url) && details.type !== 'main_frame') {
        const originUrl = details.originUrl || details.documentUrl || '';
        if (originUrl) {
          try {
            const originHost = new URL(originUrl).hostname;
            if (svc.initiatorDomains.some(
              (d) => originHost === d || originHost.endsWith('.' + d)
            )) {
              shouldStrip = true;
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!shouldStrip) return {};

    return {
      requestHeaders: details.requestHeaders.filter(
        (h) => h.name.toLowerCase() !== 'cookie'
      ),
    };
  },
  {
    urls: [
      '*://youtube.com/*',
      '*://*.youtube.com/*',
      '*://google.com/*',
      '*://*.google.com/*',
    ],
    types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'],
  },
  ['blocking', 'requestHeaders']
);

// ── Initialise enabledServices from storage (runs on every background startup) ─
chrome.storage.local.get(null, (state) => {
  for (const svc of SERVICES) {
    if (state[svc.id] === true) enabledServices.add(svc.id);
  }
});

// ── Installation / update ───────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, async (current) => {
    const updates = {};
    if (!('searchEnabled' in current)) updates.searchEnabled = true;
    for (const svc of SERVICES) {
      if (!(svc.id in current)) updates[svc.id] = false;
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }

    // Rebuild in-memory enabled set from stored state.
    enabledServices.clear();
    for (const svc of SERVICES) {
      if (current[svc.id] === true) enabledServices.add(svc.id);
    }

    // Remove orphaned content scripts left from old versions.
    const validScriptIds = new Set(SERVICES.map((s) => SCRIPT_PREFIX + s.id));
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const stale = registered
      .filter((s) => s.id.startsWith(SCRIPT_PREFIX) && !validScriptIds.has(s.id))
      .map((s) => s.id);
    if (stale.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: stale });
    }

    // Re-sync content scripts from stored state.
    for (const svc of SERVICES) {
      const enabled = current[svc.id] === true;
      await syncServiceScript(svc, enabled);
    }
  });
});

// ── Message handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'getState') {
    chrome.storage.local.get(null, (state) => sendResponse(state));
    return true;
  }

  if (message.type === 'toggleSearch') {
    chrome.storage.local.get('searchEnabled', (data) => {
      const next = !data.searchEnabled;
      chrome.storage.local.set({ searchEnabled: next }, () => {
        const opts = next
          ? { enableRulesetIds: ['main_ruleset'] }
          : { disableRulesetIds: ['main_ruleset'] };
        chrome.declarativeNetRequest.updateEnabledRulesets(opts, () => {
          sendResponse({ searchEnabled: next });
        });
      });
    });
    return true;
  }

  if (message.type === 'toggleService') {
    const svc = SERVICES.find((s) => s.id === message.serviceId);
    if (!svc) { sendResponse({ error: 'not-toggleable' }); return; }

    chrome.storage.local.get(svc.id, (data) => {
      const next = !data[svc.id];
      chrome.storage.local.set({ [svc.id]: next }, async () => {
        // Update in-memory state so the webRequest listener picks it up immediately.
        if (next) {
          enabledServices.add(svc.id);
        } else {
          enabledServices.delete(svc.id);
        }
        await syncServiceScript(svc, next);
        sendResponse({ [svc.id]: next });
      });
    });
    return true;
  }

});
