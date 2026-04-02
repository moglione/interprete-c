/**
 * CError.js — Clases de error del intérprete C99
 * Cada error porta su origen (línea, columna) para reportes precisos.
 */

export class CError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'CError';
    this.line = line ?? null;
    this.col  = col  ?? null;
  }

  format() {
    if (this.line != null) {
      return `[${this.name}] Línea ${this.line}, col ${this.col}: ${this.message}`;
    }
    return `[${this.name}] ${this.message}`;
  }
}

export class CLexError extends CError {
  constructor(message, line, col) {
    super(message, line, col);
    this.name = 'Error Léxico';
  }
}

export class CParseError extends CError {
  constructor(message, line, col) {
    super(message, line, col);
    this.name = 'Error Sintáctico';
  }
}

export class CRuntimeError extends CError {
  constructor(message, line, col, callStack = []) {
    super(message, line, col);
    this.name      = 'Error en Ejecución';
    this.callStack = callStack;
  }

  format() {
    let out = super.format();
    if (this.callStack.length > 0) {
      out += '\n  Call stack:';
      for (const frame of [...this.callStack].reverse()) {
        out += `\n    → ${frame.name}() en línea ${frame.line}`;
      }
    }
    return out;
  }
}

export class CPreprocessError extends CError {
  constructor(message, line) {
    super(message, line, 1);
    this.name = 'Error de Preprocesador';
  }
}
