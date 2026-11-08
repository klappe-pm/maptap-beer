// Routes the app's /api requests to the in-browser implementation. Loaded as a classic script
// before the app bundle so the patch is in place before the first request.
(function () {
  var base = document.documentElement.getAttribute('data-base') || '/';
  var apiPrefix = base + 'api/';
  var nativeFetch = window.fetch.bind(window);
  var api = null;
  window.fetch = function (input, init) {
    var url;
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    } catch (e) {
      return nativeFetch(input, init);
    }
    if (url.origin !== location.origin || url.pathname.indexOf(apiPrefix) !== 0) return nativeFetch(input, init);
    api = api || import(base + 'local-api/local-api.mjs');
    return api.then(function (m) { return m.handle(url, init); });
  };
})();
