/**
 * StdLib.js — Librería Estándar de C99
 *
 * Implementa las funciones del runtime de C en JavaScript puro.
 * Cada función recibe (args, interpreter) donde:
 *   args:         array de valores JS evaluados por el intérprete
 *   interpreter:  la instancia del Interpreter (para acceder a memory, stdout, etc.)
 *
 * Las funciones se agrupan por header de C:
 *   <stdio.h>  → printf, scanf, putchar, getchar, puts, gets, sprintf, sscanf
 *   <stdlib.h> → malloc, calloc, realloc, free, exit, abs, atoi, atof, rand, srand
 *   <string.h> → strlen, strcpy, strncpy, strcat, strncat, strcmp, strncmp,
 *                 strchr, strrchr, strstr, memset, memcpy, memmove
 *   <math.h>   → sqrt, pow, fabs, ceil, floor, round, sin, cos, tan, log, exp
 *   <ctype.h>  → isalpha, isdigit, isspace, isupper, islower, toupper, tolower
 */

import { ExitSignal } from '../interpreter/Interpreter.js';
import { CRuntimeError } from '../errors/CError.js';

export class StdLib {
  /**
   * @param {object} opts
   *   stdout: (str) => void
   *   stdin:  (prompt) => string | null
   *   graphics: GraphicsLib instance
   *   includedLibs: Set<string>
   */
  constructor({ stdout, stdin, graphics, includedLibs }) {
    this.stdout      = stdout;
    this.stdin       = stdin;
    this.graphics    = graphics;
    this.includedLibs = includedLibs ?? new Set();
    this._randSeed    = 1;
    this.functions   = this._buildFunctions();
  }

  _buildFunctions() {
    const self = this;
    const funcs = {

      // ── <stdio.h> ────────────────────────────────────────────────────

      printf(args, interp) {
        const fmtAddr = args[0];
        const fmt = interp.memory.readString(fmtAddr);
        const result = self._sprintfImpl(fmt, args.slice(1), interp);
        self.stdout(result);
        return result.length;
      },

      fprintf(args, interp) {
        // args[0] = FILE* (ignoramos stream), args[1] = fmt, args[2..] = valores
        const fmtAddr = args[1];
        const fmt = interp.memory.readString(fmtAddr);
        const result = self._sprintfImpl(fmt, args.slice(2), interp);
        self.stdout(result); // simplificado: siempre a stdout
        return result.length;
      },

      sprintf(args, interp) {
        // args[0] = char* buffer, args[1] = fmt, args[2..] = valores
        const bufAddr = args[0];
        const fmtAddr = args[1];
        const fmt = interp.memory.readString(fmtAddr);
        const result = self._sprintfImpl(fmt, args.slice(2), interp);
        interp.memory.writeString(bufAddr, result);
        interp.memory.write(bufAddr + result.length, 'unsigned char', 0); // \0
        return result.length;
      },

      snprintf(args, interp) {
        const bufAddr = args[0];
        const n       = args[1];
        const fmtAddr = args[2];
        const fmt = interp.memory.readString(fmtAddr);
        const result = self._sprintfImpl(fmt, args.slice(3), interp);
        const truncated = result.slice(0, n - 1);
        interp.memory.writeString(bufAddr, truncated);
        interp.memory.write(bufAddr + truncated.length, 'unsigned char', 0);
        return result.length;
      },

      async scanf(args, interp) {
        const fmtAddr = args[0];
        const fmt = interp.memory.readString(fmtAddr);
        const input = interp.stdin ? await interp.stdin('scanf') : '';
        return self._sscanfImpl(fmt, input ?? '', args.slice(1), interp);
      },

      sscanf(args, interp) {
        const strAddr = args[0];
        const fmtAddr = args[1];
        const str = interp.memory.readString(strAddr);
        const fmt = interp.memory.readString(fmtAddr);
        return self._sscanfImpl(fmt, str, args.slice(2), interp);
      },

      putchar(args, interp) {
        const c = String.fromCharCode(args[0] & 0xFF);
        self.stdout(c);
        return args[0] & 0xFF;
      },

      async getchar(args, interp) {
        const input = interp.stdin ? await interp.stdin('getchar') : null;
        if (!input) return -1;
        return input.charCodeAt(0) & 0xFF;
      },

      puts(args, interp) {
        const str = interp.memory.readString(args[0]);
        self.stdout(str + '\n');
        return str.length + 1;
      },

      async gets(args, interp) {
        const input = interp.stdin ? await interp.stdin('gets') : null;
        if (!input) return interp.memory.NULL;
        interp.memory.writeString(args[0], input);
        interp.memory.write(args[0] + input.length, 'unsigned char', 0);
        return args[0];
      },

      async fgets(args, interp) {
        const bufAddr = args[0];
        const n       = args[1];
        const input = interp.stdin ? await interp.stdin('fgets') : null;
        if (!input) return interp.memory.NULL;
        const line = input.slice(0, n - 1);
        interp.memory.writeString(bufAddr, line);
        interp.memory.write(bufAddr + line.length, 'unsigned char', 0);
        return bufAddr;
      },

      // ── <stdlib.h> ───────────────────────────────────────────────────

      malloc(args, interp) {
        return interp.memory.malloc(args[0]);
      },

      calloc(args, interp) {
        return interp.memory.calloc(args[0], args[1]);
      },

      realloc(args, interp) {
        return interp.memory.realloc(args[0], args[1]);
      },

      free(args, interp) {
        interp.memory.free(args[0]);
        return 0;
      },

      exit(args) {
        throw new ExitSignal(args[0] ?? 0);
      },

      abort(args) {
        throw new CRuntimeError('abort() llamado');
      },

      abs(args) {
        return Math.abs(args[0] | 0);
      },

      labs(args) {
        return Math.abs(args[0]);
      },

      fabs(args) {
        return Math.abs(args[0]);
      },

      atoi(args, interp) {
        const str = interp.memory.readString(args[0]);
        return parseInt(str, 10) || 0;
      },

      atof(args, interp) {
        const str = interp.memory.readString(args[0]);
        return parseFloat(str) || 0.0;
      },

      atol(args, interp) {
        const str = interp.memory.readString(args[0]);
        return parseInt(str, 10) || 0;
      },

      rand(args) {
        // LCG simple (mismo que muchas implementaciones de C)
        self._randSeed = (self._randSeed * 1103515245 + 12345) & 0x7fffffff;
        return self._randSeed;
      },

      srand(args) {
        self._randSeed = args[0] >>> 0;
        return 0;
      },

      // ── <string.h> ───────────────────────────────────────────────────

      strlen(args, interp) {
        const str = interp.memory.readString(args[0]);
        return str.length;
      },

      strcpy(args, interp) {
        const str = interp.memory.readString(args[1]);
        interp.memory.writeString(args[0], str);
        interp.memory.write(args[0] + str.length, 'unsigned char', 0);
        return args[0];
      },

      strncpy(args, interp) {
        const str = interp.memory.readString(args[1]).slice(0, args[2]);
        interp.memory.writeString(args[0], str);
        // Rellenar con \0 hasta n bytes
        const bytes = new TextEncoder().encode(str);
        for (let i = bytes.length; i < args[2]; i++) {
          interp.memory.write(args[0] + i, 'unsigned char', 0);
        }
        return args[0];
      },

      strcat(args, interp) {
        const dst = interp.memory.readString(args[0]);
        const src = interp.memory.readString(args[1]);
        const combined = dst + src;
        interp.memory.writeString(args[0], combined);
        interp.memory.write(args[0] + combined.length, 'unsigned char', 0);
        return args[0];
      },

      strncat(args, interp) {
        const dst = interp.memory.readString(args[0]);
        const src = interp.memory.readString(args[1]).slice(0, args[2]);
        const combined = dst + src;
        interp.memory.writeString(args[0], combined);
        interp.memory.write(args[0] + combined.length, 'unsigned char', 0);
        return args[0];
      },

      strcmp(args, interp) {
        const a = interp.memory.readString(args[0]);
        const b = interp.memory.readString(args[1]);
        if (a < b) return -1;
        if (a > b) return  1;
        return 0;
      },

      strncmp(args, interp) {
        const a = interp.memory.readString(args[0]).slice(0, args[2]);
        const b = interp.memory.readString(args[1]).slice(0, args[2]);
        if (a < b) return -1;
        if (a > b) return  1;
        return 0;
      },

      strchr(args, interp) {
        const str  = interp.memory.readString(args[0]);
        const ch   = String.fromCharCode(args[1] & 0xFF);
        const idx  = str.indexOf(ch);
        if (idx === -1) return interp.memory.NULL;
        return args[0] + idx;
      },

      strrchr(args, interp) {
        const str = interp.memory.readString(args[0]);
        const ch  = String.fromCharCode(args[1] & 0xFF);
        const idx = str.lastIndexOf(ch);
        if (idx === -1) return interp.memory.NULL;
        return args[0] + idx;
      },

      strstr(args, interp) {
        const haystack = interp.memory.readString(args[0]);
        const needle   = interp.memory.readString(args[1]);
        if (!needle) return args[0];
        const idx = haystack.indexOf(needle);
        if (idx === -1) return interp.memory.NULL;
        return args[0] + idx;
      },

      memset(args, interp) {
        interp.memory.memset(args[0], args[1], args[2]);
        return args[0];
      },

      memcpy(args, interp) {
        interp.memory.memcpy(args[0], args[1], args[2]);
        return args[0];
      },

      memmove(args, interp) {
        interp.memory.memmove(args[0], args[1], args[2]);
        return args[0];
      },

      memcmp(args, interp) {
        const a = new Uint8Array(interp.memory.buffer, args[0], args[2]);
        const b = new Uint8Array(interp.memory.buffer, args[1], args[2]);
        for (let i = 0; i < args[2]; i++) {
          if (a[i] !== b[i]) return a[i] - b[i];
        }
        return 0;
      },

      // ── <math.h> ─────────────────────────────────────────────────────

      sqrt(args)  { return Math.sqrt(args[0]); },
      cbrt(args)  { return Math.cbrt(args[0]); },
      pow(args)   { return Math.pow(args[0], args[1]); },
      fabs(args)  { return Math.abs(args[0]); },
      ceil(args)  { return Math.ceil(args[0]); },
      floor(args) { return Math.floor(args[0]); },
      round(args) { return Math.round(args[0]); },
      fmod(args)  { return args[0] % args[1]; },
      sin(args)   { return Math.sin(args[0]); },
      cos(args)   { return Math.cos(args[0]); },
      tan(args)   { return Math.tan(args[0]); },
      asin(args)  { return Math.asin(args[0]); },
      acos(args)  { return Math.acos(args[0]); },
      atan(args)  { return Math.atan(args[0]); },
      atan2(args) { return Math.atan2(args[0], args[1]); },
      log(args)   { return Math.log(args[0]); },
      log2(args)  { return Math.log2(args[0]); },
      log10(args) { return Math.log10(args[0]); },
      exp(args)   { return Math.exp(args[0]); },

      // ── <ctype.h> ────────────────────────────────────────────────────

      isalpha(args)  { return /[a-zA-Z]/.test(String.fromCharCode(args[0])) ? 1 : 0; },
      isdigit(args)  { return args[0] >= 48 && args[0] <= 57 ? 1 : 0; },
      isalnum(args)  { return /[a-zA-Z0-9]/.test(String.fromCharCode(args[0])) ? 1 : 0; },
      isspace(args)  { return /\s/.test(String.fromCharCode(args[0])) ? 1 : 0; },
      isupper(args)  { return args[0] >= 65 && args[0] <= 90 ? 1 : 0; },
      islower(args)  { return args[0] >= 97 && args[0] <= 122 ? 1 : 0; },
      isprint(args)  { return args[0] >= 32 && args[0] < 127 ? 1 : 0; },
      ispunct(args)  { return /[^\w\s]/.test(String.fromCharCode(args[0])) ? 1 : 0; },
      toupper(args)  { return args[0] >= 97 && args[0] <= 122 ? args[0] - 32 : args[0]; },
      tolower(args)  { return args[0] >= 65 && args[0] <= 90 ? args[0] + 32 : args[0]; },

      // ── Funciones de I/O adicionales (alias) ─────────────────────────

      putc(args, interp)  { return interp.stdlib.functions.putchar(args, interp); },
      fputc(args, interp) { return interp.stdlib.functions.putchar([args[0]], interp); },
      async getc(args, interp)  { return interp.stdlib.functions.getchar([], interp); },
      async fgetc(args, interp) { return interp.stdlib.functions.getchar([], interp); },
    };

    // Integrar funciones gráficas si se incluyeron los headers
    const headerByFunction = {
      printf: 'stdio', fprintf: 'stdio', sprintf: 'stdio', snprintf: 'stdio',
      scanf: 'stdio', sscanf: 'stdio', putchar: 'stdio', getchar: 'stdio',
      puts: 'stdio', gets: 'stdio', fgets: 'stdio', putc: 'stdio',
      fputc: 'stdio', getc: 'stdio', fgetc: 'stdio',

      malloc: 'stdlib', calloc: 'stdlib', realloc: 'stdlib', free: 'stdlib',
      exit: 'stdlib', abort: 'stdlib', abs: 'stdlib', labs: 'stdlib',
      atoi: 'stdlib', atof: 'stdlib', atol: 'stdlib', rand: 'stdlib', srand: 'stdlib',

      strlen: 'string', strcpy: 'string', strncpy: 'string', strcat: 'string',
      strncat: 'string', strcmp: 'string', strncmp: 'string', strchr: 'string',
      strrchr: 'string', strstr: 'string', memset: 'string', memcpy: 'string',
      memmove: 'string', memcmp: 'string',

      sqrt: 'math', cbrt: 'math', pow: 'math', fabs: 'math', ceil: 'math',
      floor: 'math', round: 'math', fmod: 'math', sin: 'math', cos: 'math',
      tan: 'math', asin: 'math', acos: 'math', atan: 'math', atan2: 'math',
      log: 'math', log2: 'math', log10: 'math', exp: 'math',

      isalpha: 'ctype', isdigit: 'ctype', isalnum: 'ctype', isspace: 'ctype',
      isupper: 'ctype', islower: 'ctype', isprint: 'ctype', ispunct: 'ctype',
      toupper: 'ctype', tolower: 'ctype',
    };

    for (const [name, header] of Object.entries(headerByFunction)) {
      if (!this.includedLibs.has(header)) delete funcs[name];
    }

    if (this.graphics && (this.includedLibs.has('tortuga') || this.includedLibs.has('processing'))) {
      if (this.includedLibs.has('processing')) {
        this.graphics.setCoordMode('processing');
      } else if (this.includedLibs.has('tortuga')) {
        this.graphics.setCoordMode('logo');
      }

      const gf = this.graphics.getFunctions();
      for (const [name, fn] of Object.entries(gf)) {
        funcs[name] = fn;
      }
    }

    return funcs;
  }

  // ── sprintf / printf format string parser ────────────────────────────

  /**
   * Interpreta un format string de C (%d, %f, %s, %c, %p, %x, etc.)
   * y devuelve el string resultante.
   */
  _sprintfImpl(fmt, argValues, interp) {
    let result = '';
    let argIdx = 0;
    let i = 0;

    while (i < fmt.length) {
      if (fmt[i] !== '%') {
        result += fmt[i++];
        continue;
      }
      i++; // saltar %

      if (i >= fmt.length) break;
      if (fmt[i] === '%') { result += '%'; i++; continue; }

      // Parsear flags: -, +, space, 0, #
      let flagMinus = false, flagPlus = false, flagSpace = false,
          flagZero  = false, flagHash = false;
      while ('-+ 0#'.includes(fmt[i])) {
        switch (fmt[i]) {
          case '-': flagMinus = true; break;
          case '+': flagPlus  = true; break;
          case ' ': flagSpace = true; break;
          case '0': flagZero  = true; break;
          case '#': flagHash  = true; break;
        }
        i++;
      }

      // Width
      let width = 0;
      while (fmt[i] >= '0' && fmt[i] <= '9') { width = width * 10 + +fmt[i++]; }

      // Precision
      let precision = -1;
      if (fmt[i] === '.') {
        i++; precision = 0;
        while (fmt[i] >= '0' && fmt[i] <= '9') { precision = precision * 10 + +fmt[i++]; }
      }

      // Length modifier (ignorado, por ahora l, ll, h, hh)
      while ('hlLzjt'.includes(fmt[i])) i++;

      // Specifier
      const spec = fmt[i++];
      const val  = argValues[argIdx++] ?? 0;
      let formatted = '';

      switch (spec) {
        case 'd': case 'i':
          formatted = this._padNum(Math.trunc(+val).toString(), width, flagMinus, flagZero, flagPlus, flagSpace);
          break;
        case 'u':
          formatted = this._padNum((+val >>> 0).toString(), width, flagMinus, flagZero, false, false);
          break;
        case 'o':
          formatted = this._padNum((+val >>> 0).toString(8), width, flagMinus, flagZero, false, false);
          if (flagHash && formatted !== '0') formatted = '0' + formatted;
          break;
        case 'x':
          formatted = this._padNum((+val >>> 0).toString(16), width, flagMinus, flagZero, false, false);
          if (flagHash) formatted = '0x' + formatted;
          break;
        case 'X':
          formatted = this._padNum((+val >>> 0).toString(16).toUpperCase(), width, flagMinus, flagZero, false, false);
          if (flagHash) formatted = '0X' + formatted;
          break;
        case 'f': case 'F': {
          const prec = precision < 0 ? 6 : precision;
          formatted  = (+val).toFixed(prec);
          if (flagPlus && +val >= 0) formatted = '+' + formatted;
          formatted  = this._pad(formatted, width, flagMinus, ' ');
          break;
        }
        case 'e': case 'E': {
          const prec = precision < 0 ? 6 : precision;
          formatted  = (+val).toExponential(prec);
          if (spec === 'E') formatted = formatted.toUpperCase();
          formatted  = this._pad(formatted, width, flagMinus, ' ');
          break;
        }
        case 'g': case 'G': {
          const prec = precision < 0 ? 6 : Math.max(1, precision);
          formatted  = parseFloat((+val).toPrecision(prec)).toString();
          if (spec === 'G') formatted = formatted.toUpperCase();
          formatted  = this._pad(formatted, width, flagMinus, ' ');
          break;
        }
        case 'c':
          formatted = String.fromCharCode(+val & 0xFF);
          formatted = this._pad(formatted, width, flagMinus, ' ');
          break;
        case 's': {
          const str = interp ? interp.memory.readString(+val) : String(val);
          const s   = precision >= 0 ? str.slice(0, precision) : str;
          formatted  = this._pad(s, width, flagMinus, ' ');
          break;
        }
        case 'p':
          formatted = '0x' + (+val >>> 0).toString(16);
          formatted = this._pad(formatted, width, flagMinus, ' ');
          break;
        case 'n':
          // Escribe el número de chars escritos hasta ahora en el puntero
          if (interp && val) interp.memory.write(val, 'int', result.length);
          argIdx--; // no consume argumento de valor
          break;
        default:
          formatted = '%' + spec;
      }

      result += formatted;
    }

    return result;
  }

  _padNum(str, width, left, zero, plus, space) {
    const sign   = str.startsWith('-') ? '-' : (plus ? '+' : (space ? ' ' : ''));
    const digits = str.startsWith('-') ? str.slice(1) : str;
    const padChar = zero && !left ? '0' : ' ';
    let padded  = sign + digits;
    while (padded.length < width) {
      if (left)      padded += ' ';
      else if (zero) padded  = sign + '0' + padded.slice(sign.length);
      else           padded  = ' ' + padded;
    }
    return padded;
  }

  _pad(str, width, left, padChar) {
    while (str.length < width) {
      if (left) str += padChar;
      else      str  = padChar + str;
    }
    return str;
  }

  // ── sscanf / scanf parser ────────────────────────────────────────────

  _sscanfImpl(fmt, input, ptrs, interp) {
    let fmtIdx   = 0;
    let inputIdx = 0;
    let count    = 0;

    for (let p = 0; p < ptrs.length && fmtIdx < fmt.length; ) {
      // Saltar whitespace en el formato
      if (/\s/.test(fmt[fmtIdx])) {
        // Saltar whitespace en el input
        while (inputIdx < input.length && /\s/.test(input[inputIdx])) inputIdx++;
        fmtIdx++;
        continue;
      }
      if (fmt[fmtIdx] !== '%') {
        if (input[inputIdx] !== fmt[fmtIdx]) break;
        fmtIdx++; inputIdx++;
        continue;
      }
      fmtIdx++; // saltar %

      // Saltar whitespace en input para la mayoría de especificadores
      while (inputIdx < input.length && /\s/.test(input[inputIdx])) inputIdx++;

      const spec = fmt[fmtIdx++];
      const addr = ptrs[p++];
      let   match = '';

      switch (spec) {
        case 'd': case 'i':
          while (inputIdx < input.length && /[-+\d]/.test(input[inputIdx])) match += input[inputIdx++];
          if (match && addr) interp?.memory.write(addr, 'int', parseInt(match, 10));
          break;
        case 'u':
          while (inputIdx < input.length && /\d/.test(input[inputIdx])) match += input[inputIdx++];
          if (match && addr) interp?.memory.write(addr, 'unsigned int', parseInt(match, 10));
          break;
        case 'f': case 'e': case 'g':
          while (inputIdx < input.length && /[-+.\deE]/.test(input[inputIdx])) match += input[inputIdx++];
          if (match && addr) interp?.memory.write(addr, 'float', parseFloat(match));
          break;
        case 'lf': case 's':
          if (spec === 's') {
            while (inputIdx < input.length && !/\s/.test(input[inputIdx])) match += input[inputIdx++];
            if (addr) {
              interp?.memory.writeString(addr, match);
              interp?.memory.write(addr + match.length, 'unsigned char', 0);
            }
          }
          break;
        case 'c':
          if (inputIdx < input.length) {
            match = input[inputIdx++];
            if (addr) interp?.memory.write(addr, 'char', match.charCodeAt(0));
          }
          break;
        default:
          continue;
      }
      if (match) count++;
    }
    return count;
  }
}
