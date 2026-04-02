export class HtmlPackager {
  buildStandalone(sourceCode, runtimeModules) {
    const runtimeBundle = this._buildRuntimeBundle(runtimeModules);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Programa C exportado</title>
  <style>
    :root {
      --bg-sidebar: #252526;
      --border: #454545;
      --text-dim: #969696;
      --green: #4ec9b0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      height: 100vh;
      overflow: hidden;
      background: #1e1e1e;
      color: #cccccc;
      font-family: system-ui, sans-serif;
    }
    .output-column {
      display: grid;
      grid-template-areas: "stack";
      height: 100vh;
      min-height: 0;
      position: relative;
    }
    .graphics-panel {
      grid-area: stack;
      z-index: 1;
      background: #000;
      visibility: hidden;
      opacity: 0;
    }
    .output-column.has-graphics .graphics-panel {
      visibility: visible;
      opacity: 1;
    }
    #canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    #main-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: left top;
    }
    .console-panel {
      grid-area: stack;
      z-index: 2;
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: rgba(30,30,30,0.7);
    }
    .console-header {
      padding: 8px 16px;
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    #console-output {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      cursor: text;
    }
    .console-info { color: #969696; font-style: italic; }
    .console-error { color: #f48771; }
    .console-stdin { color: #4ec9b0; }
    .console-input-line { display: inline; }
    .console-inline-input {
      min-width: 1ch;
      background: transparent;
      border: none;
      outline: none;
      color: var(--green);
      font: inherit;
      text-shadow: inherit;
      caret-color: var(--green);
    }
  </style>
</head>
<body>
  <section class="output-column" id="output-column">
    <div class="graphics-panel" id="graphics-panel">
      <div id="canvas-container">
        <canvas id="main-canvas" width="1000" height="1000"></canvas>
      </div>
    </div>
    <div class="console-panel">
      <div class="console-header">CONSOLA / SALIDA</div>
      <pre id="console-output"></pre>
    </div>
  </section>

  <script>
${runtimeBundle}

const __programSource = ${JSON.stringify(sourceCode)};
let __pendingInput = null;
let __activeStdinInput = null;
let __outputBuffer = '';

function __appendConsole(text, type = 'stdout') {
  if (type === 'info' && String(text).startsWith('[Esperando entrada')) return;

  const out = document.getElementById('console-output');
  const span = document.createElement('span');
  span.className = 'console-' + type;
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function __clearConsole() {
  __activeStdinInput = null;
  document.getElementById('console-output').innerHTML = '';
}

function __makeSyncStdout() {
  return (text) => {
    __outputBuffer += text;
    const lines = __outputBuffer.split('\\n');
    for (let i = 0; i < lines.length - 1; i++) {
      __appendConsole(lines[i] + '\\n', 'stdout');
    }
    __outputBuffer = lines[lines.length - 1];
  };
}

function __flushStdout() {
  if (__outputBuffer) {
    __appendConsole(__outputBuffer, 'stdout');
    __outputBuffer = '';
  }
}

function __appendInlineConsoleInput() {
  const out = document.getElementById('console-output');
  const wrapper = document.createElement('span');
  const input = document.createElement('input');

  wrapper.className = 'console-input-line';
  input.type = 'text';
  input.className = 'console-inline-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.width = '1ch';

  input.addEventListener('input', () => {
    input.style.width = Math.max(input.value.length + 1, 1) + 'ch';
    out.scrollTop = out.scrollHeight;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const val = input.value;
    const stdinSpan = document.createElement('span');
    stdinSpan.className = 'console-stdin';
    stdinSpan.textContent = val + '\\n';
    wrapper.replaceWith(stdinSpan);
    __activeStdinInput = null;
    out.scrollTop = out.scrollHeight;

    if (__pendingInput) {
      const resolve = __pendingInput;
      __pendingInput = null;
      resolve(val);
    }
  });

  wrapper.appendChild(input);
  out.appendChild(wrapper);
  __activeStdinInput = input;
  out.scrollTop = out.scrollHeight;
  return input;
}

function __makeAsyncStdin() {
  return async () => {
    __flushStdout();
    __appendInlineConsoleInput().focus();
    return new Promise((resolve) => {
      __pendingInput = resolve;
    });
  };
}

document.getElementById('console-output').addEventListener('click', () => {
  if (__activeStdinInput) __activeStdinInput.focus();
});

async function __runExportedProgram() {
  __clearConsole();

  const pre = new Preprocessor();
  const { code: src, includedLibs } = pre.process(__programSource);
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();

  const stdout = __makeSyncStdout();
  const stdin = __makeAsyncStdin();
  const hasGraphics = includedLibs.has('tortuga') || includedLibs.has('processing');
  const outCol = document.getElementById('output-column');
  const gPanel = document.getElementById('graphics-panel');
  let graphicsLib = null;

  if (hasGraphics) {
    graphicsLib = new GraphicsLib(document.getElementById('main-canvas'));
    outCol.classList.add('has-graphics');
    gPanel.classList.add('active');
  } else {
    outCol.classList.remove('has-graphics');
    gPanel.classList.remove('active');
  }

  if (graphicsLib) {
    graphicsLib._clearScreen(0);
    const container = document.getElementById('canvas-container');
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      graphicsLib.setSize(1000, 1000);
    }
  }

  const stdlib = new StdLib({ stdout, stdin, graphics: graphicsLib, includedLibs });
  const interp = new Interpreter({ stdout, stdin });
  interp.stdlib = stdlib;

  try {
    const exitCode = await interp.run(ast, stdlib);
    __flushStdout();
    __appendConsole('\\n[Proceso terminado con código ' + exitCode + ']\\n', 'info');
  } catch (err) {
    __flushStdout();
    const msg = err.format ? err.format() : err.message;
    __appendConsole('\\n' + msg + '\\n', 'error');
    console.error(err);
  }
}

__runExportedProgram();
  </script>
</body>
</html>`;
  }

  _buildRuntimeBundle(runtimeModules) {
    const order = [
      'src/errors/CError.js',
      'src/interpreter/CTypes.js',
      'src/interpreter/Environment.js',
      'src/interpreter/Memory.js',
      'src/interpreter/Interpreter.js',
      'src/graphics/GraphicsLib.js',
      'src/preprocessor/Preprocessor.js',
      'src/lexer/TokenTypes.js',
      'src/lexer/Lexer.js',
      'src/parser/AST.js',
      'src/parser/Parser.js',
      'src/stdlib/StdLib.js',
    ];

    return order
      .map(path => this._stripModuleSyntax(runtimeModules[path] ?? '', path))
      .join('\n\n');
  }

  _stripModuleSyntax(source, path) {
    if (!source) {
      throw new Error('No se pudo empaquetar el módulo ' + path);
    }

    return source
      .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
      .replace(/^\s*export\s+class\s+/gm, 'class ')
      .replace(/^\s*export\s+function\s+/gm, 'function ')
      .replace(/^\s*export\s+const\s+/gm, 'const ')
      .replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, '');
  }
}
