import { CRuntimeError } from '../errors/CError.js';

export class JSCompiler {
  constructor({ includedLibs = new Set() } = {}) {
    this.includedLibs = includedLibs;
    this.indentLevel = 0;
  }

  compile(ast) {
    if (!ast || ast.type !== 'Program') {
      throw new CRuntimeError('AST inválido para compilación');
    }

    const lines = [
      '"use strict";',
      '',
      ...this._compileProgram(ast),
      '',
      'if (typeof main !== "function") {',
      '  throw new Error("No se encontró la función main()");',
      '}',
      'const __exitCode = await main();',
      '__finishProgram(__exitCode ?? 0);',
      '',
    ];

    return lines.join('\n');
  }

  _compileProgram(node) {
    const lines = [];

    for (const decl of node.body) {
      if (decl.type === 'FunctionDecl') {
        if (decl.body) {
          lines.push(this._compileFunctionDecl(decl));
          lines.push('');
        }
        continue;
      }

      if (decl.type === 'VarDecl') {
        lines.push(this._line(this._compileVarDecl(decl)));
        continue;
      }

      this._unsupported(decl);
    }

    return lines;
  }

  _compileFunctionDecl(node) {
    if ((node.pointer ?? 0) > 0) {
      this._unsupported(node, 'funciones que retornan punteros todavía no están soportadas por Compilar');
    }

    for (const param of node.params) {
      if ((param.pointer ?? 0) > 0 || (param.arrayDims?.length ?? 0) > 0) {
        this._unsupported(param, 'parámetros puntero/array todavía no están soportados por Compilar');
      }
    }

    const params = node.params
      .map((param, index) => this._safeName(param.name ?? `__arg${index}`))
      .join(', ');

    const lines = [];
    lines.push(this._line(`async function ${this._safeName(node.name)}(${params}) {`));
    this.indentLevel++;
    lines.push(...this._compileBlockBody(node.body));
    lines.push(this._line('return 0;'));
    this.indentLevel--;
    lines.push(this._line('}'));
    return lines.join('\n');
  }

  _compileBlockBody(node) {
    if (!node || node.type !== 'Block') this._unsupported(node);

    const lines = [];
    for (const stmt of node.body) {
      lines.push(...this._compileStatement(stmt));
    }
    return lines;
  }

  _compileStatement(node) {
    if (!node) return [];

    switch (node.type) {
      case 'Block': {
        const lines = [this._line('{')];
        this.indentLevel++;
        lines.push(...this._compileBlockBody(node));
        this.indentLevel--;
        lines.push(this._line('}'));
        return lines;
      }

      case 'VarDecl':
        return [this._line(this._compileVarDecl(node))];

      case 'ExprStmt':
        if (!node.expression) return [this._line(';')];
        return [this._line(`${this._compileExpr(node.expression)};`)];

      case 'ReturnStmt':
        return [
          this._line(node.argument
            ? `return ${this._compileExpr(node.argument)};`
            : 'return 0;')
        ];

      case 'IfStmt': {
        const lines = [this._line(`if (${this._compileExpr(node.test)}) {`)];
        this.indentLevel++;
        lines.push(...this._compileStatementBody(node.consequent));
        this.indentLevel--;
        if (node.alternate) {
          lines.push(this._line('} else {'));
          this.indentLevel++;
          lines.push(...this._compileStatementBody(node.alternate));
          this.indentLevel--;
        }
        lines.push(this._line('}'));
        return lines;
      }

      case 'WhileStmt': {
        const lines = [this._line(`while (${this._compileExpr(node.test)}) {`)];
        this.indentLevel++;
        lines.push(...this._compileStatementBody(node.body));
        this.indentLevel--;
        lines.push(this._line('}'));
        return lines;
      }

      case 'DoWhileStmt': {
        const lines = [this._line('do {')];
        this.indentLevel++;
        lines.push(...this._compileStatementBody(node.body));
        this.indentLevel--;
        lines.push(this._line(`} while (${this._compileExpr(node.test)});`));
        return lines;
      }

      case 'ForStmt': {
        const init = node.init ? this._compileForInit(node.init) : '';
        const test = node.test ? this._compileExpr(node.test) : '';
        const update = node.update ? this._compileExpr(node.update) : '';
        const lines = [this._line(`for (${init}; ${test}; ${update}) {`)];
        this.indentLevel++;
        lines.push(...this._compileStatementBody(node.body));
        this.indentLevel--;
        lines.push(this._line('}'));
        return lines;
      }

      case 'BreakStmt':
        return [this._line('break;')];

      case 'ContinueStmt':
        return [this._line('continue;')];

      default:
        this._unsupported(node);
    }
  }

  _compileStatementBody(node) {
    if (node?.type === 'Block') {
      return this._compileBlockBody(node);
    }
    return this._compileStatement(node);
  }

  _compileVarDecl(node) {
    const parts = node.declarators.map(decl => {
      if ((decl.pointer ?? 0) > 0 || (decl.arrayDims?.length ?? 0) > 0) {
        this._unsupported(node, 'punteros y arrays todavía no están soportados por Compilar');
      }
      const name = this._safeName(decl.name);
      const init = decl.init ? this._compileExpr(decl.init) : '0';
      return `${name} = ${init}`;
    });

    return `let ${parts.join(', ')};`;
  }

  _compileForInit(node) {
    if (node.type === 'VarDecl') {
      return this._compileVarDecl(node).replace(/;$/, '');
    }
    if (node.type === 'ExprStmt') {
      return node.expression ? this._compileExpr(node.expression) : '';
    }
    this._unsupported(node);
  }

  _compileExpr(node) {
    if (!node) return '0';

    switch (node.type) {
      case 'NumberLiteral':
        return String(node.value);

      case 'CharLiteral':
        return String(node.value);

      case 'StringLiteral':
        return JSON.stringify(node.value);

      case 'Identifier':
        return this._safeName(node.name);

      case 'BinaryExpr':
        return `(${this._compileExpr(node.left)} ${node.op} ${this._compileExpr(node.right)})`;

      case 'AssignExpr':
        return `(${this._compileExpr(node.left)} ${node.op} ${this._compileExpr(node.right)})`;

      case 'UnaryExpr':
        if (node.op === '&') {
          if (node.operand?.type === 'Identifier') {
            const name = this._safeName(node.operand.name);
            return `__ref(() => ${name}, value => (${name} = value))`;
          }
          this._unsupported(node, 'solo &variable está soportado por Compilar');
        }
        if (node.op === '*') {
          this._unsupported(node, 'el operador * de punteros todavía no está soportado por Compilar');
        }
        if (node.op === '++' || node.op === '--') {
          return `(${node.op}${this._compileExpr(node.operand)})`;
        }
        return `(${node.op}${this._compileExpr(node.operand)})`;

      case 'PostfixExpr':
        return `(${this._compileExpr(node.operand)}${node.op})`;

      case 'TernaryExpr':
        return `(${this._compileExpr(node.test)} ? ${this._compileExpr(node.consequent)} : ${this._compileExpr(node.alternate)})`;

      case 'CommaExpr':
        return `(${node.expressions.map(expr => this._compileExpr(expr)).join(', ')})`;

      case 'CallExpr': {
        if (node.callee.type === 'Identifier') {
          const calleeName = this._safeName(node.callee.name);
          const args = node.args.map(arg => this._compileExpr(arg)).join(', ');
          return `(await ${calleeName}(${args}))`;
        }
        this._unsupported(node, 'llamadas indirectas todavía no están soportadas por Compilar');
      }

      case 'CastExpr':
        return this._compileExpr(node.operand);

      case 'SizeofExpr':
        if (node.ofType) return this._compileSizeOf(node.ofType);
        if (node.ofExpr) return '4';
        return '4';

      default:
        this._unsupported(node);
    }
  }

  _compileSizeOf(typeNode) {
    const base = typeNode.base;
    if ((typeNode.pointer ?? 0) > 0) return '4';

    const sizes = {
      char: 1,
      short: 2,
      int: 4,
      float: 4,
      double: 8,
      long: 8,
      void: 0,
    };

    return String(sizes[base] ?? 4);
  }

  _safeName(name) {
    if (!name) return '__tmp';
    if (/^[A-Za-z_]\w*$/.test(name)) return name;
    return `__id_${name.replace(/\W+/g, '_')}`;
  }

  _line(text) {
    return `${'  '.repeat(this.indentLevel)}${text}`;
  }

  _unsupported(node, message = null) {
    const kind = node?.type ?? 'desconocido';
    const loc = node?.loc;
    throw new CRuntimeError(
      message ?? `Nodo no soportado por Compilar: ${kind}`,
      loc?.line,
      loc?.col
    );
  }
}
