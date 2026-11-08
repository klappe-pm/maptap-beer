// WCAG 2.1 contrast audit for the rendered page. Paste or evaluate in the browser; returns the
// failing text elements (ratio below 4.5:1, or 3:1 for large text) with selector and colours.
(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const background = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none' && !cs.backgroundImage.includes('gradient')) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) out = blend(l, out);
    return out;
  };
  const name = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const parent = el.parentElement;
    const pcls = parent && typeof parent.className === 'string' && parent.className.trim() ? parent.className.trim().split(/\s+/)[0] : parent?.tagName.toLowerCase();
    return `${pcls} > ${el.tagName.toLowerCase()}${cls}`;
  };
  const seen = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    let alpha = fg.a;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) alpha *= +getComputedStyle(n).opacity;
    const color = blend({ ...fg, a: alpha }, bg);
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const r = ratio(color, bg);
    if (r < need) {
      const key = name(el) + cs.color + cs.backgroundColor;
      if (!seen.has(key)) seen.set(key, { el: name(el), text: text.slice(0, 40), ratio: +r.toFixed(2), need, fg: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, size });
    }
  }
  return [...seen.values()].sort((a, b) => a.ratio - b.ratio);
})();
