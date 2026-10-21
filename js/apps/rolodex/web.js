// The connection web: everyone pinned to a corkboard, tied together with string.
// Coloured string = how two people know each other; pale thread = how you met
// them (from you, or from whoever introduced you).
//
//   createWeb({ focus, onOpen, onConnect }) -> { el, destroy }
//   focus: a card id to show just that person and the people around them.
import { h } from '../../ui.js';
import { RELATIONS, ME } from './config.js';
import { contacts, connections, displayName } from './data.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...children.filter(Boolean));
  return el;
};

const shortName = (c) => {
  const name = displayName(c);
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
};

// Nodes and links for the whole board, or for one person's neighbourhood.
function buildGraph({ focus, everyone, showMet }) {
  const all = contacts.all();
  const edges = connections.all().filter((e) => contacts.get(e.a) && contacts.get(e.b));
  const links = edges.map((e) => ({ a: e.a, b: e.b, kind: e.kind || 'unknown', edge: e }));
  if (showMet) {
    for (const c of all) {
      const from = c.introducedBy && contacts.get(c.introducedBy) ? c.introducedBy : ME;
      links.push({ a: from, b: c.id, kind: from === ME ? 'met' : 'intro' });
    }
  }
  let ids;
  if (focus) {
    ids = new Set([focus]);
    links.forEach((l) => { if (l.a === focus) ids.add(l.b); if (l.b === focus) ids.add(l.a); });
  } else if (everyone) {
    ids = new Set([ME, ...all.map((c) => c.id)]);
  } else {
    // Only people with a real connection or an introduction, plus you.
    ids = new Set([ME]);
    edges.forEach((e) => { ids.add(e.a); ids.add(e.b); });
    all.forEach((c) => { if (c.introducedBy && contacts.get(c.introducedBy)) { ids.add(c.id); ids.add(c.introducedBy); } });
  }
  const nodes = [...ids].map((id) => ({ id, me: id === ME, contact: id === ME ? null : contacts.get(id) }))
    .filter((n) => n.me || n.contact);
  const keep = new Set(nodes.map((n) => n.id));
  return { nodes, links: links.filter((l) => keep.has(l.a) && keep.has(l.b)) };
}

// A small force layout: pins push apart, string pulls them together.
function layoutForces(nodes, links, { width, height, focus }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = focus ?? ME;
  nodes.forEach((n, i) => {
    if (n.x != null) return;
    const angle = i * 2.399963; // golden angle spiral: an even, untangled start
    const r = 40 * Math.sqrt(i + 1);
    n.x = width / 2 + Math.cos(angle) * r;
    n.y = height / 2 + Math.sin(angle) * r;
    n.vx = 0; n.vy = 0;
  });
  const pinned = byId.get(center);
  const resolved = links.map((l) => ({ ...l, s: byId.get(l.a), t: byId.get(l.b) })).filter((l) => l.s && l.t);
  const degree = new Map();
  resolved.forEach((l) => { degree.set(l.a, (degree.get(l.a) ?? 0) + 1); degree.set(l.b, (degree.get(l.b) ?? 0) + 1); });

  return function step(alpha) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x; let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 160000) continue;
        const f = (5200 / d2) * alpha;
        const d = Math.sqrt(d2);
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f;
      }
    }
    for (const l of resolved) {
      const dx = l.t.x - l.s.x; const dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = l.kind === 'met' ? 150 : 110;
      const strength = (l.kind === 'met' ? 0.02 : 0.06) / Math.min(degree.get(l.a), degree.get(l.b));
      const f = (d - rest) * strength * alpha;
      l.s.vx += (dx / d) * f; l.s.vy += (dy / d) * f;
      l.t.vx -= (dx / d) * f; l.t.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      // A gentle pull to the middle keeps loners on the board.
      n.vx += (width / 2 - n.x) * 0.004 * alpha;
      n.vy += (height / 2 - n.y) * 0.004 * alpha;
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.6; n.vy *= 0.6;
      n.x += n.vx; n.y += n.vy;
    }
    if (pinned && !pinned.fixed) { pinned.x += (width / 2 - pinned.x) * 0.2; pinned.y += (height / 2 - pinned.y) * 0.2; }
  };
}

// String sags a little under its own weight.
function stringPath(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * 0.08;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

export function createWeb({ focus = null, onOpen, onConnect, compact = false } = {}) {
  let everyone = false;
  let showMet = true;
  let selected = focus;
  let graph = null;
  let step = null;
  let frame = 0;
  let alpha = 1;
  let view = { x: 0, y: 0, k: 1 };
  const W = 1000; const H = 700;

  const viewport = s('g', { class: 'web-view' });
  const svg = s('svg', { class: 'web-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Connection web' }, viewport);
  const info = h('div', { class: 'web-info', hidden: true });
  const emptyNote = h('p', { class: 'web-empty', hidden: true }, 'No connections pinned up yet. Open a card and add who they know, or tap Everyone to see all your cards.');
  const legend = h('div', { class: 'web-legend' });
  const controls = compact ? null : h('div', { class: 'web-controls' });
  const board = h('div', { class: `web-board${compact ? ' compact' : ''}` }, svg, info, emptyNote, compact ? null : legend);
  const el = h('div', { class: 'web' }, controls, board);

  function applyView() { viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); }

  const neighbours = (id) => {
    const set = new Set([id]);
    graph.links.forEach((l) => { if (l.a === id) set.add(l.b); if (l.b === id) set.add(l.a); });
    return set;
  };

  let linkEls = []; let nodeEls = new Map();
  function draw() {
    const near = selected ? neighbours(selected) : null;
    const linkLayer = s('g', { class: 'web-links' });
    const nodeLayer = s('g', { class: 'web-nodes' });
    linkEls = graph.links.map((l) => {
      const color = l.kind === 'met' || l.kind === 'intro' ? null : RELATIONS[l.kind]?.color ?? RELATIONS.unknown.color;
      const dim = near && !(near.has(l.a) && near.has(l.b) && (l.a === selected || l.b === selected));
      const path = s('path', {
        class: `web-string ${l.kind === 'met' ? 'met' : l.kind === 'intro' ? 'intro' : 'tie'}${dim ? ' dim' : ''}`,
        style: color ? `--string:${color}` : null,
      }, s('title', {}, linkTitle(l)));
      linkLayer.append(path);
      return { l, path };
    });
    nodeEls = new Map();
    for (const n of graph.nodes) {
      const name = n.me ? 'Me' : shortName(n.contact);
      const w = Math.max(64, name.length * 7.2 + 20);
      const dim = near && !near.has(n.id);
      const g = s('g', { class: `web-node${n.me ? ' me' : ''}${n.id === selected ? ' on' : ''}${dim ? ' dim' : ''}`, 'data-id': n.id, tabindex: '0', role: 'button', 'aria-label': n.me ? 'You' : displayName(n.contact) },
        s('rect', { class: 'web-paper', x: -w / 2, y: -2, width: w, height: n.me ? 30 : 26, rx: 2, transform: `rotate(${((hash(n.id) % 7) - 3) * 0.8})` }),
        s('text', { class: 'web-name', x: 0, y: n.me ? 19 : 16, 'text-anchor': 'middle' }, name),
        s('circle', { class: 'web-pin-shadow', cx: 2, cy: 2, r: n.me ? 7 : 5.5 }),
        s('circle', { class: 'web-pin', cx: 0, cy: 0, r: n.me ? 7 : 5.5, style: n.me ? null : `--pin:${pinColor(n.contact)}` }),
        s('circle', { class: 'web-pin-shine', cx: -1.6, cy: -1.8, r: n.me ? 2.2 : 1.7 }));
      nodeLayer.append(g);
      nodeEls.set(n.id, { n, g });
    }
    viewport.replaceChildren(linkLayer, nodeLayer);
    position();
  }

  function position() {
    for (const { l, path } of linkEls) {
      const a = nodeEls.get(l.a)?.n; const b = nodeEls.get(l.b)?.n;
      if (a && b) path.setAttribute('d', stringPath(a, b));
    }
    for (const { n, g } of nodeEls.values()) g.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
  }

  function linkTitle(l) {
    const name = (id) => (id === ME ? 'You' : displayName(contacts.get(id)));
    if (l.kind === 'met') return `You met ${name(l.b)}`;
    if (l.kind === 'intro') return `${name(l.a)} introduced you to ${name(l.b)}`;
    return `${name(l.a)} & ${name(l.b)}: ${RELATIONS[l.kind]?.label ?? 'Unknown'}${l.edge?.note ? ` (${l.edge.note})` : ''}`;
  }

  function run() {
    cancelAnimationFrame(frame);
    const loop = () => {
      for (let i = 0; i < 2; i++) step(alpha);
      alpha *= 0.985;
      position();
      if (alpha > 0.02) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }

  function rebuild() {
    const old = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
    graph = buildGraph({ focus, everyone, showMet });
    graph.nodes.forEach((n) => { const o = old.get(n.id); if (o) Object.assign(n, { x: o.x, y: o.y, vx: 0, vy: 0 }); });
    step = layoutForces(graph.nodes, graph.links, { width: W, height: H, focus });
    // Settle most of the way before showing, so the board doesn't explode open.
    if (!old.size) { for (let i = 0; i < 180; i++) step(1 - i / 220); alpha = 0.25; } else alpha = 0.5;
    draw();
    renderControls();
    renderLegend();
    showInfo();
    if (!old.size) fit();
    run();
  }

  function fit() {
    if (!graph.nodes.length) return;
    const xs = graph.nodes.map((n) => n.x); const ys = graph.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 80, Math.max(...xs) + 80, Math.min(...ys) - 40, Math.max(...ys) + 50];
    const k = Math.min(2, W / (x1 - x0), H / (y1 - y0));
    view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
    applyView();
  }

  function renderControls() {
    if (!controls) return;
    const toggle = (label, on, flip) => h('button', { type: 'button', class: `rdx-chip${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: flip }, label);
    const people = graph.nodes.filter((n) => !n.me).length;
    emptyNote.hidden = people > 0;
    controls.replaceChildren(
      toggle('Everyone', everyone, () => { everyone = !everyone; rebuild(); }),
      toggle('How I met them', showMet, () => { showMet = !showMet; rebuild(); }),
      h('button', { type: 'button', class: 'rdx-chip', onclick: fit }, 'Fit to board'),
      h('span', { class: 'rdx-dim small' }, `${people} ${people === 1 ? 'person' : 'people'} · ${graph.links.filter((l) => l.edge).length} connections`));
  }

  function renderLegend() {
    const used = new Set(graph.links.map((l) => l.kind));
    legend.replaceChildren(
      ...Object.entries(RELATIONS).filter(([k]) => used.has(k)).map(([, r]) => h('span', { class: 'web-key' }, h('i', { style: `--string:${r.color}` }), r.label)),
      used.has('intro') ? h('span', { class: 'web-key' }, h('i', { class: 'intro' }), 'Introduced me') : null,
      used.has('met') ? h('span', { class: 'web-key' }, h('i', { class: 'met' }), 'Met myself') : null);
    legend.hidden = !legend.children.length;
  }

  function showInfo() {
    const c = selected && selected !== ME ? contacts.get(selected) : null;
    if (!c || compact) { info.hidden = true; return; }
    const near = [...neighbours(c.id)].filter((id) => id !== c.id && id !== ME).length;
    info.hidden = false;
    info.replaceChildren(
      h('strong', {}, displayName(c)),
      c.company || c.title ? h('span', { class: 'rdx-dim' }, [c.title, c.company].filter(Boolean).join(' · ')) : null,
      h('span', { class: 'rdx-dim small' }, `${near} connection${near === 1 ? '' : 's'} on the board`),
      h('div', { class: 'rdx-row' },
        h('button', { type: 'button', class: 'rdx-btn small primary', onclick: () => onOpen?.(c.id) }, 'Open card'),
        h('button', { type: 'button', class: 'rdx-btn small', onclick: () => onConnect?.(c.id) }, '＋ Connection')));
  }

  // ---- Pan, zoom, drag pins --------------------------------------------------------
  const toBoard = (event) => {
    const rect = svg.getBoundingClientRect();
    const scale = Math.max(W / rect.width, H / rect.height);
    const ox = (rect.width * scale - W) / 2; const oy = (rect.height * scale - H) / 2;
    return { x: (event.clientX - rect.left) * scale - ox, y: (event.clientY - rect.top) * scale - oy, scale };
  };
  const pointers = new Map();
  let gesture = null;

  svg.addEventListener('pointerdown', (event) => {
    svg.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, toBoard(event));
    const nodeG = event.target.closest?.('.web-node');
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      gesture = { type: 'pinch', d: Math.hypot(p.x - q.x, p.y - q.y), view: { ...view }, mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
    } else if (nodeG) {
      const n = nodeEls.get(nodeG.dataset.id).n;
      n.fixed = true;
      gesture = { type: 'node', n, start: toBoard(event), moved: false };
    } else {
      gesture = { type: 'pan', start: toBoard(event), view: { ...view }, moved: false };
    }
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const p = toBoard(event);
    pointers.set(event.pointerId, p);
    if (gesture.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = Math.max(0.2, Math.min(4, gesture.view.k * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d));
      view = { k, x: gesture.mid.x - (gesture.mid.x - gesture.view.x) * (k / gesture.view.k), y: gesture.mid.y - (gesture.mid.y - gesture.view.y) * (k / gesture.view.k) };
      applyView();
      return;
    }
    const dx = p.x - gesture.start.x; const dy = p.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 5 * p.scale) return;
    gesture.moved = true;
    if (gesture.type === 'node') {
      gesture.n.x = (p.x - view.x) / view.k;
      gesture.n.y = (p.y - view.y) / view.k;
      alpha = Math.max(alpha, 0.3);
      position();
      if (alpha <= 0.3) run();
    } else if (gesture.type === 'pan') {
      view = { ...view, x: gesture.view.x + dx, y: gesture.view.y + dy };
      applyView();
    }
  });
  const end = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (gesture?.type === 'node') {
      gesture.n.fixed = gesture.moved; // a pin you moved stays where you put it
      if (!gesture.moved) select(gesture.n.id);
    } else if (gesture?.type === 'pan' && !gesture.moved) {
      select(focus);
    }
    if (!pointers.size) gesture = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (event) => {
    // On a contact's page the small board lets the page scroll; pinch / ctrl+scroll still zooms.
    if (compact && !event.ctrlKey) return;
    event.preventDefault();
    const p = toBoard(event);
    const k = Math.max(0.2, Math.min(4, view.k * Math.exp(-event.deltaY * 0.0015)));
    view = { k, x: p.x - (p.x - view.x) * (k / view.k), y: p.y - (p.y - view.y) * (k / view.k) };
    applyView();
  }, { passive: false });
  svg.addEventListener('keydown', (event) => {
    const id = event.target.closest?.('.web-node')?.dataset.id;
    if (id && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(id); }
  });

  function select(id) {
    if (compact && id && id !== ME && id !== focus) { onOpen?.(id); return; }
    selected = id === selected && !compact ? focus : id;
    draw();
    showInfo();
  }

  // Redraw when cards or connections change elsewhere.
  let pending = 0;
  const changed = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(rebuild); };
  const offs = [contacts.subscribe(changed), connections.subscribe(changed)];

  rebuild();
  return {
    el,
    refresh: rebuild,
    destroy() { cancelAnimationFrame(frame); cancelAnimationFrame(pending); offs.forEach((off) => off()); },
  };
}

function hash(str) {
  let x = 0;
  for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(x);
}

const PINS = ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#f97316', '#0891b2'];
const pinColor = (c) => PINS[hash(c.id) % PINS.length];
