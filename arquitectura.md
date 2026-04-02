# Arquitectura del Intérprete C99

## Visión General

El intérprete es un **evaluador de AST** (*Abstract Syntax Tree*) escrito en JavaScript puro (ES Modules), sin bundler ni dependencias de compilación. Se sirve directamente desde XAMPP como archivos estáticos.

---

## Pipeline de Ejecución

```
Código fuente C
      │
      ▼
┌─────────────────┐
│  Preprocessor   │  Fase 0 — Directivas del preprocesador
└────────┬────────┘
         │  código C limpio (sin #define, sin comentarios)
         ▼
┌─────────────────┐
│     Lexer       │  Fase 1 — Análisis léxico
└────────┬────────┘
         │  stream de Tokens (TT.INT, TT.IDENT, TT.PLUS, ...)
         ▼
┌─────────────────┐
│     Parser      │  Fase 2 — Análisis sintáctico
└────────┬────────┘
         │  AST (árbol de nodos: FunctionDecl, ForStmt, BinaryExpr, ...)
         ▼
┌─────────────────┐
│  Interpreter    │  Fase 3 — Evaluación del AST
│   + StdLib      │
│   + Memory      │
│   + Environment │
└────────┬────────┘
         │  salida por stdout / espera stdin
         ▼
      Consola UI
```

---

## Módulos

### `src/preprocessor/Preprocessor.js`
Transforma el código fuente antes del análisis léxico.

| Función | Detalle |
|---------|---------|
| Eliminar comentarios | `//` y `/* */` |
| `#define` simple | `#define PI 3.14159` |
| `#define` con argumentos | `#define MAX(a,b) ((a)>(b)?(a):(b))` |
| `#ifdef` / `#ifndef` / `#else` / `#endif` | Compilación condicional |
| `#include` | Detecta headers estándar (`<stdio.h>`, etc.) para activar el stdlib correspondiente |
| Continuación de línea | `\` al final de línea |

Produce: `{ code: string, includedLibs: Set<string> }`

---

### `src/lexer/Lexer.js` + `TokenTypes.js`
Convierte el texto C en una secuencia de tokens.

- **Literales:** enteros (decimal, hex `0x`, octal `0`), floats (con exponente `1.5e3`), chars (`'a'`, `'\n'`), strings (`"hola"` con escapes)
- **Operadores:** todos los de C99, incluyendo `<<`, `>>`, `->`, `++`, `--`, `?:`
- **Keywords:** `int`, `float`, `char`, `void`, `if`, `else`, `while`, `for`, `do`, `return`, `struct`, `typedef`, `sizeof`, etc.
- Registra **línea y columna** de cada token para mensajes de error precisos.

---

### `src/parser/Parser.js` + `AST.js`
Parser **recursivo descendente** con **Pratt parsing** para expresiones.

**Declaraciones** parseadas:
- Variables simples, múltiples declaradores (`int a, b = 3;`)
- Arrays con y sin dimensión (`int arr[10]`, `int arr[] = {1,2,3}`)
- Punteros (`int *p`, `char **argv`)
- Funciones con parámetros y tipo de retorno

**Sentencias:**
`if/else`, `while`, `do/while`, `for`, `switch/case/default`, `return`, `break`, `continue`, `goto`/`label`, bloques `{}`

**Expresiones** (con precedencia C99 correcta):
- Aritméticas, relacionales, lógicas, bit a bit
- Asignación compuesta (`+=`, `-=`, `&=`, ...)
- Pre/postfijo (`++i`, `i++`)
- Ternario (`a ? b : c`)
- Cast explícito `(int)x`
- `sizeof(tipo)` y `sizeof(expr)`
- Llamadas a función, subscript `arr[i]`, acceso a struct (`.`, `->`)

---

### `src/interpreter/Interpreter.js`
Evaluador del AST usando el patrón **visitor**. Todas las funciones son `async` para permitir que `scanf`/`getchar` esperen entrada real del usuario sin bloquear el hilo.

**Control de flujo:**

| Señal JS | Corresponde a |
|----------|--------------|
| `ReturnSignal` | `return expr;` |
| `BreakSignal` | `break;` |
| `ContinueSignal` | `continue;` |
| `GotoSignal(label)` | `goto label;` |
| `ExitSignal(code)` | `exit(n)` desde stdlib |

**Scoping:** léxico estático. Cada llamada a función crea un `Environment` hijo del `globalEnv`, no del entorno del llamador.

---

### `src/interpreter/Memory.js`
Simula la memoria de C usando un `ArrayBuffer` de **1 MB**.

```
Dirección 0                                        1 MB
├──────────────────────────────┬──────────────────┤
│          HEAP (↑ crece)      │   STACK (↓ crece) │
│  malloc/calloc/realloc/free  │  variables locales │
└──────────────────────────────┴──────────────────┘
```

- **Stack:** `stackAlloc(n)` alinea a 8 bytes y mueve el puntero hacia abajo. `saveStackPointer` / `restoreStackPointer` implementan los frames de función.
- **Heap:** lista enlazada de bloques con cabecera `{ size, used, next }`. `free()` hace coalescing de bloques adyacentes libres.
- **Strings internos:** tabla de strings constantes en zona baja del heap.
- **DataView** tipado: `read(addr, 'int')` / `write(addr, 'float', val)` con detección de acceso fuera de rango.

---

### `src/interpreter/Environment.js`
Tabla de símbolos con **scope chain** léxico.

```
globalEnv  { printf, malloc, main, bubbleSort, ... }
    └── funcEnv  { i, j, temp, arr, n }
            └── blockEnv  { ... }
```

Cada símbolo almacena: `{ type, value, address, pointer, arrayDims }`.

---

### `src/interpreter/CTypes.js`
Sistema de tipos de C99.

| Tipo | Bytes | Rango |
|------|-------|-------|
| `char` | 1 | -128 … 127 |
| `unsigned char` | 1 | 0 … 255 |
| `short` | 2 | -32768 … 32767 |
| `int` | 4 | -2³¹ … 2³¹-1 |
| `unsigned int` | 4 | 0 … 2³²-1 |
| `long` | 4 | igual a `int` (simplificado) |
| `float` | 4 | IEEE 754 simple |
| `double` | 8 | IEEE 754 doble |
| `pointer` | 4 | dirección en el ArrayBuffer |

Implementa `coerce(value, type)` con overflow/truncación (comportamiento C) y `usualArithmeticConversion` (promoción de tipos en expresiones mixtas).

---

### `src/stdlib/StdLib.js`
Implementaciones en JS de las funciones de la librería estándar de C.

| Header | Funciones |
|--------|-----------|
| `<stdio.h>` | `printf`, `fprintf`, `sprintf`, `snprintf`, `scanf`, `sscanf`, `putchar`, `getchar`, `puts`, `gets`, `fgets` |
| `<stdlib.h>` | `malloc`, `calloc`, `realloc`, `free`, `exit`, `abort`, `abs`, `atoi`, `atof`, `rand`, `srand` |
| `<string.h>` | `strlen`, `strcpy`, `strncpy`, `strcat`, `strncat`, `strcmp`, `strncmp`, `strchr`, `strrchr`, `strstr`, `memset`, `memcpy`, `memmove`, `memcmp` |
| `<math.h>` | `sqrt`, `pow`, `fabs`, `ceil`, `floor`, `round`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `log`, `log2`, `log10`, `exp`, `cbrt`, `fmod` |
| `<ctype.h>` | `isalpha`, `isdigit`, `isalnum`, `isspace`, `isupper`, `islower`, `isprint`, `ispunct`, `toupper`, `tolower` |

`printf` soporta: `%d`, `%i`, `%u`, `%o`, `%x`, `%X`, `%f`, `%e`, `%g`, `%c`, `%s`, `%p`, `%%`, con flags (`-`, `+`, `0`, ` `, `#`), width y precision.

---

### `src/main.js`
Punto de entrada de la UI. Conecta el editor con el pipeline:

1. Crea el editor **CodeMirror 6** (cargado desde CDN via `importmap`)
2. Al presionar **Ejecutar**: pasa el código por Preprocessor → Lexer → Parser → Interpreter
3. `stdout` → renderiza spans en `#console-output`
4. `stdin` → Promise que se resuelve cuando el usuario escribe en `stdin >` y presiona Enter

---

### `index.html`
UI de una sola página con:
- Toolbar: selector de ejemplos + botón Ejecutar + Limpiar consola
- Panel izquierdo: editor CodeMirror 6 (tema One Dark, sintaxis C)
- Panel derecho: consola de salida con colores por tipo (`stdout`, `stdin`, `error`, `info`)
- Panel inferior: campo `stdin >` para entrada interactiva

---

## Flujo de entrada interactiva (scanf)

```
Programa C llama scanf()
      │
      ▼ (stdlib)
await interp.stdin('scanf')   ← pausa el intérprete (async)
      │
      ├── ¿hay algo en inputQueue?  → devuelve el valor inmediatamente
      │
      └── No → muestra "[Esperando entrada…]"
               → foco al campo stdin >
               → retorna new Promise(resolve => pendingInput = resolve)
                          │
          Usuario escribe y presiona Enter
                          │
               doSendInput() llama pendingInput(valor)
                          │
               Promise resuelta → intérprete continúa
```

---

## Estructura de archivos

```
interprete c/
├── index.html              ← UI principal
├── arquitectura.md         ← este archivo
├── lenguaje.md             ← alcance del lenguaje soportado
└── src/
    ├── main.js
    ├── errors/
    │   └── CError.js
    ├── preprocessor/
    │   └── Preprocessor.js
    ├── lexer/
    │   ├── TokenTypes.js
    │   └── Lexer.js
    ├── parser/
    │   ├── AST.js
    │   └── Parser.js
    ├── interpreter/
    │   ├── CTypes.js
    │   ├── Environment.js
    │   ├── Memory.js
    │   └── Interpreter.js
    └── stdlib/
        └── StdLib.js
```
