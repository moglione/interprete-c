/**
 * TokenTypes.js — Enumeración de todos los tipos de token de C99
 */

export const TT = Object.freeze({
  // Literales
  INT_LITERAL:    'INT_LITERAL',
  FLOAT_LITERAL:  'FLOAT_LITERAL',
  CHAR_LITERAL:   'CHAR_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',

  // Identificador y keywords
  IDENTIFIER: 'IDENTIFIER',
  KEYWORD:    'KEYWORD',

  // Operadores (todos los de C99)
  // Aritméticos
  PLUS:       '+',
  MINUS:      '-',
  STAR:       '*',
  SLASH:      '/',
  PERCENT:    '%',
  // Incremento/decremento
  PLUS_PLUS:  '++',
  MINUS_MINUS:'--',
  // Relacionales
  EQ_EQ:      '==',
  BANG_EQ:    '!=',
  LT:         '<',
  GT:         '>',
  LT_EQ:      '<=',
  GT_EQ:      '>=',
  // Lógicos
  AMP_AMP:    '&&',
  PIPE_PIPE:  '||',
  BANG:       '!',
  // Bitwise
  AMP:        '&',
  PIPE:       '|',
  CARET:      '^',
  TILDE:      '~',
  LT_LT:      '<<',
  GT_GT:      '>>',
  // Asignación
  EQ:         '=',
  PLUS_EQ:    '+=',
  MINUS_EQ:   '-=',
  STAR_EQ:    '*=',
  SLASH_EQ:   '/=',
  PERCENT_EQ: '%=',
  AMP_EQ:     '&=',
  PIPE_EQ:    '|=',
  CARET_EQ:   '^=',
  LT_LT_EQ:   '<<=',
  GT_GT_EQ:   '>>=',
  // Acceso
  DOT:        '.',
  ARROW:      '->',
  // Ternario
  QUESTION:   '?',
  COLON:      ':',
  // Puntuación
  SEMICOLON:  ';',
  COMMA:      ',',
  LPAREN:     '(',
  RPAREN:     ')',
  LBRACE:     '{',
  RBRACE:     '}',
  LBRACKET:   '[',
  RBRACKET:   ']',
  ELLIPSIS:   '...',
  // Fin de archivo
  EOF: 'EOF',
});

// Keywords de C99
export const KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default',
  'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto',
  'if', 'inline', 'int', 'long', 'register', 'restrict', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef',
  'union', 'unsigned', 'void', 'volatile', 'while',
  '_Bool', '_Complex', '_Imaginary',
]);

// Tipos primitivos (subconjunto de keywords)
export const TYPE_KEYWORDS = new Set([
  'void', 'char', 'short', 'int', 'long', 'float', 'double',
  'signed', 'unsigned', '_Bool',
]);
