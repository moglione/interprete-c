export function buildRuntimeSource(includedLibs = new Set()) {
  const hasGraphics = includedLibs.has('tortuga') || includedLibs.has('processing');
  return `
const __consoleOutput = document.getElementById('console-output');
const __hasGraphics = ${hasGraphics ? 'true' : 'false'};
const __canvas = __hasGraphics ? document.getElementById('main-canvas') : null;
const __ctx = __canvas ? __canvas.getContext('2d') : null;
const __graphicsState = {
  coordMode: ${includedLibs.has('processing') ? JSON.stringify('processing') : JSON.stringify('logo')},
  vp: ${includedLibs.has('processing')
    ? '{ left: 0, right: 1000, top: 0, bottom: 1000 }'
    : '{ left: -250, right: 250, top: 250, bottom: -250 }'},
  x: 0,
  y: 0,
  angle: -90,
  pen: true,
  penColor: 'rgb(255,0,0)',
  penWidth: 2
};

function __appendConsole(text, className = 'console-stdout') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = String(text);
  __consoleOutput.appendChild(span);
  __consoleOutput.scrollTop = __consoleOutput.scrollHeight;
}

function __formatPrintf(fmt, values) {
  let index = 0;
  return String(fmt).replace(/%([%disfc])/g, (match, spec) => {
    if (spec === '%') return '%';
    const value = values[index++];
    if (spec === 'd' || spec === 'i') return String(Math.trunc(Number(value) || 0));
    if (spec === 'f') return String(Number(value) || 0);
    if (spec === 'c') return String.fromCharCode(Number(value) || 0);
    return String(value ?? '');
  });
}

async function printf(fmt, ...values) {
  const text = __formatPrintf(fmt, values);
  __appendConsole(text, 'console-stdout');
  return text.length;
}

async function puts(text) {
  const out = String(text ?? '') + '\\n';
  __appendConsole(out, 'console-stdout');
  return out.length;
}

async function putchar(ch) {
  const text = String.fromCharCode(Number(ch) || 0);
  __appendConsole(text, 'console-stdout');
  return Number(ch) || 0;
}

async function scanf(fmt, ...refs) {
  const input = await __readConsoleInput();
  const specs = [...String(fmt).matchAll(/%([disfc])/g)].map(match => match[1]);
  const tokens = input.trim().split(/\s+/);
  let assigned = 0;

  for (let i = 0; i < specs.length && i < refs.length; i++) {
    const ref = refs[i];
    const raw = specs[i] === 'c' ? (input[i] ?? '') : tokens[i];
    if (!ref || typeof ref.set !== 'function' || raw === undefined) continue;

    let value = raw;
    if (specs[i] === 'd' || specs[i] === 'i') value = parseInt(raw, 10) || 0;
    else if (specs[i] === 'f') value = parseFloat(raw) || 0;
    else if (specs[i] === 'c') value = raw.charCodeAt(0) || 0;

    ref.set(value);
    assigned++;
  }

  return assigned;
}

function __ref(get, set) {
  return { get, set };
}

function __readConsoleInput() {
  return new Promise(resolve => {
    const wrapper = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.minWidth = '1ch';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.color = '#4ec9b0';
    input.style.font = 'inherit';
    input.style.width = '1ch';

    input.addEventListener('input', () => {
      input.style.width = Math.max(input.value.length + 1, 1) + 'ch';
      __consoleOutput.scrollTop = __consoleOutput.scrollHeight;
    });

    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = input.value;
      const span = document.createElement('span');
      span.className = 'console-stdin';
      span.textContent = value + '\\n';
      wrapper.replaceWith(span);
      __consoleOutput.scrollTop = __consoleOutput.scrollHeight;
      resolve(value);
    });

    wrapper.appendChild(input);
    __consoleOutput.appendChild(wrapper);
    __consoleOutput.scrollTop = __consoleOutput.scrollHeight;
    input.focus();
  });
}

function __finishProgram(code) {
  __appendConsole('\\n[Proceso terminado con código ' + code + ']\\n', 'console-info');
}

function RGB(r, g, b) {
  return ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

function random(max) {
  return Math.floor(Math.random() * (max || 1));
}

function azar(max) {
  return random(max);
}

function randomColor() {
  return RGB(
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  );
}

function __cssColor(color) {
  const r = color & 255;
  const g = (color >> 8) & 255;
  const b = (color >> 16) & 255;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function __sx(x) {
  return ((x - __graphicsState.vp.left) / (__graphicsState.vp.right - __graphicsState.vp.left)) * __canvas.width;
}

function __sy(y) {
  if (__graphicsState.coordMode === 'processing') {
    return ((y - __graphicsState.vp.top) / (__graphicsState.vp.bottom - __graphicsState.vp.top)) * __canvas.height;
  }
  return ((__graphicsState.vp.top - y) / (__graphicsState.vp.top - __graphicsState.vp.bottom)) * __canvas.height;
}

function clearScreen(color = 0) {
  if (!__ctx) return 0;
  __ctx.fillStyle = __cssColor(color);
  __ctx.fillRect(0, 0, __canvas.width, __canvas.height);
  return 0;
}

function line(x1, y1, x2, y2, color = 0, width = 1) {
  if (!__ctx) return 0;
  __ctx.beginPath();
  __ctx.moveTo(__sx(x1), __sy(y1));
  __ctx.lineTo(__sx(x2), __sy(y2));
  __ctx.strokeStyle = __cssColor(color);
  __ctx.lineWidth = Math.max(1, width);
  __ctx.stroke();
  return 0;
}

function circle(x, y, r, color = 0, fill = 0) {
  if (!__ctx) return 0;
  const scale = __canvas.width / (__graphicsState.vp.right - __graphicsState.vp.left);
  __ctx.beginPath();
  __ctx.arc(__sx(x), __sy(y), Math.abs(r * scale), 0, Math.PI * 2);
  __ctx.strokeStyle = __cssColor(color);
  __ctx.lineWidth = 2;
  __ctx.stroke();
  if (fill) {
    __ctx.fillStyle = __cssColor(fill);
    __ctx.fill();
  }
  return 0;
}

function circulo(x, y, r, color = 0, fill = 0) {
  return circle(x, y, r, color, fill);
}

async function forward(dist) {
  if (!__ctx) return 0;
  const angle = __graphicsState.angle * Math.PI / 180;
  const x2 = __graphicsState.x + Math.cos(angle) * dist;
  const y2 = __graphicsState.y - Math.sin(angle) * dist;
  if (__graphicsState.pen) {
    __ctx.beginPath();
    __ctx.moveTo(__sx(__graphicsState.x), __sy(__graphicsState.y));
    __ctx.lineTo(__sx(x2), __sy(y2));
    __ctx.strokeStyle = __graphicsState.penColor;
    __ctx.lineWidth = __graphicsState.penWidth;
    __ctx.stroke();
  }
  __graphicsState.x = x2;
  __graphicsState.y = y2;
  return 0;
}

async function backward(dist) {
  return forward(-dist);
}

async function rightTurn(angle) {
  __graphicsState.angle += angle;
  return 0;
}

async function leftTurn(angle) {
  __graphicsState.angle -= angle;
  return 0;
}

function penUp() {
  __graphicsState.pen = false;
  return 0;
}

function penDown() {
  __graphicsState.pen = true;
  return 0;
}

function penColour(r, g, b) {
  __graphicsState.penColor = 'rgb(' + (r & 255) + ',' + (g & 255) + ',' + (b & 255) + ')';
  return 0;
}

function penSize(size) {
  __graphicsState.penWidth = Math.max(1, size);
  return 0;
}

function size(w, h) {
  if (!__canvas) return 0;
  __canvas.width = w;
  __canvas.height = h;
  clearScreen(0);
  return 0;
}

function view(l, t, r, b) {
  __graphicsState.vp = { left: l, right: r, top: t, bottom: b };
  return 0;
}

if (__ctx) clearScreen(0);
`;
}
