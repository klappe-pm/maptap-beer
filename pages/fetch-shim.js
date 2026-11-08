// Routes the app's /api requests to the in-browser implementation. Loaded as a classic script
// before the app bundle so the patch is in place before the first request.
(function () {
  var base = document.documentElement.getAttribute('data-base') || '/';
  var apiPrefix = base + 'api/';
  var nativeFetch = window.fetch.bind(window);
  var api = null;
  // Touch-first devices: a globe tap locks in the guess and results auto-advance.
  window.__mtPhone = function () {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  };
  // Polite live region so screen readers hear each round's result.
  var live = null;
  function announce(text) {
    if (!live) {
      live = document.createElement('div');
      live.className = 'mt-sr';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { announce(''); });
  else announce('');
  // Called by the app after a guess is scored.
  window.__mtResult = function (data) {
    var r = data.result, g = data.game, b = r.brewery;
    var text = 'Round ' + g.round + ' of 5: ' + r.score + ' points, ' + r.distance.toLocaleString() + ' kilometres from ' +
      b.name + ' in ' + b.city + ', ' + b.country + '.' + (g.complete ? ' Flight complete with ' + g.total + ' points.' : '');
    announce(text);
    if (window.__mtPhone()) {
      var panel = document.querySelector('.game-panel');
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (panel) panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };
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
