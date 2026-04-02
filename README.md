# C-IDE

IDE web para aprender C con un editor en el navegador, consola simulada y soporte de librerias graficas.

## Que hace

- Editar codigo C desde el navegador
- Ejecutar programas con un interprete propio
- Mostrar salida en una consola integrada
- Pedir entrada interactiva con `scanf`
- Usar varias pestañas de archivos
- Cambiar el tamano de letra del editor
- Alternar entre tema claro y oscuro
- Dibujar con librerias graficas `tortuga.h` y `processing.h`
- Exportar un HTML standalone con el programa y el runtime embebido

## Como funciona

El flujo principal es:

`Preprocessor -> Lexer -> Parser -> Interpreter -> Consola`

La app esta hecha con JavaScript moderno usando ES Modules. El editor usa CodeMirror 6 y la interfaz se sirve como archivos estaticos.

## Estructura

- `index.html`: interfaz principal del IDE
- `src/main.js`: logica de la UI, pestañas, ejecucion y exportacion
- `src/preprocessor/`: manejo de `#include`, `#define` y otras directivas
- `src/lexer/`: analisis lexico
- `src/parser/`: analisis sintactico y AST
- `src/interpreter/`: evaluador del AST, memoria, entorno y tipos
- `src/stdlib/`: funciones de biblioteca estandar
- `src/graphics/`: soporte grafico
- `src/compiler/`: exportacion a HTML standalone
- `ejemplos/`: programas de ejemplo organizados por categoria

## Requisitos

- Un navegador moderno
- Un servidor local para servir archivos estaticos
- En este proyecto se usa XAMPP, pero cualquier servidor local sirve

## Como ejecutar

1. Copia el proyecto dentro de una carpeta servida por tu servidor local.
2. Abre `index.html` desde `http://localhost/...` o `http://127.0.0.1/...`
3. Espera a que cargue la interfaz.

Nota: abrir el archivo con `file://` puede causar problemas con los imports y con la carga de ejemplos.

## Uso basico

- `Nuevo`: crea una pestaña nueva
- `Abrir`: carga un archivo local
- `Guardar`: descarga el archivo activo
- `Guardar como`: cambia el nombre de la pestaña y descarga el contenido
- `Ejecutar`: interpreta el programa en la consola
- `Compilar`: exporta un HTML standalone con el runtime embebido

## Ejemplos de uso

### Hola mundo

```c
#include <stdio.h>

int main() {
    printf("Hola, mundo!\n");
    return 0;
}
```

### Entrada por consola

```c
#include <stdio.h>

int main() {
    int n;
    printf("Ingrese un numero: ");
    scanf("%d", &n);
    printf("El doble es: %d\n", n * 2);
    return 0;
}
```

### Gráficos

```c
#include <processing.h>

int main() {
    borrarPantalla(NEGRO);
    circulo(0, 0, 80, ROJO, AMARILLO);
    return 0;
}
```

## Caracteristicas del editor

- Varias pestañas
- Renombrado inline con doble click
- Cierre de pestañas con confirmacion custom
- Zoom de tipografia con `A-` y `A+`
- Tema claro / oscuro

## Consola

La consola integrada:

- muestra `stdout`
- acepta entrada para `scanf`
- permite escribir inline cuando el programa espera datos
- usa scrollbars finas y adaptadas al tema

## Librerias soportadas

### `stdio.h`

Funciones basicas como:

- `printf`
- `scanf`
- `puts`
- `putchar`

### `stdlib.h`

- `malloc`
- `calloc`
- `realloc`
- `free`
- `exit`

### `string.h`

- `strlen`
- `strcpy`
- `strncpy`
- `strcmp`
- `strcat`
- `memset`
- `memcpy`

### `math.h`

- `sqrt`
- `pow`
- `abs`

### `ctype.h`

- `isdigit`
- `isalpha`
- `toupper`
- `tolower`

### Graficos

- `tortuga.h`
- `processing.h`

## Exportacion HTML

La opcion `Compilar` genera un archivo HTML standalone que incluye:

- el runtime del interprete
- la logica de consola
- soporte de entrada/salida
- soporte grafico si el programa usa librerias graficas

Ese archivo se puede abrir luego sin depender del IDE completo.

## Limites

Este proyecto apunta a ser educativo, asi que no implementa C completo.

Algunas areas pueden estar parcial o progresivamente soportadas, por ejemplo:

- `struct`
- `union`
- `typedef`
- algunas construcciones avanzadas de punteros
- algunas extensiones del lenguaje

Si algo falla, normalmente se muestra un error con linea y columna.

## Ejemplos

Hay ejemplos listos en:

- `ejemplos/basicos/`
- `ejemplos/avanzados/`
- `ejemplos/graficos/`

## Documentacion extra

Tambien hay documentos auxiliares en el repositorio:

- `arquitectura.md`
- `lenguaje.md`
- `graficos.md`

## Licencia

No se definio una licencia todavia.

