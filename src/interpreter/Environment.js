/**
 * Environment.js — Entornos de ejecución (Scopes / Tabla de símbolos)
 *
 * Cada Environment representa un scope léxico de C.
 * Al entrar a un bloque '{ }', se crea un Environment hijo que puede
 * acceder al padre (scope chain), pero lo que se define en él no escapa.
 *
 * Cada símbolo guarda:
 *   { type, pointer, arrayDims, value, address }
 *   - value:   el valor JS actual (para variables simples y punteros)
 *   - address: la dirección en la memoria simulada (si aplica)
 */

import { CRuntimeError } from '../errors/CError.js';

export class Environment {
  /**
   * @param {Environment|null} parent — Scope padre (null = scope global)
   */
  constructor(parent = null) {
    this.parent  = parent;
    this.symbols = new Map(); // name → symbol
  }

  /**
   * Declara una nueva variable en el scope actual.
   * Lanza error si ya existe en el mismo scope.
   */
  define(name, symbol) {
    if (this.symbols.has(name)) {
      // Redefinición en el mismo scope: warning silencioso (como GCC con -w)
    }
    this.symbols.set(name, symbol);
    return symbol;
  }

  /**
   * Busca una variable recorriendo la cadena de scopes.
   */
  lookup(name) {
    if (this.symbols.has(name)) return this.symbols.get(name);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  /**
   * Asigna un valor a una variable ya declarada (en el scope donde fue definida).
   */
  assign(name, value) {
    if (this.symbols.has(name)) {
      this.symbols.get(name).value = value;
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new CRuntimeError(`Variable '${name}' no declarada`);
  }

  /**
   * Obtiene el valor actual de una variable.
   */
  get(name) {
    const sym = this.lookup(name);
    if (sym === null) throw new CRuntimeError(`Variable '${name}' no declarada`);
    return sym.value;
  }

  /**
   * Actualiza solo el campo .address de un símbolo.
   */
  setAddress(name, address) {
    const sym = this.lookup(name);
    if (sym) sym.address = address;
  }

  /**
   * Devuelve verdadero si el nombre está en el scope ACTUAL (no en el padre).
   */
  hasOwn(name) {
    return this.symbols.has(name);
  }

  /**
   * Crea un entorno hijo (al entrar a un bloque).
   */
  createChild() {
    return new Environment(this);
  }

  /** Para depuración: retorna un snapshot plano */
  snapshot() {
    const result = {};
    for (const [name, sym] of this.symbols) {
      result[name] = { type: sym.type, value: sym.value, address: sym.address };
    }
    return result;
  }
}
