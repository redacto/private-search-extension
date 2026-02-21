// Shared service definitions — loaded by background.js (importScripts) and popup.js (<script>).
//
// ruleId          → declarativeNetRequest dynamic rule: strips Cookie from requests
//                   TO the service's own domain.
// extraRuleId     → declarativeNetRequest dynamic rule: strips Cookie from requests
//                   to ANY *.google.com domain INITIATED BY the service's page,
//                   blocking cross-origin identity checks (accounts.google.com etc.).
// initiatorDomains→ the origins whose outgoing cross-domain requests the extra rule covers.
// regex           → RE2 URL pattern for the primary (ruleId) rule condition.
// matches         → Chrome match-pattern array for the dynamic document.cookie
//                   override content script.

const SERVICES = [
  {
    id: 'youtube',
    label: 'YouTube',
    emoji: '▶',
    ruleId: 101,
    extraRuleId: 201,
    // Covers youtube.com, www.youtube.com, m.youtube.com (Shorts).
    // music.youtube.com is intentionally excluded — see ytmusic entry.
    regex: '^https://(?:(?:www|m)\\.)?youtube\\.com/',
    initiatorDomains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    matches: [
      'https://youtube.com/*',
      'https://www.youtube.com/*',
      'https://m.youtube.com/*',
    ],
  },
  {
    id: 'ytmusic',
    label: 'YouTube Music',
    emoji: '🎵',
    ruleId: 107,
    extraRuleId: 207,
    regex: '^https://music\\.youtube\\.com/',
    initiatorDomains: ['music.youtube.com'],
    matches: ['https://music.youtube.com/*'],
  },
];
