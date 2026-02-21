importScripts('services.js');

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
  chrome.cookies.remove({ url, name: cookie.name }, () => { void chrome.runtime.lastError; });
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
    try {
      await chrome.scripting.registerContentScripts([buildScriptDef(svc)]);
    } catch (err) {
      console.error('[Anonymous Google Search] registerContentScripts failed:', err);
    }
  }
}

// ── declarativeNetRequest rule builders ────────────────────────────────────

// Primary rule: strips Cookie header from requests TO the service's own domain.
function buildRule(svc) {
  return {
    id: svc.ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'remove' }],
    },
    condition: {
      regexFilter: svc.regex,
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'],
    },
  };
}

// Extra rule: strips Cookie header from requests to ANY *.google.com domain
// that are INITIATED BY the service's page.  This prevents cross-origin
// identity checks (accounts.google.com, etc.) from revealing the signed-in user.
function buildExtraRule(svc) {
  return {
    id: svc.extraRuleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'remove' }],
    },
    condition: {
      // Matches google.com and any subdomain (accounts.google.com, etc.)
      regexFilter: '^https://(?:[^/]*\\.)?google\\.com/',
      initiatorDomains: svc.initiatorDomains,
      resourceTypes: ['sub_frame', 'xmlhttprequest', 'other'],
    },
  };
}

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

    // Wipe ALL existing dynamic rules then re-add only what current services need.
    // This removes orphaned rules from services that were deleted (e.g. Maps).
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((r) => r.id),
      });
    }

    // Remove orphaned content scripts (e.g. cookie_hide_maps) left from old versions.
    const validScriptIds = new Set(SERVICES.map((s) => SCRIPT_PREFIX + s.id));
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const stale = registered
      .filter((s) => s.id.startsWith(SCRIPT_PREFIX) && !validScriptIds.has(s.id))
      .map((s) => s.id);
    if (stale.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: stale });
    }

    // Re-sync current services from stored state.
    for (const svc of SERVICES) {
      const enabled = current[svc.id] === true;
      await syncServiceScript(svc, enabled);
      if (enabled) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [buildRule(svc), buildExtraRule(svc)],
        });
      }
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
      chrome.storage.local.set({ [svc.id]: next }, () => {
        const ruleIds = [svc.ruleId, svc.extraRuleId];
        const ruleUpdate = next
          ? { addRules: [buildRule(svc), buildExtraRule(svc)], removeRuleIds: ruleIds }
          : { removeRuleIds: ruleIds };

        chrome.declarativeNetRequest.updateDynamicRules(ruleUpdate, async () => {
          await syncServiceScript(svc, next);
          sendResponse({ [svc.id]: next });
        });
      });
    });
    return true;
  }

});
