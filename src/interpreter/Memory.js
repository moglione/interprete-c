/**
 * Memory.js — Simulación de memoria C con ArrayBuffer
 *
 * Modela la memoria de un proceso C:
 *   - Stack: crece desde el FINAL del buffer hacia abajo (como en x86-64)
 *   - Heap:  crece desde el INICIO del buffer hacia arriba
 *   - Un "gap" en el medio actúa como guardia (stack overflow detection)
 *
 * Los punteros son índices numéricos (byte offset) dentro del ArrayBuffer.
 * DataView se usa para leer/escribir valores de distintos tipos.
 *
 * Tamaño por defecto: 1 MB (configurable)
 */

import { sizeOf, isFloat } from './CTypes.js';
import { CRuntimeError } from '../errors/CError.js';

const DEFAULT_SIZE = 1024 * 1024; // 1 MB

export class Memory {
  constructor(size = DEFAULT_SIZE) {
    this.size   = size;
    this.buffer = new ArrayBuffer(size);
    this.view   = new DataView(this.buffer);

    // El heap crece hacia arriba desde la dirección 8 (reservamos la 0 como NULL)
    this.heapTop = 8;
    // El stack crece hacia abajo desde el final
    this.stackTop = size;

    // Lista de bloques del heap para malloc/free
    // Cada bloque: { address, size, free }
    this.heapBlocks = [];

    // Mapa de strings internados: string JS → dirección en memoria
    this.stringPool = new Map();
  }

  // ── Null pointer ────────────────────────────────────────────────────
  get NULL() { return 0; }

  // ── Stack ────────────────────────────────────────────────────────────

  /**
   * Reserva 'size' bytes en el stack, devuelve la dirección base.
   * El stack pointer baja.
   */
  stackAlloc(size, align = 8) {
    // Alinear size al múltiplo de align más cercano
    size = Math.ceil(size / align) * align;
    this.stackTop -= size;
    if (this.stackTop <= this.heapTop) {
      throw new CRuntimeError('Stack overflow: el stack colisionó con el heap');
    }
    // Inicializar a 0 (como calloc)
    new Uint8Array(this.buffer).fill(0, this.stackTop, this.stackTop + size);
    return this.stackTop;
  }

  /**
   * Libera 'size' bytes del stack (sube el stack pointer).
   */
  stackFree(size, align = 8) {
    size = Math.ceil(size / align) * align;
    this.stackTop += size;
  }

  /**
   * Guarda y restaura el stack pointer (para entrar/salir de frames de función).
   */
  saveStackPointer()    { return this.stackTop; }
  restoreStackPointer(sp) { this.stackTop = sp; }

  // ── Heap (malloc / free) ─────────────────────────────────────────────

  /**
   * Simula malloc: busca bloque libre o extiende el heap.
   * Devuelve la dirección del bloque o 0 (NULL) si falla.
   */
  malloc(size) {
    if (size <= 0) return this.NULL;
    const aligned = Math.ceil(size / 8) * 8;

    // First-fit de bloques libres
    for (const blk of this.heapBlocks) {
      if (blk.free && blk.size >= aligned) {
        blk.free = false;
        blk.userSize = size;
        return blk.address;
      }
    }

    // Extender el heap
    const addr = this.heapTop;
    if (addr + aligned >= this.stackTop) {
      return this.NULL; // out of memory
    }
    this.heapBlocks.push({ address: addr, size: aligned, userSize: size, free: false });
    this.heapTop += aligned;
    new Uint8Array(this.buffer).fill(0, addr, addr + aligned);
    return addr;
  }

  /**
   * Simula calloc: malloc + inicializar a 0 (ya lo hace malloc).
   */
  calloc(count, size) {
    return this.malloc(count * size);
  }

  /**
   * Simula free.
   */
  free(address) {
    if (address === this.NULL) return;
    const blk = this.heapBlocks.find(b => b.address === address);
    if (!blk) throw new CRuntimeError(`free(): puntero inválido 0x${address.toString(16)}`);
    if (blk.free) throw new CRuntimeError(`free(): doble liberación de 0x${address.toString(16)}`);
    blk.free = true;
    // Simple coalescing de bloques adyacentes
    this._coalesceHeap();
  }

  /**
   * Simula realloc.
   */
  realloc(address, newSize) {
    if (address === this.NULL) return this.malloc(newSize);
    const blk = this.heapBlocks.find(b => b.address === address && !b.free);
    if (!blk) throw new CRuntimeError(`realloc(): puntero inválido`);
    if (newSize <= blk.size) {
      blk.userSize = newSize;
      return address;
    }
    const newAddr = this.malloc(newSize);
    if (newAddr === this.NULL) return this.NULL;
    // Copiar los datos del bloque viejo
    new Uint8Array(this.buffer).copyWithin(newAddr, address, address + blk.userSize);
    this.free(address);
    return newAddr;
  }

  _coalesceHeap() {
    // Ordenar por dirección y unir bloques libres adyacentes
    this.heapBlocks.sort((a, b) => a.address - b.address);
    for (let i = 0; i < this.heapBlocks.length - 1; ) {
      const a = this.heapBlocks[i];
      const b = this.heapBlocks[i + 1];
      if (a.free && b.free && a.address + a.size === b.address) {
        a.size += b.size;
        this.heapBlocks.splice(i + 1, 1);
      } else {
        i++;
      }
    }
    // Actualizar heapTop
    if (this.heapBlocks.length > 0) {
      const last = this.heapBlocks[this.heapBlocks.length - 1];
      if (last.free) {
        this.heapTop = last.address;
        this.heapBlocks.pop();
      }
    }
  }

  // ── Strings ──────────────────────────────────────────────────────────

  /**
   * Internacionaliza un string JS, copiándolo en memoria como bytes C (con \0 al final).
   * Devuelve la dirección del string.
   */
  internString(str) {
    if (this.stringPool.has(str)) return this.stringPool.get(str);
    // Usamos el heap para string literals (zona de datos)
    const bytes = new TextEncoder().encode(str);
    const addr  = this.malloc(bytes.length + 1);
    const mem   = new Uint8Array(this.buffer);
    mem.set(bytes, addr);
    mem[addr + bytes.length] = 0; // \0
    this.stringPool.set(str, addr);
    return addr;
  }

  /**
   * Lee un string C desde la memoria (hasta el primer \0).
   */
  readString(address) {
    if (address === this.NULL) return '(null)';
    const bytes = new Uint8Array(this.buffer);
    let i = address;
    const chars = [];
    while (i < this.size && bytes[i] !== 0) {
      chars.push(bytes[i]);
      i++;
    }
    return new TextDecoder().decode(new Uint8Array(chars));
  }

  /**
   * Escribe un string JS en memoria (sin terminar en \0, eso es responsabilidad del caller).
   */
  writeString(address, str) {
    const bytes = new TextEncoder().encode(str);
    const mem   = new Uint8Array(this.buffer);
    mem.set(bytes, address);
    return bytes.length;
  }

  // ── Lectura y escritura de valores tipados ───────────────────────────

  /**
   * Lee un valor del tipo dado desde la dirección dada.
   */
  read(address, type) {
    this._checkBounds(address, sizeOf(type));
    const le = true; // little-endian
    switch (type) {
      case 'char':
      case 'signed char':  return this.view.getInt8(address);
      case 'unsigned char':return this.view.getUint8(address);
      case 'short':
      case 'signed short': return this.view.getInt16(address, le);
      case 'unsigned short':return this.view.getUint16(address, le);
      case 'int':
      case 'signed':
      case 'signed int':   return this.view.getInt32(address, le);
      case 'unsigned':
      case 'unsigned int': return this.view.getUint32(address, le);
      case 'long':
      case 'long int':
      case 'long long':    return Number(this.view.getBigInt64(address, le));
      case 'unsigned long':
      case 'unsigned long long': return Number(this.view.getBigUint64(address, le));
      case 'float':        return this.view.getFloat32(address, le);
      case 'double':
      case 'long double':  return this.view.getFloat64(address, le);
      case '_Bool':        return this.view.getUint8(address) !== 0 ? 1 : 0;
      default:
        // Puntero o tipo desconocido: leer como uint32
        if (type.includes('*')) return this.view.getUint32(address, le);
        return this.view.getInt32(address, le);
    }
  }

  /**
   * Escribe un valor del tipo dado en la dirección dada.
   */
  write(address, type, value) {
    this._checkBounds(address, sizeOf(type));
    const le = true;
    value = +value; // asegurar número JS
    switch (type) {
      case 'char':
      case 'signed char':  this.view.setInt8(address, value); break;
      case 'unsigned char':this.view.setUint8(address, value); break;
      case 'short':
      case 'signed short': this.view.setInt16(address, value, le); break;
      case 'unsigned short':this.view.setUint16(address, value, le); break;
      case 'int':
      case 'signed':
      case 'signed int':   this.view.setInt32(address, value, le); break;
      case 'unsigned':
      case 'unsigned int': this.view.setUint32(address, value, le); break;
      case 'long':
      case 'long int':
      case 'long long':    this.view.setBigInt64(address, BigInt(Math.trunc(value)), le); break;
      case 'unsigned long':
      case 'unsigned long long': this.view.setBigUint64(address, BigInt(Math.abs(Math.trunc(value))), le); break;
      case 'float':        this.view.setFloat32(address, value, le); break;
      case 'double':
      case 'long double':  this.view.setFloat64(address, value, le); break;
      case '_Bool':        this.view.setUint8(address, value !== 0 ? 1 : 0); break;
      default:
        if (type.includes('*')) this.view.setUint32(address, value, le);
        else this.view.setInt32(address, value, le);
    }
  }

  // ── Memset / Memcpy ──────────────────────────────────────────────────

  memset(address, byteValue, count) {
    this._checkBounds(address, count);
    new Uint8Array(this.buffer).fill(byteValue & 0xFF, address, address + count);
  }

  memcpy(dst, src, count) {
    this._checkBounds(dst, count);
    this._checkBounds(src, count);
    new Uint8Array(this.buffer).copyWithin(dst, src, src + count);
  }

  memmove(dst, src, count) {
    // copyWithin ya maneja solapamiento correctamente
    this.memcpy(dst, src, count);
  }

  // ── Snapshot para UI ─────────────────────────────────────────────────

  /**
   * Retorna un mapa de los bloques del heap para la UI del memory viewer.
   */
  heapSnapshot() {
    return this.heapBlocks.map(b => ({ ...b }));
  }

  // ── Privados ─────────────────────────────────────────────────────────

  _checkBounds(address, size) {
    if (address < 0 || address + size > this.size) {
      throw new CRuntimeError(
        `Acceso a memoria fuera de rango: dirección 0x${address.toString(16)}, tamaño ${size}`
      );
    }
  }
}
