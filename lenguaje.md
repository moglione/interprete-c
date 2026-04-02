# Alcance del Lenguaje C Soportado

Este documento detalla qué subconjunto de C99 interpreta el intérprete, qué está parcialmente implementado y qué no está soportado. Es útil para entender las limitaciones al escribir programas educativos.

---

## ✅ Totalmente Soportado

### Tipos de datos básicos

| Tipo | Notas |
|------|-------|
| `int` | 32 bits, con signo |
| `unsigned int` | 32 bits, sin signo |
| `short`, `unsigned short` | 16 bits |
| `char`, `unsigned char` | 8 bits |
| `long`, `unsigned long` | Tratado como `int` (32 bits) |
| `float` | 32 bits IEEE 754 |
| `double` | 64 bits IEEE 754 |
| `void` | Solo como tipo de retorno de funciones |

### Variables

```c
int x;                    // declaración sin inicialización (vale 0)
int a = 5, b = 10;        // declaración múltiple
int arr[10];              // array con dimensión explícita
int arr[] = {1, 2, 3};   // array con dimensión inferida del inicializador
char str[50] = "hola";   // string a char array
char nombre[] = "mundo"; // dimensión inferida de la cadena
int mat[3][3];            // arrays multidimensionales (básico)
```

### Punteros

```c
int *p = &x;         // puntero a variable
*p = 42;             // deref escritura
int v = *p;          // deref lectura
p++;                 // aritmética de punteros
int arr[] = {1,2,3};
int *q = arr;        // array decae a puntero
q[2];                // subscript via puntero
```

### Operadores

| Categoría | Operadores |
|-----------|-----------|
| Aritméticos | `+`, `-`, `*`, `/`, `%` |
| Relacionales | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Lógicos | `&&`, `\|\|`, `!` |
| Bit a bit | `&`, `\|`, `^`, `~`, `<<`, `>>` |
| Asignación | `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, `>>=` |
| Incremento | `++i`, `i++`, `--i`, `i--` |
| Ternario | `a ? b : c` |
| Coma | `a, b` (en expresiones) |
| Dirección / Deref | `&x`, `*p` |
| Subscript | `arr[i]` |
| Cast | `(int)x`, `(float)n` |
| Sizeof | `sizeof(int)`, `sizeof(x)` |

### Estructuras de control

```c
// Condicionales
if (cond) { ... }
if (cond) { ... } else { ... }
if (...) else if (...) else { ... }

// Bucles
while (cond) { ... }
do { ... } while (cond);
for (init; cond; update) { ... }

// Switch
switch (expr) {
    case 1:  ...; break;
    case 2:  ...; break;
    default: ...;
}

// Saltos
return expr;
break;
continue;
goto label;
label: sentencia;
```

### Funciones

```c
// Definición
int suma(int a, int b) {
    return a + b;
}

// Recursión
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

// Arrays como parámetros (pasan por puntero)
void llenar(int arr[], int n) { ... }

// Punteros como parámetros
void swap(int *a, int *b) { ... }

// Sin retorno
void mostrar(int x) {
    printf("%d\n", x);
}
```

### Preprocesador

```c
#include <stdio.h>         // activa funciones stdio
#include <stdlib.h>        // activa funciones stdlib
#include <string.h>        // activa funciones string
#include <math.h>          // activa funciones math
#include <ctype.h>         // activa funciones ctype

#define PI 3.14159
#define MAX(a,b) ((a)>(b)?(a):(b))
#define TAMANIO 100

#ifdef DEBUG
    printf("debug\n");
#endif

// Comentarios // y /* */
```

### Librería estándar — `<stdio.h>`

| Función | Descripción |
|---------|-------------|
| `printf(fmt, ...)` | Salida formateada. Soporta `%d %i %u %f %e %g %c %s %x %X %o %p %%` con flags `-+0 #`, width y precision |
| `scanf(fmt, &var, ...)` | Entrada desde consola (interactiva, pausa la ejecución) |
| `putchar(c)` | Imprime un carácter |
| `getchar()` | Lee un carácter desde consola |
| `puts(str)` | Imprime string + `\n` |
| `gets(buf)` | Lee línea (sin límite, usar con cuidado) |
| `fgets(buf, n, stdin)` | Lee línea con límite de n bytes |
| `sprintf(buf, fmt, ...)` | Formato a buffer de string |
| `sscanf(str, fmt, ...)` | Parsea un string con formato |
| `fprintf(stderr, ...)` | Igual que printf (stderr redirigido a stdout) |

### Librería estándar — `<stdlib.h>`

| Función | Descripción |
|---------|-------------|
| `malloc(n)` | Alloca n bytes en el heap |
| `calloc(n, size)` | Alloca y zeroinit |
| `realloc(ptr, n)` | Redimensiona un bloque |
| `free(ptr)` | Libera un bloque |
| `exit(code)` | Termina el programa |
| `abs(n)` | Valor absoluto entero |
| `atoi(str)` | String a int |
| `atof(str)` | String a float |
| `rand()` | Número pseudoaleatorio (LCG) |
| `srand(seed)` | Semilla del RNG |

### Librería estándar — `<string.h>`

`strlen`, `strcpy`, `strncpy`, `strcat`, `strncat`, `strcmp`, `strncmp`, `strchr`, `strrchr`, `strstr`, `memset`, `memcpy`, `memmove`, `memcmp`

### Librería estándar — `<math.h>`

`sqrt`, `pow`, `fabs`, `ceil`, `floor`, `round`, `fmod`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `log`, `log2`, `log10`, `exp`, `cbrt`

### Librería estándar — `<ctype.h>`

`isalpha`, `isdigit`, `isalnum`, `isspace`, `isupper`, `islower`, `isprint`, `ispunct`, `toupper`, `tolower`

---

## ⚠️ Parcialmente Soportado

### `long long` / `unsigned long long`
Reconocido por el lexer y parser, pero tratado internamente como `long` (32 bits). Para valores grandes puede haber pérdida de precisión.

```c
long long x = 1000000000LL;  // LL se ignora, trata como int
```

### Arrays multidimensionales
La declaración y acceso básico funciona, pero el cálculo de índices para más de 2 dimensiones puede no ser correcto en todos los casos.

```c
int mat[3][3];       // ✅ ok
mat[1][2] = 5;       // ✅ ok
int cubo[2][2][2];   // ⚠️ puede no funcionar correctamente
```

### `struct` y `union`
El parser reconoce la declaración de structs, pero el acceso a miembros (`.` y `->`) no está implementado en el intérprete.

```c
struct Punto { int x; int y; };   // ✅ se parsea
struct Punto p;
p.x = 10;                         // ❌ genera error en ejecución
```

### `typedef`
Reconocido por el parser pero con soporte limitado en el intérprete.

```c
typedef int Entero;   // ⚠️ puede no funcionar en todos los contextos
```

### Punteros a funciones
No implementados.

```c
int (*f)(int) = &suma;   // ❌ no soportado
```

### Inicializadores designados (C99)
No implementados.

```c
int arr[5] = {[2] = 10, [4] = 20};   // ❌ no soportado
struct Punto p = {.x = 1, .y = 2};   // ❌ no soportado
```

### Calificadores de tipo
Reconocidos pero ignorados en la semántica.

```c
const int MAX = 100;    // ✅ como int normal (const no se verifica)
volatile int reg;       // ✅ como int normal
static int contador;    // ⚠️ no persiste entre llamadas (ignorado)
```

### Operador `->` (acceso a struct via puntero)
No implementado (mismo caso que struct).

```c
p->x = 5;   // ❌ error en ejecución
```

---

## ❌ No Soportado

| Característica | Alternativa |
|----------------|-------------|
| `struct` / `union` (acceso a miembros) | Usar variables separadas |
| Punteros a funciones | No disponible |
| `enum` como tipo completo | Usar `#define` para constantes |
| Arrays de longitud variable (VLA) | Usar tamaño fijo o `malloc` |
| `va_list` / funciones variádicas propias | Solo `printf`/`scanf` built-in |
| Archivos (`fopen`, `fclose`, `fread`, ...) | No disponible |
| Threads (`pthreads`) | No disponible |
| Signals (`signal.h`) | No disponible |
| `setjmp` / `longjmp` | No disponible |
| Números complejos (`complex.h`) | No disponible |
| `wchar_t` / Unicode completo | Solo ASCII/UTF-8 básico |
| `#pragma` | Ignorado |
| `#include` de archivos propios | Solo headers estándar |
| `inline` functions | Ignorado (se ejecutan normal) |

---

## Semántica y Comportamiento

### Overflow de enteros
El intérprete simula el overflow de C: al asignar un valor fuera de rango, se trunca con la misma semántica de complemento a dos.

```c
unsigned char x = 300;   // x = 44  (300 % 256)
char y = 200;            // y = -56 (200 - 256)
```

### División entera
La división entre dos enteros es entera (truncada hacia cero), igual que en C.

```c
int a = 7 / 2;    // a = 3, no 3.5
int b = -7 / 2;   // b = -3 (trunca hacia cero)
```

### Arrays y punteros
En C, el nombre de un array como argumento de función decae a puntero a su primer elemento. El intérprete respeta esta semántica: los cambios a `arr[i]` dentro de una función modifican el array original.

### Strings
Las strings literales (`"hola"`) se internan en una zona de memoria de solo lectura (aunque el intérprete no verifica escrituras sobre ellas). Los arrays de `char` inicializados con string son modificables.

### Memoria dinámica
`malloc` opera sobre un heap simulado dentro del mismo buffer de 1 MB. Si el heap y el stack colisionan, se genera un error de memoria. El intérprete no detecta memory leaks, igual que C.

### Recursión
Limitada por el tamaño del stack del intérprete JS (normalmente cientos de miles de llamadas). No hay límite artificial adicional.

---

## Programa C válido mínimo

```c
#include <stdio.h>

int main() {
    // código aquí
    return 0;
}
```

La función `main` **es obligatoria**. El intérprete busca `main()` en el entorno global para arrancar la ejecución.
