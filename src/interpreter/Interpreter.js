/**
 * Interpreter.js — Evaluador del AST (Visitor Pattern) — VERSIÓN ASYNC
 *
 * Todas las funciones de evaluación son async para permitir que stdin
 * (scanf, getchar, etc.) espere genuinamente la entrada del usuario
 * desde el panel de la consola, sin bloquear el hilo principal.
 */

import { Environment }   from './Environment.js';
import { Memory }        from './Memory.js';
import { sizeOf, coerce } from './CTypes.js';
import { CRuntimeError } from '../errors/CError.js';

// ── Señales de control de flujo ──────────────────────────────────────
class ReturnSignal   { constructor(value) { this.value = value; } }
class BreakSignal    {}
class ContinueSignal {}
class GotoSignal     { constructor(label) { this.label = label; } }

export class Interpreter {
  constructor({ stdout = console.log, stdin = null, onStep = null } = {}) {
    this.stdout    = stdout;
    this.stdin     = stdin;   // async (hint: string) => string
    this.onStep    = onStep;
    this.memory    = new Memory();
    this.callStack = [];
    this.stdlib    = null;
    this.globalEnv = null;
    this._stepCount = 0;
    this._yieldEvery = 10;
    this._maxSteps = 500000;
    this._aborted = false;
  }

  async run(ast, stdlib) {
    this.stdlib    = stdlib;
    this.memory    = new Memory();
    this.callStack = [];
    this._stepCount = 0;
    this._aborted = false;

    this._validateFunctionDeclarationOrder(ast, stdlib);

    const globalEnv = new Environment();
    this.globalEnv  = globalEnv;

    for (const [name, fn] of Object.entries(stdlib.functions)) {
      globalEnv.define(name, { type: 'function', value: fn, builtin: true });
    }

    for (const decl of ast.body) {
      await this._registerGlobal(decl, globalEnv);
    }

    const mainSym = globalEnv.lookup('main');
    if (!mainSym || mainSym.type !== 'function') {
      throw new CRuntimeError("No se encontró la función 'main()'");
    }

    try {
      const result = await this._callFunction(mainSym.value, [], null);
      return result ?? 0;
    } catch (e) {
      if (e instanceof ExitSignal) return e.code;
      throw e;
    }
  }

  _validateFunctionDeclarationOrder(ast, stdlib) {
    const visibleFunctions = new Set(Object.keys(stdlib.functions));

    for (const decl of ast.body) {
      if (decl.type === 'FunctionDecl') {
        if (decl.body) {
          const fnScope = new Set(
            decl.params
              .map(param => param.name)
              .filter(name => name)
          );
          this._validateNodeDeclarationOrder(
            decl.body,
            new Set([...visibleFunctions, decl.name]),
            [fnScope]
          );
        }
        if (decl.name) visibleFunctions.add(decl.name);
      } else if (decl.type === 'VarDecl') {
        this._validateNodeDeclarationOrder(decl, visibleFunctions, [new Set()]);
      }
    }
  }

  _validateNodeDeclarationOrder(node, visibleFunctions, scopes) {
    if (!node) return;

    switch (node.type) {
      case 'Block': {
        const blockScope = new Set();
        scopes.push(blockScope);
        for (const stmt of node.body) {
          this._validateNodeDeclarationOrder(stmt, visibleFunctions, scopes);
        }
        scopes.pop();
        return;
      }

      case 'VarDecl':
        for (const decl of node.declarators) {
          this._validateNodeDeclarationOrder(decl.init, visibleFunctions, scopes);
          if (decl.name) scopes[scopes.length - 1].add(decl.name);
          for (const dim of decl.arrayDims ?? []) {
            this._validateNodeDeclarationOrder(dim, visibleFunctions, scopes);
          }
        }
        return;

      case 'ExprStmt':
        this._validateNodeDeclarationOrder(node.expression, visibleFunctions, scopes);
        return;

      case 'IfStmt':
        this._validateNodeDeclarationOrder(node.test, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.consequent, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.alternate, visibleFunctions, scopes);
        return;

      case 'WhileStmt':
      case 'DoWhileStmt':
        this._validateNodeDeclarationOrder(node.test, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.body, visibleFunctions, scopes);
        return;

      case 'ForStmt':
        scopes.push(new Set());
        this._validateNodeDeclarationOrder(node.init, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.test, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.update, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.body, visibleFunctions, scopes);
        scopes.pop();
        return;

      case 'SwitchStmt':
        this._validateNodeDeclarationOrder(node.discriminant, visibleFunctions, scopes);
        for (const clause of node.cases) {
          this._validateNodeDeclarationOrder(clause.test, visibleFunctions, scopes);
          scopes.push(new Set());
          for (const stmt of clause.body) {
            this._validateNodeDeclarationOrder(stmt, visibleFunctions, scopes);
          }
          scopes.pop();
        }
        return;

      case 'ReturnStmt':
        this._validateNodeDeclarationOrder(node.argument, visibleFunctions, scopes);
        return;

      case 'LabelStmt':
        this._validateNodeDeclarationOrder(node.body, visibleFunctions, scopes);
        return;

      case 'AssignExpr':
      case 'BinaryExpr':
        this._validateNodeDeclarationOrder(node.left, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.right, visibleFunctions, scopes);
        return;

      case 'UnaryExpr':
      case 'PostfixExpr':
        this._validateNodeDeclarationOrder(node.operand, visibleFunctions, scopes);
        return;

      case 'TernaryExpr':
        this._validateNodeDeclarationOrder(node.test, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.consequent, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.alternate, visibleFunctions, scopes);
        return;

      case 'CommaExpr':
        for (const expr of node.expressions) {
          this._validateNodeDeclarationOrder(expr, visibleFunctions, scopes);
        }
        return;

      case 'CallExpr':
        if (node.callee.type === 'Identifier' &&
            !visibleFunctions.has(node.callee.name) &&
            !scopes.some(scope => scope.has(node.callee.name))) {
          throw new CRuntimeError(`'${node.callee.name}' no declarado`, node.loc?.line, node.loc?.col);
        }
        this._validateNodeDeclarationOrder(node.callee, visibleFunctions, scopes);
        for (const arg of node.args) {
          this._validateNodeDeclarationOrder(arg, visibleFunctions, scopes);
        }
        return;

      case 'IndexExpr':
        this._validateNodeDeclarationOrder(node.object, visibleFunctions, scopes);
        this._validateNodeDeclarationOrder(node.index, visibleFunctions, scopes);
        return;

      case 'MemberExpr':
        this._validateNodeDeclarationOrder(node.object, visibleFunctions, scopes);
        return;

      case 'CastExpr':
        this._validateNodeDeclarationOrder(node.operand, visibleFunctions, scopes);
        return;

      case 'SizeofExpr':
        this._validateNodeDeclarationOrder(node.ofExpr, visibleFunctions, scopes);
        return;

      case 'InitializerList':
        for (const element of node.elements) {
          this._validateNodeDeclarationOrder(element, visibleFunctions, scopes);
        }
        return;

      default:
        return;
    }
  }

  async _registerGlobal(decl, env) {
    if (decl.type === 'FunctionDecl') {
      if (decl.body !== null) {
        env.define(decl.name, { type: 'function', value: decl, builtin: false });
      }
    } else if (decl.type === 'VarDecl') {
      await this._execVarDecl(decl, env);
    }
  }

  // ── Statements ───────────────────────────────────────────────────────

  async _exec(node, env) {
    await this._heartbeat(node);
    if (this.onStep) this.onStep(node, env);
    switch (node.type) {
      case 'Program':      return this._execProgram(node, env);
      case 'FunctionDecl': return;
      case 'VarDecl':      return this._execVarDecl(node, env);
      case 'Block':        return this._execBlock(node, env);
      case 'IfStmt':       return this._execIf(node, env);
      case 'WhileStmt':    return this._execWhile(node, env);
      case 'DoWhileStmt':  return this._execDoWhile(node, env);
      case 'ForStmt':      return this._execFor(node, env);
      case 'SwitchStmt':   return this._execSwitch(node, env);
      case 'ReturnStmt':   return this._execReturn(node, env);
      case 'BreakStmt':    throw new BreakSignal();
      case 'ContinueStmt': throw new ContinueSignal();
      case 'GotoStmt':     throw new GotoSignal(node.label);
      case 'LabelStmt':    return this._exec(node.body, env);
      case 'ExprStmt':     return this._eval(node.expression, env);
      default:
        throw new CRuntimeError(`Nodo desconocido: ${node.type}`, node.loc?.line, node.loc?.col);
    }
  }

  async _execProgram(node, env) {
    for (const stmt of node.body) await this._exec(stmt, env);
  }

  async _execBlock(node, env) {
    const childEnv = env.createChild();
    const sp = this.memory.saveStackPointer();
    try {
      for (let i = 0; i < node.body.length; i++) {
        const stmt = node.body[i];
        try {
          await this._exec(stmt, childEnv);
        } catch (e) {
          if (e instanceof GotoSignal) {
            const labelIdx = node.body.findIndex(s =>
              s.type === 'LabelStmt' && s.name === e.label
            );
            if (labelIdx !== -1) { i = labelIdx; continue; }
          }
          throw e;
        }
      }
    } finally {
      this.memory.restoreStackPointer(sp);
    }
  }

  async _execVarDecl(node, env) {
    for (const decl of node.declarators) {
      const { name, pointer, arrayDims, init } = decl;
      let effectiveType = pointer > 0 ? node.typeSpec + '*'.repeat(pointer) : node.typeSpec;

      let value  = 0;
      let address = null;

      if (arrayDims && arrayDims.length > 0) {
        // ── Inferir dimensión sin explícita (int arr[] = {...}) ──────
        let resolvedDims;
        if (arrayDims[0] === null) {
          if (init && init.type === 'InitializerList') {
            resolvedDims = [init.elements.length];
          } else if (init && init.type === 'StringLiteral') {
            resolvedDims = [init.value.length + 1];
          } else {
            resolvedDims = [1];
          }
        } else {
          resolvedDims = await Promise.all(
            arrayDims.map(d => d ? this._eval(d, env).then(v => Math.trunc(v)) : Promise.resolve(1))
          );
        }

        const totalElements = resolvedDims.reduce((a, b) => a * b, 1);
        const elemSize  = sizeOf(node.typeSpec);
        const totalSize = Math.max(totalElements * elemSize, 1);
        address = this.memory.stackAlloc(totalSize);

        if (init && init.type === 'InitializerList') {
          for (let i = 0; i < init.elements.length && i < totalElements; i++) {
            const v = coerce(await this._eval(init.elements[i], env), node.typeSpec);
            this.memory.write(address + i * elemSize, node.typeSpec, v);
          }
        } else if (init && init.type === 'StringLiteral') {
          const bytes = new TextEncoder().encode(init.value);
          for (let i = 0; i < bytes.length && i < totalElements - 1; i++) {
            this.memory.write(address + i, 'unsigned char', bytes[i]);
          }
        } else if (init) {
          const sv = await this._eval(init, env);
          if (typeof sv === 'number' && node.typeSpec === 'char') {
            const str = this.memory.readString(sv);
            const bytes = new TextEncoder().encode(str);
            for (let i = 0; i < bytes.length && i < totalElements - 1; i++) {
              this.memory.write(address + i, 'unsigned char', bytes[i]);
            }
          }
        }

        value = address;
        effectiveType = node.typeSpec + '*';
      } else if (pointer > 0) {
        address = this.memory.stackAlloc(sizeOf('pointer'));
        if (init !== null) {
          value = coerce(await this._eval(init, env), 'pointer');
        }
        this.memory.write(address, 'int', value);
      } else {
        const sz = sizeOf(effectiveType);
        if (sz > 0) {
          address = this.memory.stackAlloc(sz);
          if (init !== null) {
            value = coerce(await this._eval(init, env), effectiveType);
          }
          this.memory.write(address, effectiveType, value);
        }
      }

      env.define(name, { type: effectiveType, value, address, pointer, arrayDims });
    }
  }

  async _execIf(node, env) {
    if (this._isTruthy(await this._eval(node.test, env))) {
      await this._exec(node.consequent, env);
    } else if (node.alternate) {
      await this._exec(node.alternate, env);
    }
  }

  async _execWhile(node, env) {
    while (this._isTruthy(await this._eval(node.test, env))) {
      await this._heartbeat(node);
      try { await this._exec(node.body, env); }
      catch (e) {
        if (e instanceof BreakSignal)    break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  async _execDoWhile(node, env) {
    do {
      await this._heartbeat(node);
      try { await this._exec(node.body, env); }
      catch (e) {
        if (e instanceof BreakSignal)    break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    } while (this._isTruthy(await this._eval(node.test, env)));
  }

  async _execFor(node, env) {
    const forEnv = env.createChild();
    const sp = this.memory.saveStackPointer();
    try {
      if (node.init) await this._exec(node.init, forEnv);
      while (!node.test || this._isTruthy(await this._eval(node.test, forEnv))) {
        await this._heartbeat(node);
        try { await this._exec(node.body, forEnv); }
        catch (e) {
          if (e instanceof BreakSignal)    break;
          if (e instanceof ContinueSignal) { /* caer al update */ }
          else throw e;
        }
        if (node.update) await this._eval(node.update, forEnv);
      }
    } finally {
      this.memory.restoreStackPointer(sp);
    }
  }

  async _execSwitch(node, env) {
    await this._heartbeat(node);
    const disc = await this._eval(node.discriminant, env);
    let found  = false;
    for (const clause of node.cases) {
      if (!found) {
        if (clause.test === null) {
          found = true;
        } else {
          const val = await this._eval(clause.test, env);
          if (disc === val || disc == val) found = true;
        }
      }
      if (found) {
        try {
          for (const stmt of clause.body) await this._exec(stmt, env);
        } catch (e) {
          if (e instanceof BreakSignal) return;
          throw e;
        }
      }
    }
  }

  async _execReturn(node, env) {
    const value = node.argument ? await this._eval(node.argument, env) : undefined;
    throw new ReturnSignal(value);
  }

  // ── Expresiones ──────────────────────────────────────────────────────

  async _eval(node, env) {
    await this._heartbeat(node);
    switch (node.type) {
      case 'NumberLiteral':   return node.value;
      case 'CharLiteral':     return node.value;
      case 'StringLiteral':   return this.memory.internString(node.value);
      case 'Identifier':      return this._evalIdentifier(node, env);
      case 'BinaryExpr':      return this._evalBinary(node, env);
      case 'UnaryExpr':       return this._evalUnary(node, env);
      case 'PostfixExpr':     return this._evalPostfix(node, env);
      case 'AssignExpr':      return this._evalAssign(node, env);
      case 'TernaryExpr':     return this._isTruthy(await this._eval(node.test, env))
                                       ? this._eval(node.consequent, env)
                                       : this._eval(node.alternate, env);
      case 'CommaExpr': {
        let last;
        for (const e of node.expressions) last = await this._eval(e, env);
        return last;
      }
      case 'CallExpr':        return this._evalCall(node, env);
      case 'IndexExpr':       return this._evalIndex(node, env);
      case 'MemberExpr':      return this._evalMember(node, env);
      case 'CastExpr':        return this._evalCast(node, env);
      case 'SizeofExpr':      return this._evalSizeof(node, env);
      case 'InitializerList': return 0;
      default:
        throw new CRuntimeError(`No puedo evaluar nodo: ${node.type}`, node.loc?.line, node.loc?.col);
    }
  }

  _evalIdentifier(node, env) {
    const sym = env.lookup(node.name);
    if (!sym) throw new CRuntimeError(`'${node.name}' no declarado`, node.loc?.line, node.loc?.col);
    if (sym.type === 'function') return sym;
    if (sym.address !== null && sym.address !== undefined && !sym.arrayDims?.length) {
      return this.memory.read(sym.address, sym.type);
    }
    return sym.value;
  }

  async _evalBinary(node, env) {
    const op = node.op;
    if (op === '&&') {
      return this._isTruthy(await this._eval(node.left, env))
        ? (this._isTruthy(await this._eval(node.right, env)) ? 1 : 0)
        : 0;
    }
    if (op === '||') {
      return this._isTruthy(await this._eval(node.left, env))
        ? 1
        : (this._isTruthy(await this._eval(node.right, env)) ? 1 : 0);
    }
    const left  = await this._eval(node.left,  env);
    const right = await this._eval(node.right, env);
    switch (op) {
      case '+':  return left + right;
      case '-':  return left - right;
      case '*':  return left * right;
      case '/':
        if (right === 0) throw new CRuntimeError('División por cero', node.loc?.line, node.loc?.col);
        return Number.isInteger(left) && Number.isInteger(right) ? Math.trunc(left / right) : left / right;
      case '%':
        if (right === 0) throw new CRuntimeError('Módulo por cero', node.loc?.line, node.loc?.col);
        return Math.trunc(left % right);
      case '==': return left == right  ? 1 : 0;
      case '!=': return left != right  ? 1 : 0;
      case '<':  return left <  right  ? 1 : 0;
      case '>':  return left >  right  ? 1 : 0;
      case '<=': return left <= right  ? 1 : 0;
      case '>=': return left >= right  ? 1 : 0;
      case '&':  return (left | 0)  & (right | 0);
      case '|':  return (left | 0)  | (right | 0);
      case '^':  return (left | 0)  ^ (right | 0);
      case '<<': return (left | 0) << (right & 31);
      case '>>': return (left | 0) >> (right & 31);
      default:
        throw new CRuntimeError(`Operador binario desconocido: ${op}`, node.loc?.line, node.loc?.col);
    }
  }

  async _evalUnary(node, env) {
    const op = node.op;
    if (op === '&') return this._addressOf(node.operand, env);
    if (op === '*') {
      const addr = await this._eval(node.operand, env);
      if (addr === 0) throw new CRuntimeError('Null pointer dereference', node.loc?.line, node.loc?.col);
      return this.memory.read(addr, 'int');
    }
    if (op === '++' || op === '--') {
      const delta = op === '++' ? 1 : -1;
      const curr  = await this._eval(node.operand, env);
      const next  = curr + delta;
      await this._assign(node.operand, next, env);
      return next;
    }
    const val = await this._eval(node.operand, env);
    switch (op) {
      case '-':  return -val;
      case '+':  return +val;
      case '!':  return this._isTruthy(val) ? 0 : 1;
      case '~':  return ~(val | 0);
      default:
        throw new CRuntimeError(`Operador unario desconocido: ${op}`, node.loc?.line, node.loc?.col);
    }
  }

  async _evalPostfix(node, env) {
    const curr  = await this._eval(node.operand, env);
    const delta = node.op === '++' ? 1 : -1;
    await this._assign(node.operand, curr + delta, env);
    return curr;
  }

  async _evalAssign(node, env) {
    let rhs = await this._eval(node.right, env);
    if (node.op !== '=') {
      const lhs = await this._eval(node.left, env);
      switch (node.op) {
        case '+=':  rhs = lhs + rhs; break;
        case '-=':  rhs = lhs - rhs; break;
        case '*=':  rhs = lhs * rhs; break;
        case '/=':  rhs = Number.isInteger(lhs) && Number.isInteger(rhs) ? Math.trunc(lhs / rhs) : lhs / rhs; break;
        case '%=':  rhs = Math.trunc(lhs % rhs); break;
        case '&=':  rhs = (lhs | 0) & (rhs | 0); break;
        case '|=':  rhs = (lhs | 0) | (rhs | 0); break;
        case '^=':  rhs = (lhs | 0) ^ (rhs | 0); break;
        case '<<=': rhs = (lhs | 0) << (rhs & 31); break;
        case '>>=': rhs = (lhs | 0) >> (rhs & 31); break;
      }
    }
    return this._assign(node.left, rhs, env);
  }

  async _evalCall(node, env) {
    const callee = await this._eval(node.callee, env);
    const args   = await Promise.all(node.args.map(a => this._eval(a, env)));

    if (!callee) {
      throw new CRuntimeError(`'${node.callee.name ?? '?'}' no es una función`, node.loc?.line, node.loc?.col);
    }

    if (callee.builtin) {
      // Las funciones de stdlib pueden ser async (scanf, getchar...)
      return await callee.value(args, this, env);
    }

    if (callee.type === 'function' && callee.value) {
      return this._callFunction(callee.value, args, node.loc);
    }

    if (callee.type === 'FunctionDecl') {
      return this._callFunction(callee, args, node.loc);
    }

    throw new CRuntimeError(`'${node.callee.name ?? '?'}' no es una función`, node.loc?.line, node.loc?.col);
  }

  async _callFunction(decl, args, loc) {
    if (!decl || !decl.params) {
      throw new CRuntimeError('Función inválida', loc?.line, loc?.col);
    }

    this.callStack.push({ name: decl.name, line: loc?.line ?? decl.loc?.line });

    const funcEnv = new Environment(this.globalEnv);
    const sp = this.memory.saveStackPointer();

    try {
      for (let i = 0; i < decl.params.length; i++) {
        const param = decl.params[i];
        const val   = args[i] ?? 0;

        const isArrayParam = param.arrayDims && param.arrayDims.length > 0;
        const type = (param.pointer > 0 || isArrayParam)
          ? param.typeSpec + '*'.repeat(Math.max(param.pointer, 1))
          : param.typeSpec;

        const slotSize = sizeOf(isArrayParam || param.pointer > 0 ? 'pointer' : type);
        let address = null;
        if (slotSize > 0) {
          address = this.memory.stackAlloc(slotSize);
          this.memory.write(address, isArrayParam || param.pointer > 0 ? 'int' : type, val);
        }

        funcEnv.define(param.name ?? `__arg${i}`, {
          type, value: val, address,
          pointer:  param.pointer + (isArrayParam ? 1 : 0),
          arrayDims: isArrayParam ? param.arrayDims : null,
        });
      }

      await this._execBlock(decl.body, funcEnv);
      return 0;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value ?? 0;
      throw e;
    } finally {
      this.memory.restoreStackPointer(sp);
      this.callStack.pop();
    }
  }

  async _heartbeat(node) {
    if (this._aborted) {
      throw new CRuntimeError(
        'Ejecución detenida por el usuario',
        node?.loc?.line,
        node?.loc?.col
      );
    }

    this._stepCount += 1;
    if (this._stepCount > this._maxSteps) {
      throw new CRuntimeError(
        'Ejecución detenida: posible bucle infinito o exceso de pasos',
        node?.loc?.line,
        node?.loc?.col
      );
    }

    if (this._stepCount % this._yieldEvery === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  requestStop() {
    this._aborted = true;
  }

  async _evalIndex(node, env) {
    const base  = await this._eval(node.object, env);
    const index = await this._eval(node.index,  env);
    if (base === 0) throw new CRuntimeError('Null pointer dereference', node.loc?.line, node.loc?.col);
    const sym      = node.object.name ? env.lookup(node.object.name) : null;
    const elemType = sym ? sym.type.replace(/\*$/, '').trim() : 'int';
    const elemSize = sizeOf(elemType);
    return this.memory.read(base + index * elemSize, elemType);
  }

  async _evalMember(node, env) {
    throw new CRuntimeError('Acceso a miembro de struct aún no implementado', node.loc?.line, node.loc?.col);
  }

  async _evalCast(node, env) {
    const val  = await this._eval(node.operand, env);
    const type = node.targetType.pointer > 0
      ? node.targetType.base + '*'.repeat(node.targetType.pointer)
      : node.targetType.base;
    return coerce(val, type);
  }

  async _evalSizeof(node, env) {
    if (node.ofType) {
      const type = node.ofType.pointer > 0
        ? node.ofType.base + '*'.repeat(node.ofType.pointer)
        : node.ofType.base;
      return sizeOf(type);
    }
    return 4;
  }

  // ── Helpers de asignación y lvalue ───────────────────────────────────

  async _assign(lvalueNode, value, env) {
    if (lvalueNode.type === 'Identifier') {
      const sym = env.lookup(lvalueNode.name);
      if (!sym) throw new CRuntimeError(`'${lvalueNode.name}' no declarado`, lvalueNode.loc?.line, lvalueNode.loc?.col);
      const coerced = coerce(value, sym.type);
      sym.value = coerced;
      if (sym.address !== null && sym.address !== undefined) {
        this.memory.write(sym.address, sym.type, coerced);
      }
      return coerced;
    }
    if (lvalueNode.type === 'UnaryExpr' && lvalueNode.op === '*') {
      const addr = await this._eval(lvalueNode.operand, env);
      if (addr === 0) throw new CRuntimeError('Null pointer dereference');
      this.memory.write(addr, 'int', value);
      return value;
    }
    if (lvalueNode.type === 'IndexExpr') {
      const base     = await this._eval(lvalueNode.object, env);
      const index    = await this._eval(lvalueNode.index,  env);
      const sym      = lvalueNode.object.name ? env.lookup(lvalueNode.object.name) : null;
      const elemType = sym ? sym.type.replace(/\*$/, '').trim() : 'int';
      const elemSize = sizeOf(elemType);
      const coerced  = coerce(value, elemType);
      this.memory.write(base + index * elemSize, elemType, coerced);
      return coerced;
    }
    throw new CRuntimeError(`No es un lvalue válido: ${lvalueNode.type}`, lvalueNode.loc?.line, lvalueNode.loc?.col);
  }

  async _addressOf(node, env) {
    if (node.type === 'Identifier') {
      const sym = env.lookup(node.name);
      if (!sym) throw new CRuntimeError(`'${node.name}' no declarado`);
      if (sym.address === null || sym.address === undefined) {
        throw new CRuntimeError(`'${node.name}' no tiene dirección de memoria`);
      }
      return sym.address;
    }
    if (node.type === 'IndexExpr') {
      const base     = await this._eval(node.object, env);
      const index    = await this._eval(node.index,  env);
      const sym      = node.object.name ? env.lookup(node.object.name) : null;
      const elemType = sym ? sym.type.replace(/\*$/, '').trim() : 'int';
      return base + index * sizeOf(elemType);
    }
    throw new CRuntimeError(`No se puede tomar la dirección de este nodo: ${node.type}`);
  }

  _isTruthy(value) {
    return value !== 0 && value !== null && value !== undefined && value !== false;
  }
}

export class ExitSignal {
  constructor(code) { this.code = code; }
}
