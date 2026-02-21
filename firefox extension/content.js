// Runs in the page's JavaScript context (world: MAIN) at document_start.
// Two responsibilities:
//   1. Hide cookies from page JS so the account widget can't read auth tokens.
//   2. Strip tracking params from the URL (both on load and when Google's JS
//      tries to rewrite the URL via history.pushState / history.replaceState).

(function () {

  // ── 1. Cookie hiding ────────────────────────────────────────────────────────
  const realCookieDescriptor =
    Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

  if (realCookieDescriptor) {
    Object.defineProperty(document, 'cookie', {
      get() { return ''; },
      set(val) { realCookieDescriptor.set.call(document, val); },
      configurable: true,
    });
  }

  // ── 2. URL param cleaning ───────────────────────────────────────────────────
  // Whitelist: only these params are kept on google.com/search URLs.
  // Everything else (rlz, oq, aqs, sourceid, sei, ved, ei, biw, bih, sxsrf,
  // sclient, gs_lp, uact, dpr, prmd, gs_l, source, stick, …) is stripped.
  const KEEP = new Set([
    'q',        // the search query
    'tbm',      // search type: isch, nws, vid, bks, fin
    'udm',      // newer search type encoding
    'tbs',      // time filter / verbatim mode
    'safe',     // SafeSearch
    'num',      // results per page
    'start',    // pagination offset
    'hl',       // interface language
    'gl',       // country
    'lr',       // language restrict
    'cr',       // country restrict
    'nfpr',     // disable auto-correction
    'filter',   // duplicate filter
    // advanced search params
    'as_q', 'as_epq', 'as_oq', 'as_eq',
    'as_sitesearch', 'as_filetype', 'as_qdr',
    // image search params
    'imgtype', 'imgsize', 'imgc', 'imgar',
  ]);

  function cleanSearchUrl(urlStr) {
    let u;
    try {
      u = new URL(urlStr, location.href);
    } catch (_) {
      return urlStr;
    }

    const isSearchPage =
      (u.hostname === 'www.google.com' || u.hostname === 'google.com') &&
      u.pathname === '/search' &&
      u.search.length > 0;

    if (!isSearchPage) return urlStr;

    const clean = new URLSearchParams();
    for (const [key, val] of u.searchParams) {
      if (KEEP.has(key)) clean.append(key, val);
    }

    const qs = clean.toString();
    return u.origin + u.pathname + (qs ? '?' + qs : '') + u.hash;
  }

  function scrubCurrentUrl() {
    const clean = cleanSearchUrl(location.href);
    if (clean !== location.href) {
      // Use the real replaceState (before we override it below) so we don't
      // recurse if Google calls replaceState in response to ours.
      origReplaceState.call(history, history.state, '', clean);
    }
  }

  // Capture originals before overriding so scrubCurrentUrl can call them safely.
  const origPushState    = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  // Intercept future history mutations so Google's JS can't re-add tracking
  // params (it frequently calls history.replaceState after page load to add
  // sei=, ved=, ei=, etc.).
  history.pushState = function (state, title, url) {
    origPushState(state, title, url != null ? cleanSearchUrl(String(url)) : url);
  };

  history.replaceState = function (state, title, url) {
    origReplaceState(state, title, url != null ? cleanSearchUrl(String(url)) : url);
  };

  // Clean once the DOM is ready (catches params baked into the initial HTML).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrubCurrentUrl);
  } else {
    scrubCurrentUrl();
  }

  // Clean again after full load in case late JS updated the URL before our
  // history.replaceState override was in place.
  window.addEventListener('load', scrubCurrentUrl);

})();
