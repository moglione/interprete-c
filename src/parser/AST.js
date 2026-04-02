/**
 * AST.js — Fábricas de nodos del Árbol de Sintaxis Abstracta (AST)
 *
 * Cada función crea un objeto plano con:
 *   - type: string que identifica el tipo de nodo
 *   - loc:  { line, col } del primer token del nodo
 *   - ...props: propiedades específicas del nodo
 *
 * Convención de nombres: coinciden con la nomenclatura C/EBNF estándar.
 */

export const AST = {

  // ── Programa ──────────────────────────────────────────────────────────
  Program: (body, loc) =>
    ({ type: 'Program', body, loc }),

  // ── Declaraciones ────────────────────────────────────────────────────

  /**
   * Declaración de variable(s) del mismo tipo base.
   * declarators: [{ name, pointer, arrayDims, init }]
   *   pointer:   número de niveles de indirección (* = 1, ** = 2, ...)
   *   arrayDims: array de expresiones de dimensión ([] → null)
   *   init:      expresión inicializadora o null
   */
  VarDecl: (typeSpec, declarators, loc) =>
    ({ type: 'VarDecl', typeSpec, declarators, loc }),

  /**
   * Declaración de función.
   * params: [{ typeSpec, pointer, name, arrayDims }]
   * body:   Block | null (si es solo prototipo)
   */
  FunctionDecl: (typeSpec, pointer, name, params, body, isVariadic, loc) =>
    ({ type: 'FunctionDecl', typeSpec, pointer, name, params, body, isVariadic, loc }),

  // Parámetro de función
  Param: (typeSpec, pointer, name, arrayDims, loc) =>
    ({ type: 'Param', typeSpec, pointer, name, arrayDims, loc }),

  // ── Statements ───────────────────────────────────────────────────────

  Block: (body, loc) =>
    ({ type: 'Block', body, loc }),

  IfStmt: (test, consequent, alternate, loc) =>
    ({ type: 'IfStmt', test, consequent, alternate, loc }),

  WhileStmt: (test, body, loc) =>
    ({ type: 'WhileStmt', test, body, loc }),

  DoWhileStmt: (body, test, loc) =>
    ({ type: 'DoWhileStmt', body, test, loc }),

  ForStmt: (init, test, update, body, loc) =>
    ({ type: 'ForStmt', init, test, update, body, loc }),

  /** cases: [{ value: expr|null (null=default), body: [stmt] }] */
  SwitchStmt: (discriminant, cases, loc) =>
    ({ type: 'SwitchStmt', discriminant, cases, loc }),

  CaseClause: (test, body, loc) =>
    ({ type: 'CaseClause', test, body, loc }),  // test=null → default

  ReturnStmt: (argument, loc) =>
    ({ type: 'ReturnStmt', argument, loc }),

  BreakStmt: (loc) =>
    ({ type: 'BreakStmt', loc }),

  ContinueStmt: (loc) =>
    ({ type: 'ContinueStmt', loc }),

  GotoStmt: (label, loc) =>
    ({ type: 'GotoStmt', label, loc }),

  LabelStmt: (name, body, loc) =>
    ({ type: 'LabelStmt', name, body, loc }),

  ExprStmt: (expression, loc) =>
    ({ type: 'ExprStmt', expression, loc }),

  // ── Expresiones ──────────────────────────────────────────────────────

  /** op: '+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=',
   *       '&&', '||', '&', '|', '^', '<<', '>>' */
  BinaryExpr: (op, left, right, loc) =>
    ({ type: 'BinaryExpr', op, left, right, loc }),

  /** op: '-' (negate), '!' (not), '~' (bitnot), '&' (addr-of),
   *      '*' (deref), '++' (prefix), '--' (prefix) */
  UnaryExpr: (op, operand, prefix, loc) =>
    ({ type: 'UnaryExpr', op, operand, prefix, loc }),

  /** op: '++' o '--' postfijo */
  PostfixExpr: (op, operand, loc) =>
    ({ type: 'PostfixExpr', op, operand, loc }),

  TernaryExpr: (test, consequent, alternate, loc) =>
    ({ type: 'TernaryExpr', test, consequent, alternate, loc }),

  /** op: '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=' */
  AssignExpr: (op, left, right, loc) =>
    ({ type: 'AssignExpr', op, left, right, loc }),

  CallExpr: (callee, args, loc) =>
    ({ type: 'CallExpr', callee, args, loc }),

  IndexExpr: (object, index, loc) =>
    ({ type: 'IndexExpr', object, index, loc }),

  /** computed=false → obj.field, computed=true (never for member) */
  MemberExpr: (object, property, arrow, loc) =>
    ({ type: 'MemberExpr', object, property, arrow, loc }),

  /** targetType: string del tipo destino, e.g. '(int*)' → { base:'int', pointer:1 } */
  CastExpr: (targetType, operand, loc) =>
    ({ type: 'CastExpr', targetType, operand, loc }),

  /** ofType: string | null (sizeof(expr)) */
  SizeofExpr: (ofType, ofExpr, loc) =>
    ({ type: 'SizeofExpr', ofType, ofExpr, loc }),

  CommaExpr: (expressions, loc) =>
    ({ type: 'CommaExpr', expressions, loc }),

  // ── Literales ────────────────────────────────────────────────────────

  NumberLiteral: (value, raw, isFloat, loc) =>
    ({ type: 'NumberLiteral', value, raw, isFloat, loc }),

  StringLiteral: (value, loc) =>
    ({ type: 'StringLiteral', value, loc }),

  CharLiteral: (value, loc) =>
    ({ type: 'CharLiteral', value, loc }),

  Identifier: (name, loc) =>
    ({ type: 'Identifier', name, loc }),

  // Lista de inicialización para arrays/structs
  InitializerList: (elements, loc) =>
    ({ type: 'InitializerList', elements, loc }),
};
