/**
 * main.js — Punto de entrada de la UI
 *
 * Conecta CodeMirror 6 (cargado como ESM desde CDN via importmap) con el
 * pipeline del intérprete de C99.
 *
 * Flujo: Código C → Preprocessor → Lexer → Parser → Interpreter → consola UI
 */

import { Preprocessor } from './preprocessor/Preprocessor.js';
import { Lexer }        from './lexer/Lexer.js';
import { Parser }       from './parser/Parser.js';
import { Interpreter }  from './interpreter/Interpreter.js';
import { StdLib }       from './stdlib/StdLib.js';
import { GraphicsLib }  from './graphics/GraphicsLib.js';
import { HtmlPackager } from './compiler/HtmlPackager.js';

// CodeMirror 6 — importados via importmap en index.html
import { EditorState, Compartment } from 'codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
         highlightSpecialChars, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor,
         highlightActiveLine }              from 'codemirror/view';
import { defaultKeymap, history, historyKeymap } from 'codemirror/commands';
import { indentOnInput, syntaxHighlighting,
         defaultHighlightStyle, bracketMatching,
         foldGutter, indentUnit }           from 'codemirror/language';
import { autocompletion, closeBrackets,
         completionKeymap,
         closeBracketsKeymap }             from 'codemirror/autocomplete';
import { cpp }                             from 'codemirror/lang-cpp';
import { oneDark }                         from 'codemirror/theme-one-dark';

// ── Programas de ejemplo ─────────────────────────────────────────────

// Los ejemplos ahora se cargan desde la carpeta física /ejemplos/ via fetch()

// Estado global
let editorView   = null;
let inputQueue   = [];          // Líneas pre-ingresadas antes de que el programa las pida
let pendingInput = null;        // resolve() de la Promise pendiente por un scanf
let activeStdinInput = null;    // Input temporal embebido en la consola
let outputBuffer = '';          // Acumulador de stdout
let isRunning    = false;       // Evitar ejecuciones paralelas
let graphicsLib  = null;        // Instancia de GraphicsLib
let editorFontSize = 14;
const editorFontTheme = new Compartment();
const editorColorTheme = new Compartment();
let isDarkTheme = true;
let fileTabs = [];
let activeTabId = null;
let untitledCounter = 1;
let renamingTabId = null;
let modalResolver = null;
let currentInterpreter = null;
let stopRequested = false;
const EXPORT_RUNTIME_MODULES = [
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

// ── Inicialización ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  createFileTab('main.c', '', true);
  initControls();
  loadSample('basicos/hola_mundo');
});

function initEditor() {
  const parent = document.getElementById('editor-container');

  editorView = new EditorView({ 
    state: createEditorState(''),
    parent,
    dispatch: (tr) => {
      editorView.update([tr]);
      syncActiveTabState();
      updateStatusBar(editorView);
    }
  });
}

function createEditorState(doc) {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
      ]),
      indentUnit.of('    '),
      cpp(),
      editorColorTheme.of(isDarkTheme ? oneDark : []),
      editorFontTheme.of(makeEditorFontTheme(editorFontSize)),
    ],
  });
}

function initControls() {
  document.getElementById('btn-run').addEventListener('click', runProgram);
  const stopBtn = document.getElementById('btn-stop');
  if (stopBtn) stopBtn.addEventListener('click', stopProgram);
  document.getElementById('menu-run').addEventListener('click', runProgram);
  document.getElementById('btn-compile').addEventListener('click', compileProgram);
  document.getElementById('menu-compile').addEventListener('click', compileProgram);
  
  // Limpiar consola — desde botón y menú
  const clearHandler = () => clearConsole();
  document.getElementById('btn-clear').addEventListener('click', clearHandler);
  if (document.getElementById('btn-clear-tool')) {
    document.getElementById('btn-clear-tool').addEventListener('click', clearHandler);
  }

  // Ejemplos — buscar todos los dropdown items con data-example
  document.querySelectorAll('[data-example]').forEach(item => {
    item.addEventListener('click', () => {
      loadSample(item.getAttribute('data-example'));
    });
  });

  document.getElementById('btn-new').addEventListener('click', newFile);
  document.getElementById('btn-open').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', loadFile);
  document.getElementById('btn-save').addEventListener('click', saveFile);
  document.getElementById('btn-save-as').addEventListener('click', saveFileAs);
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-font-dec').addEventListener('click', () => setEditorFontSize(editorFontSize - 1));
  document.getElementById('btn-font-inc').addEventListener('click', () => setEditorFontSize(editorFontSize + 1));

  applyAppTheme();
  setEditorFontSize(editorFontSize);

  initResizer();

  // Botón "Enviar entrada" — resuelve el Promise pendiente o encola
  const doSendInput = () => {
    const el  = document.getElementById('stdin-input');
    const val = el.value;
    el.value  = '';
    appendConsole(val + '\n', 'stdin');

    if (pendingInput) {
      // El intérprete está esperando este valor (await interp.stdin())
      const resolve = pendingInput;
      pendingInput  = null;
      resolve(val);
    } else {
      // Todavía no se llegó al scanf → encolar para cuando llegue
      inputQueue.push(val);
    }
  };

  document.getElementById('console-output').addEventListener('click', () => {
    if (activeStdinInput) activeStdinInput.focus();
  });

  const modalBackdrop = document.getElementById('app-modal');
  const modalOk = document.getElementById('app-modal-ok');
  const modalCancel = document.getElementById('app-modal-cancel');
  if (modalBackdrop && modalOk && modalCancel) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeConfirmModal(false);
      }
    });
    modalOk.addEventListener('click', () => closeConfirmModal(true));
    modalCancel.addEventListener('click', () => closeConfirmModal(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('show')) {
        e.preventDefault();
        closeConfirmModal(false);
      }
    });
  }
}

function getActiveTab() {
  return fileTabs.find(tab => tab.id === activeTabId) ?? null;
}

function syncActiveTabState() {
  const tab = getActiveTab();
  if (tab && editorView) {
    tab.state = editorView.state;
  }
}

function createFileTab(name, content = '', activate = true) {
  if (editorView) syncActiveTabState();

  const id = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tab = {
    id,
    name,
    state: createEditorState(content),
  };
  fileTabs.push(tab);

  if (activate) {
    switchToTab(id, false);
  }

  renderFileTabs();
  return tab;
}

function switchToTab(tabId, saveCurrent = true) {
  const nextTab = fileTabs.find(tab => tab.id === tabId);
  if (!nextTab || !editorView) return;

  if (saveCurrent) {
    syncActiveTabState();
  }

  activeTabId = tabId;
  editorView.setState(nextTab.state);
  applyAppTheme();
  setEditorFontSize(editorFontSize);
  renderFileTabs();
  updateStatusBar(editorView);
  editorView.focus();
}

async function closeTab(tabId) {
  if (isRunning) return;

  const index = fileTabs.findIndex(tab => tab.id === tabId);
  if (index === -1) return;

  const tab = fileTabs[index];
  const confirmed = await showConfirmModal({
    title: 'Cerrar pestaña',
    message: `¿Querés cerrar "${tab.name}"? Los cambios no guardados se perderán.`,
    confirmText: 'Cerrar',
    cancelText: 'Cancelar',
  });

  if (!confirmed) return;

  const wasActive = activeTabId === tabId;
  fileTabs.splice(index, 1);
  if (renamingTabId === tabId) renamingTabId = null;

  if (fileTabs.length === 0) {
    createFileTab(`sin_titulo_${untitledCounter++}.c`, '', true);
    return;
  }

  if (wasActive) {
    const nextTab = fileTabs[Math.max(0, index - 1)] ?? fileTabs[0];
    switchToTab(nextTab.id, false);
    return;
  }

  renderFileTabs();
}

function renderFileTabs() {
  const tabsEl = document.getElementById('file-tabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = '';

  for (const tab of fileTabs) {
    const tabEl = document.createElement('div');
    tabEl.className = `tab${tab.id === activeTabId ? ' active' : ''}`;
    tabEl.title = 'Doble click para renombrar';
    const isRenaming = renamingTabId === tab.id;
    tabEl.innerHTML = isRenaming
      ? `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#51a1ee" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      <input class="tab-rename-input" type="text" value="">
      <span class="tab-close">x</span>
    `
      : `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#51a1ee" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      <span class="tab-name"></span>
      <span class="tab-close">x</span>
    `;
    const nameEl = tabEl.querySelector('.tab-name');
    if (nameEl) nameEl.textContent = tab.name;
    tabEl.addEventListener('click', () => switchToTab(tab.id));
    tabEl.addEventListener('dblclick', () => renameTab(tab.id));
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      void closeTab(tab.id);
    });
    tabsEl.appendChild(tabEl);

    if (isRenaming) {
      const inputEl = tabEl.querySelector('.tab-rename-input');
      if (inputEl) {
        inputEl.value = tab.name;
        inputEl.addEventListener('click', (e) => e.stopPropagation());
        inputEl.addEventListener('dblclick', (e) => e.stopPropagation());
        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTabRename(tab.id, inputEl.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelTabRename();
          }
        });
        inputEl.addEventListener('blur', () => {
          if (renamingTabId === tab.id) {
            commitTabRename(tab.id, inputEl.value);
          }
        });
        requestAnimationFrame(() => {
          inputEl.focus();
          inputEl.select();
        });
      }
    }
  }
}

function renameTab(tabId) {
  const tab = fileTabs.find(item => item.id === tabId);
  if (!tab) return;

  renamingTabId = tab.id;
  renderFileTabs();
}

function commitTabRename(tabId, nextName) {
  const tab = fileTabs.find(item => item.id === tabId);
  if (!tab) {
    renamingTabId = null;
    renderFileTabs();
    if (editorView) editorView.focus();
    return;
  }

  const normalized = normalizeFileName(nextName);
  tab.name = normalized;
  renamingTabId = null;
  renderFileTabs();
  if (editorView) editorView.focus();
}

function cancelTabRename() {
  renamingTabId = null;
  renderFileTabs();
  if (editorView) editorView.focus();
}

function showConfirmModal({
  title = 'Confirmar',
  message = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  showCancel = true,
} = {}) {
  const backdrop = document.getElementById('app-modal');
  const titleEl = document.getElementById('app-modal-title');
  const messageEl = document.getElementById('app-modal-message');
  const okBtn = document.getElementById('app-modal-ok');
  const cancelBtn = document.getElementById('app-modal-cancel');

  if (!backdrop || !titleEl || !messageEl || !okBtn || !cancelBtn) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    modalResolver = resolve;
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    cancelBtn.classList.toggle('is-hidden', !showCancel);
    backdrop.classList.add('show');
    backdrop.setAttribute('aria-hidden', 'false');
    (showCancel ? cancelBtn : okBtn).focus();
  });
}

function closeConfirmModal(result) {
  const backdrop = document.getElementById('app-modal');
  if (backdrop) {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  if (modalResolver) {
    const resolve = modalResolver;
    modalResolver = null;
    resolve(result);
  }
}

function normalizeFileName(name) {
  const clean = name.trim();
  if (!clean) return `sin_titulo_${untitledCounter++}.c`;
  return /\.[A-Za-z0-9]+$/.test(clean) ? clean : `${clean}.c`;
}

/** Crea un nuevo archivo (resetea el editor) */
function newFile() {
  if (isRunning) return;
  createFileTab(`sin_titulo_${untitledCounter++}.c`, '', true);
  return;
  loadSample('basicos/hola_mundo'); // O una plantilla vacía
}

/** Guarda el código actual en un archivo local */
function saveFile() {
  const tab = getActiveTab();
  if (!tab || !editorView) return;

  syncActiveTabState();
  downloadTextFile(tab.name, editorView.state.doc.toString(), 'text/plain');
  return;

  const code = editorView.state.doc.toString();
  downloadTextFile('programa.c', code, 'text/plain');
}

function saveFileAs() {
  const tab = getActiveTab();
  if (!tab || !editorView) return;

  const nextName = prompt('Guardar como:', tab.name);
  if (!nextName) return;

  tab.name = normalizeFileName(nextName);
  renderFileTabs();
  syncActiveTabState();
  downloadTextFile(tab.name, editorView.state.doc.toString(), 'text/plain');
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Carga un archivo local al editor */
function loadFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    createFileTab(normalizeFileName(file.name), content, true);
    e.target.value = '';
    return;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
    });
    e.target.value = ''; // Reset para permitir cargar el mismo archivo
  };
  reader.readAsText(file);
}

function loadSample(name) {
  if (!editorView) return;
  
  fetch(`ejemplos/${name}.c`)
    .then(res => {
      if (!res.ok) throw new Error(`No se pudo cargar el ejemplo: ${name}`);
      return res.text();
    })
    .then(content => {
      const tab = getActiveTab();
      const sampleName = normalizeFileName(name.split('/').pop());
      if (tab) {
        tab.name = sampleName;
        tab.state = createEditorState(content);
        editorView.setState(tab.state);
        activeTabId = tab.id;
        renderFileTabs();
        updateStatusBar(editorView);
      } else {
        createFileTab(sampleName, content, true);
      }
      return;
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: content },
      });
    })
    .catch(err => {
      console.error(err);
      appendConsole(`Error: ${err.message}\n`, 'error');
    });
}

function setEditorFontSize(size) {
  editorFontSize = Math.max(10, Math.min(28, size));
  if (!editorView) return;

  editorView.dispatch({
    effects: editorFontTheme.reconfigure(makeEditorFontTheme(editorFontSize)),
  });

  requestAnimationFrame(() => {
    editorView.requestMeasure();
  });
}

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  applyAppTheme();
}

function applyAppTheme() {
  document.body.dataset.theme = isDarkTheme ? 'dark' : 'light';
  document.getElementById('btn-theme-toggle').textContent = isDarkTheme ? 'T' : 'L';

  if (!editorView) return;

  editorView.dispatch({
    effects: editorColorTheme.reconfigure(isDarkTheme ? oneDark : []),
  });

  requestAnimationFrame(() => {
    editorView.requestMeasure();
  });
}

function makeEditorFontTheme(size) {
  return EditorView.theme({
    '&': { height: '100%' },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono','Cascadia Code','Fira Code',monospace",
      fontSize: `${size}px`
    },
    '.cm-gutters': {
      fontFamily: "'JetBrains Mono','Cascadia Code','Fira Code',monospace",
      fontSize: `${size}px`
    },
    '.cm-content': { padding: '12px 0' },
  });
}

// ── Pipeline de ejecución ─────────────────────────────────────────────

async function compileProgram() {
  if (isRunning) return;

  const code = editorView.state.doc.toString();
  clearConsole();

  try {
    const runtimeModules = await collectExportRuntimeModules();
    const html = new HtmlPackager().buildStandalone(code, runtimeModules);
    const tab = getActiveTab();
    const exportName = (tab?.name ?? 'programa.c').replace(/\.[^.]+$/, '') + '.html';

    downloadTextFile(exportName, html, 'text/html');
    appendConsole(`[Compilacion completada: ${exportName}]\n`, 'info');
    return;
    appendConsole('[Compilación completada: programa_compilado.html]\n', 'info');
  } catch (err) {
    const msg = err.format ? err.format() : err.message;
    appendConsole(msg + '\n', 'error');
  }
}

async function collectExportRuntimeModules() {
  const entries = await Promise.all(
    EXPORT_RUNTIME_MODULES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${path}`);
      }
      return [path, await response.text()];
    })
  );

  return Object.fromEntries(entries);
}

async function runProgram() {
  if (isRunning) return;
  const code = editorView.state.doc.toString();
  clearConsole();
  inputQueue   = [];
  pendingInput = null;
  activeStdinInput = null;
  outputBuffer = '';
  isRunning    = true;
  stopRequested = false;

  const btnRun     = document.getElementById('btn-run');
  const btnStop    = document.getElementById('btn-stop');
  btnRun.disabled  = true;
  btnRun.classList.add('running');
  if (btnStop) btnStop.disabled = false;

  const startTime = performance.now();

  const stdout = makeSyncStdout();
  // stdin async: retorna la siguiente línea del queue o espera la entrada del usuario
  const stdin = makeAsyncStdin();

  try {
    const pre  = new Preprocessor();
    const { code: src, includedLibs } = pre.process(code);

    const tokens = new Lexer(src).tokenize();
    const ast    = new Parser(tokens).parse();

    // Inicializar GraphicsLib si se requiere
    const hasGraphics = includedLibs.has('tortuga') || includedLibs.has('processing');
    const ws = document.querySelector('.workspace');
    const outCol = document.getElementById('output-column');
    const gPanel = document.getElementById('graphics-panel');
    
    if (hasGraphics) {
      if (!graphicsLib) {
        const canvas = document.getElementById('main-canvas');
        graphicsLib = new GraphicsLib(canvas);
      }
      ws.classList.add('has-graphics');
      outCol.classList.add('has-graphics');
      gPanel.classList.add('active');
    } else {
      ws.classList.remove('has-graphics');
      outCol.classList.remove('has-graphics');
      gPanel.classList.remove('active');
    }

    if (graphicsLib) {
      graphicsLib._clearScreen(0); 
      // Ajustar tamaño del canvas al contenedor completo
      const container = document.getElementById('canvas-container');
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        // Usar una resolución interna mayor para evitar pixelación
        graphicsLib.setSize(1000, 1000); 
      }
    }

    const stdlib = new StdLib({ stdout, stdin, graphics: graphicsLib, includedLibs });
    const interp = new Interpreter({ stdout, stdin });
    interp.stdlib = stdlib;
    currentInterpreter = interp;

    // interp.run() es async — cada await en el intérprete cede el hilo
    const exitCode = await interp.run(ast, stdlib);

    flushStdout();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
    appendConsole(`\n[Proceso terminado con código ${exitCode} en ${elapsed}s]\n`, 'info');

  } catch (err) {
    flushStdout();
    const msg = err.format ? err.format() : err.message;
    if (msg && msg.includes('Ejecución detenida')) {
      appendConsole('\n' + msg + '\n', 'info');
    } else {
      appendConsole('\n' + msg + '\n', 'error');
    }
  } finally {
    currentInterpreter  = null;
    isRunning           = false;
    btnRun.disabled     = false;
    btnRun.classList.remove('running');
    if (btnStop) btnStop.disabled = true;
    pendingInput        = null; 
    if (stopRequested) {
      stopRequested = false;
      await showConfirmModal({
        title: 'Ejecución detenida',
        message: 'El programa fue detenido por el usuario.',
        confirmText: 'Aceptar',
        showCancel: false,
      });
    }
  }
}

function stopProgram() {
  stopRequested = true;
  if (currentInterpreter) {
    currentInterpreter.requestStop();
  }
  if (pendingInput) {
    const resolve = pendingInput;
    pendingInput = null;
    resolve('');
  }
}

/** Actualiza la barra de estado con la posición del cursor */
function updateStatusBar(view) {
  const state = view.state;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  const col = selection.head - line.from + 1;
  document.getElementById('cursor-pos').textContent = `Lín ${line.number}, Col ${col}`;
}

/** Inicializa la lógica del resizer (divisor arrastrable) */
function initResizer() {
  const resizer  = document.getElementById('resizer');
  const workspace = document.getElementById('workspace');
  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.cursor = 'col-resize';
    resizer.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const containerWidth = workspace.clientWidth;
    const mouseX = e.clientX;
    const leftWidth = (mouseX / containerWidth) * 100;
    const rightWidth = 100 - leftWidth;

    // Límites para que no desaparezcan los paneles
    if (leftWidth > 15 && leftWidth < 85) {
      workspace.style.gridTemplateColumns = `${leftWidth}% 4px ${rightWidth}%`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';
    resizer.classList.remove('dragging');
  });
}

/** stdout sincrónico que flushea por líneas para renderizado en tiempo real. */
function makeSyncStdout() {
  return (text) => {
    outputBuffer += text;
    const lines = outputBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      appendConsole(lines[i] + '\n', 'stdout');
    }
    outputBuffer = lines[lines.length - 1];
  };
}

/** Hace flush del buffer de stdout restante. */
function flushStdout() {
  if (outputBuffer) {
    appendConsole(outputBuffer, 'stdout');
    outputBuffer = '';
  }
}


/** stdin asíncrono: resuelve desde la cola o espera que el usuario escriba. */
function makeAsyncStdin() {
  return async (hint) => {
    if (inputQueue.length > 0) return inputQueue.shift();
    // Flush del buffer de stdout antes de pausar (para que el printf del prompt aparezca)
    flushStdout();
    appendConsole('[Esperando entrada…]\n', 'info');
    appendInlineConsoleInput().focus();
    return new Promise((resolve) => {
      pendingInput = resolve;
    });
  };
}

// ── Helpers de consola ────────────────────────────────────────────────

function appendConsole(text, type = 'stdout') {
  if (type === 'info' && text.startsWith('[Esperando entrada')) return;

  const out  = document.getElementById('console-output');
  const span = document.createElement('span');
  span.className   = `console-${type}`;
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function appendInlineConsoleInput() {
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
    input.style.width = `${Math.max(input.value.length + 1, 1)}ch`;
    out.scrollTop = out.scrollHeight;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const val = input.value;
    const stdinSpan = document.createElement('span');
    stdinSpan.className = 'console-stdin';
    stdinSpan.textContent = `${val}\n`;
    wrapper.replaceWith(stdinSpan);
    activeStdinInput = null;
    out.scrollTop = out.scrollHeight;

    if (pendingInput) {
      const resolve = pendingInput;
      pendingInput = null;
      resolve(val);
    } else {
      inputQueue.push(val);
    }
  });

  wrapper.appendChild(input);
  out.appendChild(wrapper);
  activeStdinInput = input;
  out.scrollTop = out.scrollHeight;

  return input;
}

function clearConsole() {
  activeStdinInput = null;
  document.getElementById('console-output').innerHTML = '';
  if (graphicsLib) {
    graphicsLib._clearScreen(0);
  }
}

