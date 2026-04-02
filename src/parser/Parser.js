/**
 * Parser.js — Analizador Sintáctico de C99 (Parser Recursivo Descendente)
 *
 * Consume la lista de tokens del Lexer y produce un AST.
 * Implementa la gramática de C99 (subconjunto Etapa A-B):
 *   - Declaraciones de variables y funciones (con punteros y arrays)
 *   - Todos los statements de control de flujo
 *   - Expresiones con precedencia correcta (via Pratt parsing)
 *   - Tipos compuestos: punteros, arrays, structs (básico)
 */

import { TT, TYPE_KEYWORDS } from '../lexer/TokenTypes.js';
import { AST } from './AST.js';
import { CParseError } from '../errors/CError.js';

// Especificadores de tipo de almacenamiento
const STORAGE_CLASS = new Set(['static', 'extern', 'auto', 'register', 'inline']);
const TYPE_QUALIFIERS = new Set(['const', 'volatile', 'restrict']);

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
  }

  parse() {
    const body = [];
    while (!this._check(TT.EOF)) {
      body.push(this._parseDeclarationOrFunction());
    }
    return AST.Program(body, { line: 1, col: 1 });
  }

  // ── Declaraciones de nivel superior ─────────────────────────────────

  _parseDeclarationOrFunction() {
    const loc = this._loc();

    // Consumir storage class y type qualifiers opcionalmente
    while (this._checkValue('typedef', 'extern', 'static', 'auto', 'register', 'inline',
                             'const', 'volatile', 'restrict')) {
      this._advance(); // los guardamos solo si son necesarios para el semántico
    }

    // Parsear tipo base
    const typeSpec = this._parseTypeSpec();

    // Parsear declaradores (puede haber punteros, arrays, función)
    return this._parseDeclaratorList(typeSpec, loc, true);
  }

  _parseDeclaratorList(typeSpec, loc, topLevel) {
    // Primer declarador
    const { pointer, name, arrayDims, params, isVariadic } = this._parseDeclarator();

    // ¿Es una función? (tiene '(' después del nombre a nivel superior)
    if (params !== null) {
      // Declaración de función
      let body = null;
      if (this._check(TT.LBRACE)) {
        body = this._parseBlock();
      } else {
        this._expect(TT.SEMICOLON);
      }
      return AST.FunctionDecl(typeSpec, pointer, name, params, body, isVariadic, loc);
    }

    // Declaración de variable(s)
    const declarators = [];
    let firstInit = null;
    if (this._check(TT.EQ)) {
      this._advance();
      firstInit = this._parseInitializer();
    }
    declarators.push({ name, pointer, arrayDims, init: firstInit });

    while (this._check(TT.COMMA)) {
      this._advance();
      const d = this._parseDeclarator();
      let init = null;
      if (this._check(TT.EQ)) {
        this._advance();
        init = this._parseInitializer();
      }
      declarators.push({ name: d.name, pointer: d.pointer, arrayDims: d.arrayDims, init });
    }
    this._expect(TT.SEMICOLON);
    return AST.VarDecl(typeSpec, declarators, loc);
  }

  _parseTypeSpec() {
    const loc = this._loc();
    let base = '';
    // Puede haber múltiples especificadores: unsigned long int, etc.
    while (this._check(TT.KEYWORD) && (TYPE_KEYWORDS.has(this._peek().value) || this._peek().value === 'struct' || this._peek().value === 'union' || this._peek().value === 'enum')) {
      const kw = this._advance().value;
      if (kw === 'struct' || kw === 'union') {
        base = kw + ' ';
        if (this._check(TT.IDENTIFIER)) {
          base += this._advance().value;
        }
        // struct/union body { ... } (ignoramos el body por ahora en typeSpec,
        // pero lo debemos parsear para avanzar los tokens)
        if (this._check(TT.LBRACE)) {
          this._parseStructBody();
        }
        break;
      } else if (kw === 'enum') {
        base = 'enum ';
        if (this._check(TT.IDENTIFIER)) {
          base += this._advance().value;
        }
        if (this._check(TT.LBRACE)) {
          this._parseEnumBody();
        }
        break;
      } else {
        base += (base ? ' ' : '') + kw;
      }
    }
    if (!base) {
      // typedef'd type (identifier used as type)
      if (this._check(TT.IDENTIFIER)) {
        base = this._advance().value;
      } else {
        throw new CParseError(`Se esperaba un tipo, encontré '${this._peek().value ?? 'EOF'}'`, loc.line, loc.col);
      }
    }
    return base.trim();
  }

  _parseStructBody() {
    this._expect(TT.LBRACE);
    while (!this._check(TT.RBRACE) && !this._check(TT.EOF)) {
      // Consumir campos (simplificado)
      while (!this._check(TT.SEMICOLON) && !this._check(TT.RBRACE) && !this._check(TT.EOF)) {
        this._advance();
      }
      if (this._check(TT.SEMICOLON)) this._advance();
    }
    this._expect(TT.RBRACE);
  }

  _parseEnumBody() {
    this._expect(TT.LBRACE);
    while (!this._check(TT.RBRACE) && !this._check(TT.EOF)) {
      this._advance();
    }
    this._expect(TT.RBRACE);
  }

  /**
   * Parsea la parte del declarador: punteros, nombre, dimensiones de array,
   * y opcionalmente lista de parámetros (si es función).
   * Devuelve: { pointer, name, arrayDims, params, isVariadic }
   */
  _parseDeclarator() {
    // Contar niveles de puntero
    let pointer = 0;
    while (this._check(TT.STAR)) {
      this._advance();
      pointer++;
      // Consumir const/volatile después de *
      while (this._checkValue('const', 'volatile', 'restrict')) this._advance();
    }

    // Nombre (puede ser anónimo en prototipos)
    let name = null;
    if (this._check(TT.IDENTIFIER)) {
      name = this._advance().value;
    } else if (this._check(TT.LPAREN)) {
      // Puntero a función: (*name)(params)
      this._advance();
      this._expect(TT.STAR);
      name = this._check(TT.IDENTIFIER) ? this._advance().value : null;
      this._expect(TT.RPAREN);
    }

    // Array dimensions
    const arrayDims = [];
    while (this._check(TT.LBRACKET)) {
      this._advance();
      if (this._check(TT.RBRACKET)) {
        arrayDims.push(null); // int arr[]
        this._advance();
      } else {
        arrayDims.push(this._parseExpression());
        this._expect(TT.RBRACKET);
      }
    }

    // Parámetros de función
    let params     = null;
    let isVariadic = false;
    if (this._check(TT.LPAREN)) {
      this._advance();
      params = [];
      if (!this._check(TT.RPAREN)) {
        // void → función sin parámetros
        if (this._check(TT.KEYWORD) && this._peek().value === 'void' &&
            this._peekAt(1).type === TT.RPAREN) {
          this._advance(); // consume void
        } else {
          while (true) {
            if (this._check(TT.ELLIPSIS)) {
              this._advance();
              isVariadic = true;
              break;
            }
            params.push(this._parseParam());
            if (!this._check(TT.COMMA)) break;
            this._advance();
          }
        }
      }
      this._expect(TT.RPAREN);
    }

    return { pointer, name, arrayDims, params, isVariadic };
  }

  _parseParam() {
    const loc = this._loc();
    // Consumir storage class / qualifiers
    while (this._checkValue('const', 'volatile', 'restrict', 'register')) this._advance();
    const typeSpec = this._parseTypeSpec();
    while (this._checkValue('const', 'volatile', 'restrict')) this._advance();

    let pointer = 0;
    while (this._check(TT.STAR)) { this._advance(); pointer++; }

    // Nombre opcional en prototipo
    let name = null;
    if (this._check(TT.IDENTIFIER)) name = this._advance().value;

    const arrayDims = [];
    while (this._check(TT.LBRACKET)) {
      this._advance();
      if (this._check(TT.RBRACKET)) { arrayDims.push(null); this._advance(); }
      else { arrayDims.push(this._parseExpression()); this._expect(TT.RBRACKET); }
    }

    return AST.Param(typeSpec, pointer, name, arrayDims, loc);
  }

  _parseInitializer() {
    if (this._check(TT.LBRACE)) {
      const loc = this._loc();
      this._advance();
      const elements = [];
      while (!this._check(TT.RBRACE) && !this._check(TT.EOF)) {
        elements.push(this._parseInitializer());
        if (!this._check(TT.RBRACE)) this._expect(TT.COMMA);
      }
      this._expect(TT.RBRACE);
      return AST.InitializerList(elements, loc);
    }
    return this._parseAssignExpr();
  }

  // ── Statements ───────────────────────────────────────────────────────

  _parseStatement() {
    const loc = this._loc();
    const tok = this._peek();

    // Label: "identifier :"
    if (tok.type === TT.IDENTIFIER && this._peekAt(1).type === TT.COLON) {
      const name = this._advance().value;
      this._advance(); // :
      return AST.LabelStmt(name, this._parseStatement(), loc);
    }

    if (tok.type === TT.KEYWORD) {
      switch (tok.value) {
        case 'if':       return this._parseIf();
        case 'while':    return this._parseWhile();
        case 'do':       return this._parseDoWhile();
        case 'for':      return this._parseFor();
        case 'switch':   return this._parseSwitch();
        case 'return':   return this._parseReturn();
        case 'break':    this._advance(); this._expect(TT.SEMICOLON); return AST.BreakStmt(loc);
        case 'continue': this._advance(); this._expect(TT.SEMICOLON); return AST.ContinueStmt(loc);
        case 'goto': {
          this._advance();
          const label = this._expect(TT.IDENTIFIER).value;
          this._expect(TT.SEMICOLON);
          return AST.GotoStmt(label, loc);
        }
        default:
          if (this._isTypeStart()) return this._parseLocalVarDecl();
      }
    }

    if (tok.type === TT.LBRACE) return this._parseBlock();
    if (tok.type === TT.SEMICOLON) { this._advance(); return AST.Block([], loc); }

    // Local var declaration (starts with a type keyword not matched above)
    if (this._isTypeStart()) return this._parseLocalVarDecl();

    // Expression statement
    const expr = this._parseExpression();
    this._expect(TT.SEMICOLON);
    return AST.ExprStmt(expr, loc);
  }

  _parseLocalVarDecl() {
    const loc = this._loc();
    // Consume storage class / qualifiers
    while (this._checkValue('const', 'volatile', 'restrict', 'static', 'auto', 'register')) {
      this._advance();
    }
    const typeSpec = this._parseTypeSpec();
    while (this._checkValue('const', 'volatile', 'restrict')) this._advance();
    return this._parseDeclaratorList(typeSpec, loc, false);
  }

  _isTypeStart() {
    const tok = this._peek();
    if (tok.type !== TT.KEYWORD) return false;
    return (
      TYPE_KEYWORDS.has(tok.value) ||
      tok.value === 'struct' ||
      tok.value === 'union'  ||
      tok.value === 'enum'   ||
      STORAGE_CLASS.has(tok.value) ||
      TYPE_QUALIFIERS.has(tok.value)
    );
  }

  _parseBlock() {
    const loc = this._loc();
    this._expect(TT.LBRACE);
    const body = [];
    while (!this._check(TT.RBRACE) && !this._check(TT.EOF)) {
      body.push(this._parseStatement());
    }
    this._expect(TT.RBRACE);
    return AST.Block(body, loc);
  }

  _parseIf() {
    const loc = this._loc();
    this._advance(); // if
    this._expect(TT.LPAREN);
    const test = this._parseExpression();
    this._expect(TT.RPAREN);
    const consequent = this._parseStatement();
    let alternate = null;
    if (this._check(TT.KEYWORD) && this._peek().value === 'else') {
      this._advance();
      alternate = this._parseStatement();
    }
    return AST.IfStmt(test, consequent, alternate, loc);
  }

  _parseWhile() {
    const loc = this._loc();
    this._advance(); // while
    this._expect(TT.LPAREN);
    const test = this._parseExpression();
    this._expect(TT.RPAREN);
    const body = this._parseStatement();
    return AST.WhileStmt(test, body, loc);
  }

  _parseDoWhile() {
    const loc = this._loc();
    this._advance(); // do
    const body = this._parseStatement();
    this._expectKeyword('while');
    this._expect(TT.LPAREN);
    const test = this._parseExpression();
    this._expect(TT.RPAREN);
    this._expect(TT.SEMICOLON);
    return AST.DoWhileStmt(body, test, loc);
  }

  _parseFor() {
    const loc = this._loc();
    this._advance(); // for
    this._expect(TT.LPAREN);

    // Init: declaración o expresión o vacío
    let init = null;
    if (!this._check(TT.SEMICOLON)) {
      if (this._isTypeStart()) {
        init = this._parseLocalVarDecl(); // ya consume el ';'
      } else {
        init = AST.ExprStmt(this._parseExpression(), this._loc());
        this._expect(TT.SEMICOLON);
      }
    } else {
      this._advance();
    }

    // Condition
    let test = null;
    if (!this._check(TT.SEMICOLON)) test = this._parseExpression();
    this._expect(TT.SEMICOLON);

    // Update
    let update = null;
    if (!this._check(TT.RPAREN)) update = this._parseExpression();
    this._expect(TT.RPAREN);

    const body = this._parseStatement();
    return AST.ForStmt(init, test, update, body, loc);
  }

  _parseSwitch() {
    const loc = this._loc();
    this._advance(); // switch
    this._expect(TT.LPAREN);
    const discriminant = this._parseExpression();
    this._expect(TT.RPAREN);
    this._expect(TT.LBRACE);

    const cases = [];
    while (!this._check(TT.RBRACE) && !this._check(TT.EOF)) {
      const caseLoc = this._loc();
      if (this._check(TT.KEYWORD) && this._peek().value === 'case') {
        this._advance();
        const test = this._parseExpression();
        this._expect(TT.COLON);
        const body = [];
        while (!this._check(TT.RBRACE) && !this._check(TT.EOF) &&
               !(this._check(TT.KEYWORD) && (this._peek().value === 'case' || this._peek().value === 'default'))) {
          body.push(this._parseStatement());
        }
        cases.push(AST.CaseClause(test, body, caseLoc));
      } else if (this._check(TT.KEYWORD) && this._peek().value === 'default') {
        this._advance();
        this._expect(TT.COLON);
        const body = [];
        while (!this._check(TT.RBRACE) && !this._check(TT.EOF) &&
               !(this._check(TT.KEYWORD) && (this._peek().value === 'case'))) {
          body.push(this._parseStatement());
        }
        cases.push(AST.CaseClause(null, body, caseLoc));
      } else {
        throw new CParseError(`Se esperaba 'case' o 'default', encontré '${this._peek().value}'`, caseLoc.line, caseLoc.col);
      }
    }
    this._expect(TT.RBRACE);
    return AST.SwitchStmt(discriminant, cases, loc);
  }

  _parseReturn() {
    const loc = this._loc();
    this._advance(); // return
    let arg = null;
    if (!this._check(TT.SEMICOLON)) {
      arg = this._parseExpression();
    }
    this._expect(TT.SEMICOLON);
    return AST.ReturnStmt(arg, loc);
  }

  // ── Expresiones (Pratt Parser) ────────────────────────────────────────
  // Precedencia de C (de menor a mayor):
  //  1.  , (comma)
  //  2.  = += -= *= /= %= &= |= ^= <<= >>= (asignación, derecha a izquierda)
  //  3.  ?: (ternario, derecha a izquierda)
  //  4.  ||
  //  5.  &&
  //  6.  |
  //  7.  ^
  //  8.  &
  //  9.  == !=
  // 10.  < > <= >=
  // 11.  << >>
  // 12.  + -
  // 13.  * / %
  // 14.  unarios prefijos (! ~ - + ++ -- & * sizeof cast)
  // 15.  postfijos ([] () . -> ++ --)

  _parseExpression() {
    const loc = this._loc();
    const left = this._parseAssignExpr();
    if (this._check(TT.COMMA)) {
      const exprs = [left];
      while (this._check(TT.COMMA)) {
        this._advance();
        exprs.push(this._parseAssignExpr());
      }
      return AST.CommaExpr(exprs, loc);
    }
    return left;
  }

  _parseAssignExpr() {
    const loc  = this._loc();
    const left = this._parseTernary();

    const assignOps = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='];
    if (assignOps.includes(this._peek().type)) {
      const op    = this._advance().type;
      const right = this._parseAssignExpr(); // derecha a izquierda
      return AST.AssignExpr(op, left, right, loc);
    }
    return left;
  }

  _parseTernary() {
    const loc  = this._loc();
    const test = this._parseOrExpr();
    if (this._check(TT.QUESTION)) {
      this._advance();
      const consequent = this._parseExpression();
      this._expect(TT.COLON);
      const alternate  = this._parseTernary(); // derecha a izquierda
      return AST.TernaryExpr(test, consequent, alternate, loc);
    }
    return test;
  }

  _parseOrExpr()  { return this._parseBinary(['||'], () => this._parseAndExpr()); }
  _parseAndExpr() { return this._parseBinary(['&&'], () => this._parseBitorExpr()); }
  _parseBitorExpr()  { return this._parseBinary(['|'], () => this._parseBitxorExpr()); }
  _parseBitxorExpr() { return this._parseBinary(['^'], () => this._parseBitandExpr()); }
  _parseBitandExpr() { return this._parseBinary(['&'], () => this._parseEqualityExpr()); }
  _parseEqualityExpr()   { return this._parseBinary(['==', '!='],          () => this._parseRelExpr()); }
  _parseRelExpr()        { return this._parseBinary(['<','>','<=','>='],   () => this._parseShiftExpr()); }
  _parseShiftExpr()      { return this._parseBinary(['<<', '>>'],          () => this._parseAddExpr()); }
  _parseAddExpr()        { return this._parseBinary(['+', '-'],            () => this._parseMulExpr()); }
  _parseMulExpr()        { return this._parseBinary(['*', '/', '%'],       () => this._parseCastExpr()); }

  _parseBinary(ops, next) {
    const loc  = this._loc();
    let   left = next();
    while (ops.includes(this._peek().type)) {
      const op    = this._advance().type;
      const right = next();
      left = AST.BinaryExpr(op, left, right, loc);
    }
    return left;
  }

  _parseCastExpr() {
    // Detectar cast: ( type )
    if (this._check(TT.LPAREN) && this._isCastAhead()) {
      const loc = this._loc();
      this._advance(); // (
      const targetType = this._parseCastType();
      this._expect(TT.RPAREN);
      const operand = this._parseCastExpr();
      return AST.CastExpr(targetType, operand, loc);
    }
    return this._parseUnaryExpr();
  }

  _parseCastType() {
    // Parsear el tipo dentro de un cast: puede ser "int", "int*", "char*", etc.
    let base = '';
    while (this._check(TT.KEYWORD) && (TYPE_KEYWORDS.has(this._peek().value) || TYPE_QUALIFIERS.has(this._peek().value))) {
      base += (base ? ' ' : '') + this._advance().value;
    }
    let ptrs = 0;
    while (this._check(TT.STAR)) { this._advance(); ptrs++; }
    return { base, pointer: ptrs };
  }

  _isCastAhead() {
    // Lookahead: es cast si después del '(' hay un tipo y luego un ')'
    let i = this.pos + 1; // justo después del '('
    const tok = this.tokens[i];
    if (!tok || tok.type !== TT.KEYWORD) return false;
    if (!TYPE_KEYWORDS.has(tok.value) && !TYPE_QUALIFIERS.has(tok.value)) return false;
    // Avanzar por todos los tokens de tipo
    while (i < this.tokens.length &&
           this.tokens[i].type === TT.KEYWORD &&
           (TYPE_KEYWORDS.has(this.tokens[i].value) || TYPE_QUALIFIERS.has(this.tokens[i].value))) {
      i++;
    }
    // Saltar '*'
    while (i < this.tokens.length && this.tokens[i].type === TT.STAR) i++;
    return this.tokens[i]?.type === TT.RPAREN;
  }

  _parseUnaryExpr() {
    const loc = this._loc();
    const tok = this._peek();

    if (tok.type === TT.PLUS_PLUS || tok.type === TT.MINUS_MINUS) {
      const op = this._advance().type;
      const operand = this._parseUnaryExpr();
      return AST.UnaryExpr(op, operand, true, loc);
    }

    if (tok.type === TT.MINUS || tok.type === TT.PLUS) {
      const op = this._advance().type;
      const operand = this._parseCastExpr();
      return AST.UnaryExpr(op, operand, true, loc);
    }

    if (tok.type === TT.BANG) {
      this._advance();
      return AST.UnaryExpr('!', this._parseCastExpr(), true, loc);
    }

    if (tok.type === TT.TILDE) {
      this._advance();
      return AST.UnaryExpr('~', this._parseCastExpr(), true, loc);
    }

    if (tok.type === TT.AMP) {
      this._advance();
      return AST.UnaryExpr('&', this._parseCastExpr(), true, loc);
    }

    if (tok.type === TT.STAR) {
      this._advance();
      return AST.UnaryExpr('*', this._parseCastExpr(), true, loc);
    }

    if (tok.type === TT.KEYWORD && tok.value === 'sizeof') {
      this._advance();
      if (this._check(TT.LPAREN) && this._isCastAhead()) {
        this._advance();
        const ofType = this._parseCastType();
        this._expect(TT.RPAREN);
        return AST.SizeofExpr(ofType, null, loc);
      }
      const ofExpr = this._parseUnaryExpr();
      return AST.SizeofExpr(null, ofExpr, loc);
    }

    return this._parsePostfixExpr();
  }

  _parsePostfixExpr() {
    let expr = this._parsePrimary();

    while (true) {
      const loc = this._loc();
      if (this._check(TT.LBRACKET)) {
        this._advance();
        const index = this._parseExpression();
        this._expect(TT.RBRACKET);
        expr = AST.IndexExpr(expr, index, loc);
      } else if (this._check(TT.LPAREN)) {
        this._advance();
        const args = [];
        if (!this._check(TT.RPAREN)) {
          args.push(this._parseAssignExpr());
          while (this._check(TT.COMMA)) {
            this._advance();
            args.push(this._parseAssignExpr());
          }
        }
        this._expect(TT.RPAREN);
        expr = AST.CallExpr(expr, args, loc);
      } else if (this._check(TT.DOT)) {
        this._advance();
        const prop = this._expect(TT.IDENTIFIER).value;
        expr = AST.MemberExpr(expr, prop, false, loc);
      } else if (this._check(TT.ARROW)) {
        this._advance();
        const prop = this._expect(TT.IDENTIFIER).value;
        expr = AST.MemberExpr(expr, prop, true, loc);
      } else if (this._check(TT.PLUS_PLUS)) {
        this._advance();
        expr = AST.PostfixExpr('++', expr, loc);
      } else if (this._check(TT.MINUS_MINUS)) {
        this._advance();
        expr = AST.PostfixExpr('--', expr, loc);
      } else {
        break;
      }
    }
    return expr;
  }

  _parsePrimary() {
    const loc = this._loc();
    const tok = this._peek();

    if (tok.type === TT.INT_LITERAL) {
      this._advance();
      return AST.NumberLiteral(tok.value, tok.raw, false, loc);
    }

    if (tok.type === TT.FLOAT_LITERAL) {
      this._advance();
      return AST.NumberLiteral(tok.value, tok.raw, true, loc);
    }

    if (tok.type === TT.CHAR_LITERAL) {
      this._advance();
      return AST.CharLiteral(tok.value, loc);
    }

    if (tok.type === TT.STRING_LITERAL) {
      // Concatenación de literales de string adyacentes: "a" "b" → "ab"
      let str = this._advance().value;
      while (this._check(TT.STRING_LITERAL)) {
        str += this._advance().value;
      }
      return AST.StringLiteral(str, loc);
    }

    if (tok.type === TT.IDENTIFIER) {
      this._advance();
      return AST.Identifier(tok.value, loc);
    }

    if (tok.type === TT.LPAREN) {
      this._advance();
      const expr = this._parseExpression();
      this._expect(TT.RPAREN);
      return expr;
    }

    throw new CParseError(
      `Token inesperado: '${tok.value ?? tok.type}'`,
      tok.line, tok.col
    );
  }

  // ── Utilidades ───────────────────────────────────────────────────────

  _peek()         { return this.tokens[this.pos] ?? { type: TT.EOF, value: null, line: 0, col: 0 }; }
  _peekAt(n)      { return this.tokens[this.pos + n] ?? { type: TT.EOF, value: null, line: 0, col: 0 }; }
  _advance()      { return this.tokens[this.pos++]; }
  _loc()          { const t = this._peek(); return { line: t.line, col: t.col }; }

  _check(type)    { return this._peek().type === type; }
  _checkValue(...vals) { return vals.includes(this._peek().value); }

  _expect(type) {
    const tok = this._peek();
    if (tok.type !== type) {
      throw new CParseError(
        `Se esperaba '${type}', encontré '${tok.value ?? tok.type}'`,
        tok.line, tok.col
      );
    }
    return this._advance();
  }

  _expectKeyword(value) {
    const tok = this._peek();
    if (tok.type !== TT.KEYWORD || tok.value !== value) {
      throw new CParseError(
        `Se esperaba '${value}', encontré '${tok.value ?? tok.type}'`,
        tok.line, tok.col
      );
    }
    return this._advance();
  }
}
