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
  // Place filter value: "World" or "Continent › Country › Region › City" (any prefix).
  window.__mtMatch = function (b, value) {
    if (!value || value === 'World') return true;
    var p = value.split(' › ');
    return (!p[0] || b.continent === p[0]) && (!p[1] || b.country === p[1]) &&
      (!p[2] || b.region === p[2]) && (!p[3] || b.city === p[3]);
  };

  // Country names on the globe. Elements are created once and reused across map styles.
  var COUNTRY_LABELS = /*__COUNTRY_LABELS__*/[];
  var countryData = null;
  window.__mtCountryLabels = function (atlas) {
    document.documentElement.classList.toggle('mt-imagery', !atlas);
    if (!countryData) {
      countryData = COUNTRY_LABELS.map(function (c) {
        var el = document.createElement('div');
        var rank = c[3];
        el.className = 'mt-country mt-r' + rank + (rank >= 6 ? ' mt-detail' : rank >= 4 ? ' mt-minor' : '');
        el.textContent = c[0];
        el.setAttribute('aria-hidden', 'true');
        return { lat: c[1], lng: c[2], rank: rank, el: el };
      });
      // Placement order for collision culling: most important names first.
      ordered = countryData.slice().sort(function (a, b) { return a.rank - b.rank || b.el.textContent.length - a.el.textContent.length; });
    }
    return countryData;
  };
  // Front-side test done here: globe.gl's own behind-the-globe check reports the far side as
  // visible in this setup, which drew hidden countries over the visible hemisphere. A label shows
  // when its angular distance from the view centre is inside the horizon, acos(1 / (1 + altitude)).
  var RAD = Math.PI / 180;
  var ordered = null;
  var lastPov = '';
  var settle = 0;
  var tick = 0;
  function frontSide(pov) {
    var zoom = pov.altitude < 1.15 ? 'near' : pov.altitude < 1.75 ? 'mid' : 'far';
    if (document.documentElement.getAttribute('data-mt-zoom') !== zoom) document.documentElement.setAttribute('data-mt-zoom', zoom);
    var horizon = Math.acos(1 / (1 + pov.altitude)) * 0.9;
    var la = pov.lat * RAD, ln = pov.lng * RAD, sinLa = Math.sin(la), cosLa = Math.cos(la);
    for (var k = 0; k < countryData.length; k++) {
      var d = countryData[k];
      var b = d.lat * RAD;
      var cos = sinLa * Math.sin(b) + cosLa * Math.cos(b) * Math.cos(d.lng * RAD - ln);
      d.front = Math.acos(Math.max(-1, Math.min(1, cos))) < horizon;
    }
  }
  // Greedy collision culling: place labels in rank order and skip any that would overlap a
  // label already placed, so dense regions show the most important names cleanly.
  function cull() {
    var placed = [];
    for (var k = 0; k < ordered.length; k++) {
      var d = ordered[k];
      var show = false;
      if (d.front && d.el.offsetWidth) {
        var r = d.el.getBoundingClientRect();
        show = true;
        for (var j = 0; j < placed.length; j++) {
          var p = placed[j];
          if (r.left < p.right + 3 && r.right + 3 > p.left && r.top < p.bottom + 1 && r.bottom + 1 > p.top) { show = false; break; }
        }
        if (show) placed.push(r);
      }
      if (d.shown !== show) {
        d.shown = show;
        d.el.style.visibility = show ? 'visible' : 'hidden';
      }
    }
  }
  function placeLabels(pov) {
    if (!countryData) return;
    var key = pov.lat.toFixed(2) + ',' + pov.lng.toFixed(2) + ',' + pov.altitude.toFixed(3);
    if (key !== lastPov) {
      lastPov = key;
      frontSide(pov);
      settle = 3; // the renderer positions labels on its next frame, so re-check after it
    }
    // Also re-check every 12 frames: labels attach and get positioned over the first frames
    // after load, and map style changes alter their size.
    tick = (tick + 1) % 12;
    if (settle > 0 || tick === 0) {
      if (settle > 0) settle--;
      cull();
    }
  }
  window.__mtZoom = placeLabels;
  // Runs every frame: programmatic camera moves (fly-to after a guess, reset) do not always
  // raise onZoom, and culling needs the positions from the frame after a move.
  (function watch() {
    var globe = window.__mtGlobe;
    if (globe && countryData) {
      try { placeLabels(globe.pointOfView()); } catch (e) { /* globe torn down */ }
    }
    window.requestAnimationFrame(watch);
  })();

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
