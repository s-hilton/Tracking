import { h } from '../ui.js';

const KEYS = [
  ['C', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'],
  ['7'], ['8'], ['9'], ['×', 'op'],
  ['4'], ['5'], ['6'], ['−', 'op'],
  ['1'], ['2'], ['3'], ['+', 'op'],
  ['0', 'wide'], ['.'], ['=', 'op eq'],
];

const KEYBOARD = { '/': '÷', '*': '×', '-': '−', '+': '+', Enter: '=', '=': '=', Escape: 'C', Backspace: '⌫', '%': '%' };

const format = (n) => (Number.isFinite(n) ? String(Number(n.toPrecision(12))) : 'Error');

function calc(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

export default {
  id: 'calculator',
  name: 'Calculator',
  icon: '🧮',
  color: '#64748b',
  size: { w: 320, h: 470 },

  mount(root) {
    let current = '0';
    let previous = null;
    let operator = null;
    let fresh = false; // next digit starts a new number

    const expr = h('div', { class: 'calc-expr muted' });
    const display = h('div', { class: 'calc-display', 'aria-live': 'polite' });

    function render() {
      display.textContent = current;
      expr.textContent = previous != null && operator ? `${format(previous)} ${operator}` : ' ';
    }

    function evaluate() {
      if (operator == null || previous == null) return;
      current = format(calc(previous, parseFloat(current), operator));
      previous = null;
      operator = null;
      fresh = true;
    }

    function press(key) {
      if (current === 'Error' && key !== 'C' && !/[0-9.]/.test(key)) return;
      if (/^[0-9.]$/.test(key)) {
        if (fresh || current === 'Error') { current = '0'; fresh = false; }
        if (key === '.' && current.includes('.')) return;
        current = current === '0' && key !== '.' ? key : current + key;
      } else if (key === 'C') {
        current = '0'; previous = null; operator = null; fresh = false;
      } else if (key === '⌫') {
        if (!fresh) current = current.length > 1 ? current.slice(0, -1) : '0';
      } else if (key === '±') {
        current = format(-parseFloat(current));
      } else if (key === '%') {
        current = format(parseFloat(current) / 100);
      } else if (key === '=') {
        evaluate();
      } else {
        if (operator && !fresh) evaluate();
        previous = parseFloat(current);
        operator = key;
        fresh = true;
      }
      render();
    }

    const pad = h('div', { class: 'calc-pad' }, ...KEYS.map(([label, kind = '']) =>
      h('button', { class: `calc-key ${kind}`, onclick: () => press(label) }, label)));

    const app = h('div', {
      class: 'app calc',
      tabindex: '0',
      onkeydown: (event) => {
        const key = /^[0-9.]$/.test(event.key) ? event.key : KEYBOARD[event.key];
        if (!key) return;
        event.preventDefault();
        press(key);
      },
    }, h('div', { class: 'calc-screen' }, expr, display), pad);

    root.append(app);
    render();
    app.focus({ preventScroll: true });
  },
};
