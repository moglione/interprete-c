/**
 * Lexer.js — Analizador Léxico de C99
 *
 * Convierte el código fuente C (ya preprocesado) en una lista de tokens.
 * Cada token: { type, value, line, col }
 */

import { TT, KEYWORDS } from './TokenTypes.js';
import { CLexError } from '../errors/CError.js';

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos    = 0;
    this.line   = 1;
    this.col    = 1;
    this.tokens = [];
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this._skipWhitespace();
      if (this.pos >= this.source.length) break;

      const c = this._peek();

      if (this._isDigit(c) || (c === '.' && this._isDigit(this._peek(1)))) {
        this._readNumber();
      } else if (this._isAlpha(c) || c === '_') {
        this._readIdentOrKeyword();
      } else if (c === '"') {
        this._readString();
      } else if (c === "'") {
        this._readChar();
      } else {
        this._readOperatorOrPunct();
      }
    }

    this.tokens.push({ type: TT.EOF, value: null, line: this.line, col: this.col });
    return this.tokens;
  }

  // ── Lectura de tokens ───────────────────────────────────────────────────

  _readNumber() {
    const startLine = this.line;
    const startCol  = this.col;
    let raw = '';
    let isFloat = false;

    // Hexadecimal
    if (this._peek() === '0' && (this._peek(1) === 'x' || this._peek(1) === 'X')) {
      raw += this._advance() + this._advance(); // 0x
      while (this._isHexDigit(this._peek())) raw += this._advance();
    }
    // Octal o decimal
    else {
      while (this._isDigit(this._peek())) raw += this._advance();

      // Parte decimal
      if (this._peek() === '.' && this._peek(1) !== '.') {
        isFloat = true;
        raw += this._advance(); // .
        while (this._isDigit(this._peek())) raw += this._advance();
      }

      // Exponente
      if (this._peek() === 'e' || this._peek() === 'E') {
        isFloat = true;
        raw += this._advance();
        if (this._peek() === '+' || this._peek() === '-') raw += this._advance();
        while (this._isDigit(this._peek())) raw += this._advance();
      }
    }

    // Sufijos: u, l, ul, ull, f, etc.
    while (/[uUlLfF]/.test(this._peek())) raw += this._advance();

    // Determinar si es octal (empieza con 0 y tiene más dígitos y no es hex ni float)
    let value;
    if (!isFloat) {
      if (raw.startsWith('0x') || raw.startsWith('0X')) {
        value = parseInt(raw, 16);
      } else if (raw.startsWith('0') && raw.length > 1 && /^0[0-7]+[uUlL]*$/.test(raw)) {
        const octPart = raw.replace(/[uUlL]/gi, '');
        value = parseInt(octPart, 8);
      } else {
        value = parseInt(raw.replace(/[uUlL]/gi, ''), 10);
      }
      this.tokens.push({ type: TT.INT_LITERAL, value, raw, line: startLine, col: startCol });
    } else {
      value = parseFloat(raw.replace(/[fFlL]/gi, ''));
      this.tokens.push({ type: TT.FLOAT_LITERAL, value, raw, line: startLine, col: startCol });
    }
  }

  _readIdentOrKeyword() {
    const startLine = this.line;
    const startCol  = this.col;
    let name = '';
    while (this._isAlphaNum(this._peek()) || this._peek() === '_') {
      name += this._advance();
    }
    const type = KEYWORDS.has(name) ? TT.KEYWORD : TT.IDENTIFIER;
    this.tokens.push({ type, value: name, line: startLine, col: startCol });
  }

  _readString() {
    const startLine = this.line;
    const startCol  = this.col;
    this._advance(); // consume "
    let str = '';
    while (this.pos < this.source.length && this._peek() !== '"') {
      if (this._peek() === '\n') {
        throw new CLexError('String literal no cerrado antes del fin de línea', this.line, this.col);
      }
      str += this._readEscape();
    }
    if (this._peek() !== '"') {
      throw new CLexError('String literal no cerrado', startLine, startCol);
    }
    this._advance(); // consume "
    this.tokens.push({ type: TT.STRING_LITERAL, value: str, line: startLine, col: startCol });
  }

  _readChar() {
    const startLine = this.line;
    const startCol  = this.col;
    this._advance(); // consume '
    if (this._peek() === "'") {
      throw new CLexError("Literal de carácter vacío ''", this.line, this.col);
    }
    const ch = this._readEscape();
    if (this._peek() !== "'") {
      throw new CLexError("Literal de carácter no cerrado", this.line, this.col);
    }
    this._advance(); // consume '
    // El valor numérico del char (code point)
    const charCode = typeof ch === 'string' ? ch.charCodeAt(0) : ch;
    this.tokens.push({ type: TT.CHAR_LITERAL, value: charCode, raw: ch, line: startLine, col: startCol });
  }

  _readEscape() {
    const c = this._advance();
    if (c !== '\\') return c;
    const next = this._advance();
    switch (next) {
      case 'n':  return '\n';
      case 't':  return '\t';
      case 'r':  return '\r';
      case '0':  return '\0';
      case '\\': return '\\';
      case "'":  return "'";
      case '"':  return '"';
      case 'a':  return '\x07';
      case 'b':  return '\b';
      case 'f':  return '\f';
      case 'v':  return '\v';
      case 'x': {
        // Hexadecimal escape \xNN
        let hex = '';
        while (this._isHexDigit(this._peek()) && hex.length < 2) hex += this._advance();
        return String.fromCharCode(parseInt(hex, 16));
      }
      default:
        if (this._isDigit(next)) {
          // Octal escape \NNN
          let oct = next;
          while (this._isOctalDigit(this._peek()) && oct.length < 3) oct += this._advance();
          return String.fromCharCode(parseInt(oct, 8));
        }
        return next; // secuencia de escape desconocida: la devolvemos tal cual
    }
  }

  _readOperatorOrPunct() {
    const startLine = this.line;
    const startCol  = this.col;
    const c  = this._peek();
    const c2 = this._peek(1);
    const c3 = this._peek(2);

    // Operadores de 3 caracteres
    const three = c + c2 + c3;
    if (three === '<<=' || three === '>>=' || three === '...') {
      this._advance(); this._advance(); this._advance();
      this.tokens.push({ type: three, value: three, line: startLine, col: startCol });
      return;
    }

    // Operadores de 2 caracteres
    const two = c + c2;
    const twoOps = ['++','--','<<','>>','<=','>=','==','!=','&&','||','+=','-=','*=','/=','%=','&=','|=','^=','->'];
    if (twoOps.includes(two)) {
      this._advance(); this._advance();
      this.tokens.push({ type: two, value: two, line: startLine, col: startCol });
      return;
    }

    // Operadores/puntuación de 1 carácter
    const oneOps = '+-*/%=<>&|^~!?:;,.(){}[]';
    if (oneOps.includes(c)) {
      this._advance();
      this.tokens.push({ type: c, value: c, line: startLine, col: startCol });
      return;
    }

    // Carácter desconocido
    throw new CLexError(`Carácter inesperado: '${c}' (U+${c.charCodeAt(0).toString(16).toUpperCase()})`, this.line, this.col);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _skipWhitespace() {
    while (this.pos < this.source.length) {
      const c = this.source[this.pos];
      if (c === '\n') { this.line++; this.col = 1; this.pos++; }
      else if (c === ' ' || c === '\t' || c === '\r') { this.col++; this.pos++; }
      else break;
    }
  }

  _peek(offset = 0) {
    return this.source[this.pos + offset] ?? '';
  }

  _advance() {
    const c = this.source[this.pos++];
    if (c === '\n') { this.line++; this.col = 1; }
    else { this.col++; }
    return c;
  }

  _isDigit(c)      { return c >= '0' && c <= '9'; }
  _isHexDigit(c)   { return /[0-9a-fA-F]/.test(c); }
  _isOctalDigit(c) { return c >= '0' && c <= '7'; }
  _isAlpha(c)      { return /[a-zA-Z_]/.test(c); }
  _isAlphaNum(c)   { return /[a-zA-Z0-9_]/.test(c); }
}
