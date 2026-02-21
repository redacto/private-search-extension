<img width="378" height="312" alt="image" src="https://github.com/user-attachments/assets/94c936ee-3f3d-48e1-8f14-e5f1cd5a50a0" />

<BR>
Chromium extension works in Chrome, Brave and Edge
<BR>
Firefox based extension works in Firefox, Librewolf, Mullvad and TOR browser

---

## About

Anonymous Google Search lets you use Google and YouTube search without your queries being linked to your Google account — no incognito window or logout required. Gmail, Calendar, Drive, and all other Google services remain fully logged in and unaffected; only search requests are stripped of your account credentials.

<b>Note:</b> This is not a true incognito mode. By default, your searches will still appear in your local browser history, though this can be disabled via the popup. The only thing this does is prevent Google from associating your searches with your online account. Additionally, this should only be used with a VPN, as using a logged in account with "search history" turned off is likely more secure than using this with a static identifiable IP address.

## How it works

Google identifies signed-in users through several channels simultaneously. The extension addresses all of them:

**HTTP Cookie stripping**
Before each request to `google.com/search`, the extension removes the `Cookie` request header using the browser's declarative network request API. Google receives the search query but no session tokens, so it processes the request as if made by a signed-out visitor.

**Client-side cookie hiding**
Google's page JavaScript reads `document.cookie` directly to determine sign-in state and render the account widget. The extension injects a script at `document_start` — before any page code runs — that overrides the `document.cookie` getter to return an empty string. The cookies remain in the browser's store and are available to other Google services; they are only hidden from Google Search's own scripts.

**Tracking parameter removal**
Chrome and Firefox append tracking parameters to every search URL (`rlz`, `oq`, `aqs`). The extension redirects these URLs at the network level, stripping those parameters before the request leaves the browser. A content script also cleans the URL on initial page load and intercepts `history.pushState` and `history.replaceState` to catch parameters Google appends after the page loads (`sei`, `ved`, `ei`, and others). Rather than targeting specific parameter names, the script uses a strict whitelist — only functional parameters (`q`, `tbm`, `tbs`, `safe`, `num`, `start`, `hl`, `gl`, and a few others) are kept; everything else is stripped.

**Tracking cookie suppression**
The following cookies are deleted immediately if Google attempts to set them: `NID`, `ANID`, `IDE`, `DSID`, `OTZ`, `AEC`, `1P_JAR`, `DV`, `UULE`. These are used for ad targeting, session binding, and geo-tracking, and serve no functional purpose for search.

## No browser history (optional)

The extension can delete Google Search, YouTube, and YouTube Music pages from the browser's local history as you visit them. When enabled, any navigation to those services — including paginated search results, individual YouTube videos, and YouTube Music pages — is removed from the browser history immediately after it is recorded. The toggle is available in the popup and applies to all three services simultaneously.

This works by listening for `history.onVisited` events and calling `history.deleteUrl` for any matching URL. The browser writes the entry first and the extension erases it reactively; there is no API to prevent the write entirely, so the deletion happens in the same event tick and is not visible in practice.

## Optional service protection

YouTube and YouTube Music can optionally be isolated in the same way. When enabled for a service, the extension strips cookies from all requests to that service's domain, overrides `document.cookie` on those pages, and blocks cross-origin identity checks — the background XHR requests those services make to `accounts.google.com` to verify sign-in state.

On Chrome, cross-origin identity checks are intercepted using declarative network rules scoped to the initiating domain. On Firefox, the equivalent is implemented using the blocking `webRequest` API, which inspects the `originUrl` of each request to `*.google.com` to determine whether it was initiated by an enabled service.

## Architecture

| Component | Role |
|---|---|
| `rules.json` | Static declarative rules: strips `Cookie` from Google Search requests, redirects tracking-parameter URLs |
| `content.js` | Injected into Google Search at `document_start` in the page's JS context; hides cookies from page scripts and cleans URLs via history API interception |
| `background.js` | Service worker (Chrome) / persistent background page (Firefox); manages dynamic rules, cookie suppression, service toggles, and browser history deletion |
| `cookie-hide.js` | Dynamically injected into optional service pages when their toggle is on; hides cookies from page scripts on those domains |
| `services.js` | Shared service definitions consumed by both the background script and the popup |
| `popup.html/js` | Toggle UI for enabling/disabling protection for Google Search and each optional service |
