// Injected into optional service pages (YouTube, YouTube Music) at document_start
// in the MAIN world when the user enables cookie stripping for that service.
// Prevents page JavaScript from reading auth tokens via document.cookie,
// which would otherwise cause the account widget to render the user as signed in.

(function () {
  const real =
    Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

  if (!real) return;

  Object.defineProperty(document, 'cookie', {
    get() { return ''; },
    set(v) { real.set.call(document, v); },
    configurable: true,
  });
})();
