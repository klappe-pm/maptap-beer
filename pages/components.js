// Components injected into the app bundle at module scope by scripts/features.mjs. They use the
// bundle's own React (`i`) and JSX runtime (`O`), so they render inside the app like its own UI.
// __MT_BASE__ is replaced with the deploy base path at build time.

// Place filter: Continent, Country, Region or State, City. The value is the app's existing
// "country" state, holding "World" or a path joined by " › ". In Practice, places with fewer
// than five breweries are disabled, because a flight needs five.
function MtPlace({ value, onChange, practice }) {
  const [places, setPlaces] = (0, i.useState)(window.__mtPlaces || null);
  (0, i.useEffect)(() => {
    if (places) return;
    let gone = false;
    fetch(`__MT_BASE__places.json`)
      .then((r) => r.json())
      .then((d) => {
        window.__mtPlaces = d;
        if (!gone) setPlaces(d);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  const parts = value && value !== `World` ? value.split(` › `) : [];
  const min = practice ? 5 : 1;
  const levels = [
    [`Continent`, `All Continents`, places || []],
  ];
  let node = places && places.find((p) => p.name === parts[0]);
  levels.push([`Country`, `All Countries`, node ? node.children : []]);
  node = node && node.children.find((p) => p.name === parts[1]);
  levels.push([`Region or State`, `All Regions`, node ? node.children : []]);
  node = node && node.children.find((p) => p.name === parts[2]);
  levels.push([`City`, `All Cities`, node ? node.children : []]);
  const choose = (level, name) => {
    const next = parts.slice(0, level);
    if (name) next.push(name);
    onChange(next.length ? next.join(` › `) : `World`);
  };
  return (0, O.jsxs)(`fieldset`, {
    className: `mt-place`,
    children: [
      (0, O.jsx)(`legend`, { children: practice ? `Pick Your Patch` : `Where in the World?` }),
      (0, O.jsx)(`div`, {
        className: `mt-place-grid`,
        children: levels.map(([label, all, options], level) =>
          (0, O.jsxs)(
            `label`,
            {
              className: `field`,
              children: [
                (0, O.jsx)(`span`, { children: label }),
                (0, O.jsxs)(`select`, {
                  value: parts[level] || ``,
                  disabled: level > 0 && !parts[level - 1],
                  onChange: (e) => choose(level, e.target.value),
                  children: [
                    (0, O.jsx)(`option`, { value: ``, children: all }),
                    options.map((p) =>
                      (0, O.jsx)(
                        `option`,
                        { value: p.name, disabled: p.count < min, children: `${p.name} (${p.count.toLocaleString()})` },
                        p.name,
                      ),
                    ),
                  ],
                }),
              ],
            },
            label,
          ),
        ),
      }),
    ],
  });
}

// GABF card: medal summary for a brewery that has won at the Great American Beer Festival,
// linking to its page on gabf.beer.
function MtGabf({ g }) {
  if (!g) return null;
  const years = g.first === g.last ? `${g.first}` : `${g.first} to ${g.last}`;
  const medals = [
    [`gold`, g.gold, `Gold`],
    [`silver`, g.silver, `Silver`],
    [`bronze`, g.bronze, `Bronze`],
  ].filter(([, n]) => n);
  return (0, O.jsxs)(`div`, {
    className: `mt-gabf`,
    children: [
      (0, O.jsx)(`div`, { className: `mt-gabf-title`, children: `Great American Beer Festival` }),
      (0, O.jsx)(`div`, {
        className: `mt-gabf-medals`,
        children: medals.map(([cls, n, label]) =>
          (0, O.jsxs)(`span`, { className: `mt-medal mt-${cls}`, children: [(0, O.jsx)(`b`, { children: n }), ` ${label}`] }, cls),
        ),
      }),
      (0, O.jsx)(`p`, { children: `${g.medals} ${g.medals === 1 ? `medal` : `medals`}, ${years}` }),
      (0, O.jsx)(`a`, {
        href: `https://gabf.beer/breweries/${encodeURIComponent(g.slug)}/`,
        target: `_blank`,
        rel: `noreferrer`,
        children: `View on GABF.beer ↗`,
      }),
    ],
  });
}
