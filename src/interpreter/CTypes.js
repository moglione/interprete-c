/**
 * CTypes.js — Sistema de tipos de C99
 *
 * Define tamaños en bytes, coerciones entre tipos y operaciones sobre valores.
 * Los valores C se representan en JS como números normales; las reglas de
 * coerción se aplican explícitamente al leer/escribir en memoria y al operar.
 */

// ── Tamaños de tipos en bytes (LP64 / modelo típico de 64-bit) ─────────
export const TYPE_SIZES = {
  'char':               1,
  'signed char':        1,
  'unsigned char':      1,
  'short':              2,
  'short int':          2,
  'signed short':       2,
  'unsigned short':     2,
  'int':                4,
  'signed int':         4,
  'signed':             4,
  'unsigned int':       4,
  'unsigned':           4,
  'long':               8,
  'long int':           8,
  'signed long':        8,
  'unsigned long':      8,
  'long long':          8,
  'long long int':      8,
  'signed long long':   8,
  'unsigned long long': 8,
  'float':              4,
  'double':             8,
  'long double':        8,
  '_Bool':              1,
  'pointer':            8,  // puntero genérico
  'void':               0,
};

// ── Rangos de tipos enteros ───────────────────────────────────────────
export const TYPE_RANGES = {
  'char':               { min: -128,           max: 127,          unsigned: false },
  'signed char':        { min: -128,           max: 127,          unsigned: false },
  'unsigned char':      { min: 0,              max: 255,          unsigned: true  },
  'short':              { min: -32768,         max: 32767,        unsigned: false },
  'unsigned short':     { min: 0,              max: 65535,        unsigned: true  },
  'int':                { min: -2147483648,    max: 2147483647,   unsigned: false },
  'unsigned int':       { min: 0,              max: 4294967295,   unsigned: true  },
  'unsigned':           { min: 0,              max: 4294967295,   unsigned: true  },
  '_Bool':              { min: 0,              max: 1,            unsigned: true  },
};

// ── Tipos flotantes ───────────────────────────────────────────────────
export const FLOAT_TYPES = new Set(['float', 'double', 'long double']);
export const INT_TYPES = new Set([
  'char','signed char','unsigned char',
  'short','short int','signed short','unsigned short',
  'int','signed','signed int','unsigned','unsigned int',
  'long','long int','signed long','unsigned long',
  'long long','long long int','signed long long','unsigned long long',
  '_Bool',
]);

export function isFloat(type)   { return FLOAT_TYPES.has(normalizeType(type)); }
export function isInt(type)     { return INT_TYPES.has(normalizeType(type)); }
export function isPointer(type) { return type.includes('*'); }
export function isUnsigned(type){ return normalizeType(type).startsWith('unsigned') || type === '_Bool'; }

/**
 * Normaliza alias de tipos: quita 'signed', colapsa espacios múltiples.
 */
export function normalizeType(type) {
  return type
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^signed (?=int|$)/, '') || 'int';
}

/**
 * Tamaño en bytes de un tipo, incluyendo punteros.
 */
export function sizeOf(type) {
  if (isPointer(type)) return TYPE_SIZES['pointer'];
  const norm = normalizeType(type);
  return TYPE_SIZES[norm] ?? TYPE_SIZES['int']; // fallback a int
}

/**
 * Coerciona 'value' al tipo 'type' respetando truncamiento y overflow C99.
 */
export function coerce(value, type) {
  if (isPointer(type)) return value >>> 0; // dirección como entero sin signo
  if (isFloat(type)) {
    if (type === 'float') {
      // Simular precisión simple (32-bit): usar Float32Array para redondear
      const buf = new Float32Array(1);
      buf[0] = value;
      return buf[0];
    }
    return +value; // double
  }
  if (type === '_Bool') return value !== 0 ? 1 : 0;

  // Tipos enteros: truncar según el tamaño y aplicar signo
  const range = TYPE_RANGES[normalizeType(type)];
  if (!range) return value | 0;

  const size = sizeOf(type);
  const bits = size * 8;

  if (range.unsigned) {
    // Mask al rango unsigned: value mod 2^bits
    const mod = Math.pow(2, bits);
    return ((value % mod) + mod) % mod;
  } else {
    // Signo: mapeamos al rango [-2^(bits-1), 2^(bits-1)-1]
    const mod  = Math.pow(2, bits);
    const half = mod / 2;
    let v = ((value % mod) + mod) % mod;
    if (v >= half) v -= mod;
    return v;
  }
}

/**
 * Determina el tipo resultado de una operación binaria (Usual Arithmetic Conversions de C99).
 */
export function usualArithmeticConversion(typeA, typeB) {
  if (isFloat(typeA) || isFloat(typeB)) {
    if (typeA === 'long double' || typeB === 'long double') return 'long double';
    if (typeA === 'double'      || typeB === 'double')      return 'double';
    return 'float';
  }
  // Integer promotions
  if (typeA === 'long long' || typeB === 'long long') return 'long long';
  if (typeA === 'unsigned long long' || typeB === 'unsigned long long') return 'unsigned long long';
  if (typeA === 'long' || typeB === 'long') return 'long';
  if (typeA === 'unsigned long' || typeB === 'unsigned long') return 'unsigned long';
  if (typeA === 'unsigned int'  || typeB === 'unsigned int')  return 'unsigned int';
  return 'int';
}
