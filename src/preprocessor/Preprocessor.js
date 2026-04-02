/**
 * Preprocessor.js — Preprocesador básico de C99
 *
 * Realiza las siguientes transformaciones ANTES de pasar el código al Lexer:
 *  1. Elimina comentarios 
 *  2. Concatena líneas que terminan con \
 *  3. Procesa #define (simples y con argumentos básicos)
 *  4. Procesa #ifdef / #ifndef / #else / #endif
 *  5. Reconoce #include de headers estándar (activa flags internos)
 *
 * Retorna: { code: string, includedLibs: Set<string> }
 */

import { CPreprocessError } from '../errors/CError.js';

export class Preprocessor {
  constructor() {
    this.defines     = new Map(); // nombre → definición
    this.includedLibs = new Set(); // 'stdio', 'stdlib', 'string', 'math'...
  }

  process(source) {
    this.defines     = new Map();
    this.includedLibs = new Set();

    let lines = source.split('\n');

    // Paso 1: concatenar líneas con backslash al final
    lines = this._joinBackslashLines(lines);

    // Paso 2: procesar directivas y eliminar comentarios
    const outputLines = [];
    const ifStack = []; // pila de { active: bool, seen: bool }

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      let line = lines[i];

      // Verificar si estamos dentro de un bloque #if desactivado
      const active = ifStack.length === 0 || ifStack[ifStack.length - 1].active;

      const trimmed = line.trimStart();

      if (trimmed.startsWith('#')) {
        const processed = this._processDirective(trimmed, lineNo, ifStack, active);
        // Las directivas se reemplazan por líneas vacías para preservar la numeración
        outputLines.push('');
        continue;
      }

      if (!active) {
        outputLines.push('');
        continue;
      }

      // Expandir macros en la línea
      line = this._expandMacros(line);

      outputLines.push(line);
    }

    // Paso 3: eliminar comentarios del código ya preprocesado
    let code = outputLines.join('\n');
    code = this._stripComments(code);

    return { code, includedLibs: this.includedLibs };
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  _joinBackslashLines(lines) {
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      while (line.endsWith('\\') && i + 1 < lines.length) {
        line = line.slice(0, -1) + lines[++i];
      }
      result.push(line);
    }
    return result;
  }

  _processDirective(trimmed, lineNo, ifStack, active) {
    const match = trimmed.match(/^#\s*(\w+)\s*(.*)/s);
    if (!match) return;

    const directive = match[1];
    const rest      = match[2].trim();

    switch (directive) {
      case 'include': {
        if (!active) break;
        const m = rest.match(/^[<"]([^>"]+)[>"]/);
        if (m) {
          const headerFull = m[1];
          const header = headerFull.replace(/\.h$/, '');
          this.includedLibs.add(header);

          // Inyectar macros de tortuga.h y processing.h
          if (header === 'tortuga' || header === 'processing') {
            this._injectGraphicsMacros(header);
          }
        }
        break;
      }

      case 'define': {
        if (!active) break;
        // Macro con argumentos: #define NOMBRE(a,b) expr
        const macroFn = rest.match(/^(\w+)\(([^)]*)\)\s+(.*)/s);
        if (macroFn) {
          const name   = macroFn[1];
          const params = macroFn[2].split(',').map(p => p.trim()).filter(Boolean);
          const body   = macroFn[3];
          this.defines.set(name, { params, body });
        } else {
          // Macro simple: #define NOMBRE valor
          const simple = rest.match(/^(\w+)(?:\s+(.*))?/);
          if (simple) {
            this.defines.set(simple[1], { params: null, body: simple[2] ?? '' });
          }
        }
        break;
      }

      case 'undef': {
        if (!active) break;
        this.defines.delete(rest);
        break;
      }

      case 'ifdef': {
        const defined = this.defines.has(rest);
        ifStack.push({ active: active && defined, seen: defined });
        break;
      }

      case 'ifndef': {
        const notDefined = !this.defines.has(rest);
        ifStack.push({ active: active && notDefined, seen: notDefined });
        break;
      }

      case 'if': {
        // Soporte básico: solo #if 0 y #if 1
        const val = rest.trim();
        const cond = val !== '0' && val !== '';
        ifStack.push({ active: active && cond, seen: cond });
        break;
      }

      case 'else': {
        if (ifStack.length === 0) throw new CPreprocessError('#else sin #if', lineNo);
        const top = ifStack[ifStack.length - 1];
        top.active = active && !top.seen;
        break;
      }

      case 'elif': {
        if (ifStack.length === 0) throw new CPreprocessError('#elif sin #if', lineNo);
        const top = ifStack[ifStack.length - 1];
        if (!top.seen) {
          const val = rest.trim();
          const cond = val !== '0' && val !== '';
          top.active = active && cond;
          if (top.active) top.seen = true;
        } else {
          top.active = false;
        }
        break;
      }

      case 'endif': {
        if (ifStack.length === 0) throw new CPreprocessError('#endif sin #if', lineNo);
        ifStack.pop();
        break;
      }

      case 'error': {
        if (!active) break;
        throw new CPreprocessError(`#error ${rest}`, lineNo);
      }

      case 'pragma':
      case 'line':
        // Ignorados silenciosamente
        break;

      default:
        if (active) {
          // Directiva desconocida: advertencia silenciosa
        }
    }
  }

  _expandMacros(line) {
    // Expansión iterativa (máx 20 pasadas para evitar recursión infinita)
    for (let pass = 0; pass < 20; pass++) {
      let changed = false;
      for (const [name, def] of this.defines) {
        if (def.params !== null) {
          // Macro con argumentos
          let offset = 0;
          while (true) {
            const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
            re.lastIndex = offset;
            const match = re.exec(line);
            if (!match) break;

            changed = true;
            const matchStart = match.index;
            const parenStart = matchStart + match[0].length - 1;

            // Extraer argumentos y posición final
            const result = this._extractMacroArgs(line, parenStart);
            if (!result) { offset = matchStart + 1; continue; }

            const { args, endIdx } = result;
            let expanded = def.body;
            def.params.forEach((param, i) => {
              expanded = expanded.replace(new RegExp(`\\b${param}\\b`, 'g'), args[i] ?? '');
            });

            // Reemplazar la llamada completa [matchStart, endIdx]
            line = line.slice(0, matchStart) + expanded + line.slice(endIdx + 1);
            offset = matchStart + expanded.length;
          }
        } else {
          // Macro simple: reemplazar palabra completa
          const re = new RegExp(`\\b${name}\\b`, 'g');
          const next = line.replace(re, () => { changed = true; return def.body; });
          line = next;
        }
      }
      if (!changed) break;
    }
    return line;
  }

  _extractMacroArgs(line, parenStart) {
    // Extrae argumentos de una llamada a macro en 'line' starting at position parenStart (el '(')
    let depth = 0;
    let i = parenStart;
    const args = [];
    let current = '';
    while (i < line.length) {
      const c = line[i];
      if (c === '(') { depth++; if (depth > 1) current += c; }
      else if (c === ')') {
        depth--;
        if (depth === 0) { 
          args.push(current.trim()); 
          return { args, endIdx: i }; 
        }
        else current += c;
      } else if (c === ',' && depth === 1) {
        args.push(current.trim());
        current = '';
      } else {
        current += c;
      }
      i++;
    }
    return null;
  }

  _stripComments(code) {
    let result = '';
    let i = 0;
    let inString = false;
    let inChar   = false;

    while (i < code.length) {
      const c  = code[i];
      const c2 = code[i + 1];

      if (inString) {
        result += c;
        if (c === '\\') { result += code[++i] ?? ''; }
        else if (c === '"') inString = false;
      } else if (inChar) {
        result += c;
        if (c === '\\') { result += code[++i] ?? ''; }
        else if (c === "'") inChar = false;
      } else if (c === '"') {
        inString = true;
        result += c;
      } else if (c === "'") {
        inChar = true;
        result += c;
      } else if (c === '/' && c2 === '/') {
        // Comentario de línea: avanzar hasta \n
        while (i < code.length && code[i] !== '\n') i++;
      } else if (c === '/' && c2 === '*') {
        // Comentario de bloque
        i += 2;
        while (i < code.length) {
          if (code[i] === '*' && code[i + 1] === '/') { i += 2; break; }
          if (code[i] === '\n') result += '\n'; // preservar saltos
          i++;
        }
        continue;
      } else {
        result += c;
      }
      i++;
    }
    return result;
  }

  _injectGraphicsMacros(lib) {
    // 1. Colores (simples literales)
    const colors = [
      ['ROJO','RGB(255,0,0)'],['RED','RGB(255,0,0)'],
      ['VERDE','RGB(0,255,0)'],['GREEN','RGB(0,255,0)'],
      ['AZUL','RGB(0,0,255)'],['BLUE','RGB(0,0,255)'],
      ['NEGRO','RGB(0,0,0)'],['BLACK','RGB(0,0,0)'],
      ['BLANCO','RGB(255,255,255)'],['WHITE','RGB(255,255,255)'],
    ];
    for (const [name, body] of colors) {
      if (!this.defines.has(name)) this.defines.set(name, { params: null, body });
    }

    // 2. Macros comunes con parámetros
    const commonWithParams = [
      ['RGB',['r','g','b'],'RGB(r,g,b)'], // redundante pero asegura expansión
      ['rgb',['r','g','b'],'RGB(r,g,b)'],['rva',['r','g','b'],'RGB(r,g,b)'],
      ['azar',['x'],'random(x)'],
      ['drawtext',['text','x','y','color'],'drawText(text,x,y,color)'],
      ['dibujarTexto',['text','x','y','color'],'drawText(text,x,y,color)'],
      ['dt',['text','x','y','color'],'drawText(text,x,y,color)'],
      ['clearscreen',['x'],'clearScreen(x)'],['cs',['x'],'clearScreen(x)'],
      ['borrarPantalla',['x'],'clearScreen(x)'],['borrarpantalla',['x'],'clearScreen(x)'],
      ['backGround',['x'],'clearScreen(x)'],['background',['x'],'clearScreen(x)'],
      ['colorFondo',['x'],'clearScreen(x)'],['colorfondo',['x'],'clearScreen(x)'],
      ['cf',['x'],'clearScreen(x)'],
      ['sleep',['x'],'Sleep(x)'],['delay',['x'],'Sleep(x)'],['demora',['x'],'Sleep(x)'],
      ['repeat',['x'],'for(int iii=1; iii<=x; iii++)'],
      ['repetir',['x'],'for(int iii=1; iii<=x; iii++)'],
    ];
    const commonNoParams = [
      ['randomcolor','randomColor()'],['colorazar','randomColor()'],['colorAzar','randomColor()'],
      ['esperar','wait()'],['consoletofront','consoleToFront()'],
      ['consolaAlFrente','consoleToFront()'],['consolaalfrente','consoleToFront()'],
    ];

    // 3. Macros específicas de Tortuga
    const tortugaParams = [
      ['avanza',['x'],'forward(x)'],['av',['x'],'forward(x)'],['fw',['x'],'forward(x)'],
      ['retrocede',['x'],'backward(x)'],['re',['x'],'backward(x)'],['bw',['x'],'backward(x)'],
      ['righturn',['x'],'rightTurn(x)'],['girarDerecha',['x'],'rightTurn(x)'],
      ['girarderecha',['x'],'rightTurn(x)'],['gd',['x'],'rightTurn(x)'],['rt',['x'],'rightTurn(x)'],
      ['leftturn',['x'],'leftTurn(x)'],['girarIzquierda',['x'],'leftTurn(x)'],
      ['girarizquierda',['x'],'leftTurn(x)'],['gi',['x'],'leftTurn(x)'],['lt',['x'],'leftTurn(x)'],
      ['pensize',['x'],'penSize(x)'],['ps',['x'],'penSize(x)'],
      ['grosorLapiz',['x'],'penSize(x)'],['grosorlapiz',['x'],'penSize(x)'],['gl',['x'],'penSize(x)'],
      ['pencolour',['r','g','b'],'penColour(r,g,b)'],['pc',['r','g','b'],'penColour(r,g,b)'],
      ['colorLapiz',['r','g','b'],'penColour(r,g,b)'],['colorlapiz',['r','g','b'],'penColour(r,g,b)'],
      ['cl',['r','g','b'],'penColour(r,g,b)'],
      ['ventana',['width','height'],'size(width,height)'],
      ['escala',['left','top','right','bottom'],'view(left,top,right,bottom)'],
      ['limites',['left','top','right','bottom'],'view(left,top,right,bottom)'],
      ['eh',['left','right'],'horizontalScale(left,right)'],
      ['hs',['left','right'],'horizontalScale(left,right)'],
      ['ev',['top','bottom'],'verticalScale(top,bottom)'],
      ['vs',['top','bottom'],'verticalScale(top,bottom)'],
    ];
    const tortugaNoParams = [
      ['penup','penUp()'],['pu','penUp()'],['subeLapiz','penUp()'],['subelapiz','penUp()'],['sl','penUp()'],
      ['pendown','penDown()'],['pd','penDown()'],['bajaLapiz','penDown()'],['bajalapiz','penDown()'],['bl','penDown()'],
      ['hideturtle','hideTurtle()'],['ht','hideTurtle()'],
      ['ocultaTortuga','hideTurtle()'],['ocultatortuga','hideTurtle()'],['ot','hideTurtle()'],
      ['showturtle','showTurtle()'],['st','showTurtle()'],
      ['muestraTortuga','showTurtle()'],['muestratortuga','showTurtle()'],['mt','showTurtle()'],
    ];

    // 4. Macros específicas de Processing
    const processingParams = [
      ['ventana',     ['x','y','w','h'], 'size(w,h)'],
      ['coordenadas', ['l', 'r', 't', 'b'], 'setViewportSize(l,r,t,b)'],
      ['setviewportsize',['l', 'r', 't', 'b'], 'setViewportSize(l,r,t,b)'],
    ];

    // Combinar
    let finalParams   = [...commonWithParams];
    let finalNoParams = [...commonNoParams];

    if (lib === 'tortuga') {
      finalParams   = [...finalParams, ...tortugaParams];
      finalNoParams = [...finalNoParams, ...tortugaNoParams];
    } else if (lib === 'processing') {
      finalParams   = [...finalParams, ...processingParams];
    }

    for (const [name, params, body] of finalParams) {
      if (!this.defines.has(name)) this.defines.set(name, { params, body });
    }
    for (const [name, body] of finalNoParams) {
      if (!this.defines.has(name)) this.defines.set(name, { params: [], body });
    }
  }
}
