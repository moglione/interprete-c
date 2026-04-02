# Documentación de Funciones Gráficas

Este intérprete incluye soporte para gráficos mediante las librerías `tortuga.h` (estilo LOGO) y `processing.h` (dibujo general). A continuación se detallan las funciones disponibles.

## Librería Tortuga (`#include <tortuga.h>`)

Estas funciones permiten controlar una "tortuga" que dibuja a medida que se desplaza por la pantalla.

### Movimiento
- `avanza(distancia)` / `forward(n)`: Mueve la tortuga hacia adelante.
- `retrocede(distancia)` / `backward(n)`: Mueve la tortuga hacia atrás.
- `gd(grados)` / `rightTurn(a)`: Gira la tortuga a la derecha.
- `gi(grados)` / `leftTurn(a)`: Gira la tortuga a la izquierda.
- `ir(x, y)` / `gotoxy(x, y)`: Mueve la tortuga a una posición específica sin girar.
- `centrar()` / `home()`: Devuelve la tortuga al centro (0,0) y ángulo 90 (hacia arriba).

### Control del Lápiz
- `subelapiz()` / `penUp()`: Deja de dibujar al moverse.
- `bajalapiz()` / `penDown()`: Comienza a dibujar al moverse.
- `colorlapiz(r, g, b)` / `penColour(r, g, b)`: Cambia el color del trazo (0-255).
- `grosor(n)` / `ps(n)` / `penSize(n)`: Cambia el ancho de la línea.

### Visibilidad y Animación
- `ocultatortuga()` / `hideTurtle()`: Oculta el cursor de la tortuga.
- `muestratortuga()` / `showTurtle()`: Muestra el cursor de la tortuga.
- `velocidad(n)`: Ajusta la velocidad de animación (0=instantáneo, 1=lento, 10=rápido).
- `borrapantalla()` / `clear()`: Limpia el dibujo pero mantiene la posición de la tortuga.

---

## Librería Processing (`#include <processing.h>`)

Funciones para dibujo geométrico directo sobre el lienzo.

### Primitivas de Dibujo
- `linea(x1, y1, x2, y2)`: Dibuja una línea entre dos puntos.
- `circulo(x, y, radio)`: Dibuja un círculo sin relleno.
- `rectangulo(x, y, ancho, alto)`: Dibuja un rectángulo sin relleno.
- `punto(x, y, color)`: Pinta un píxel de un color específico.
- `texto(mensaje, x, y)`: Escribe texto en las coordenadas indicadas.

### Utilidades y Pantalla
- `limpiarpantalla(color)`: Borra todo con un color de fondo (usar `NEGRO`, `BLANCO`, `ROJO`, etc.).
- `colorfondo(r, g, b)`: Define el color de fondo para la siguiente limpieza.
- `random(min, max)` / `azar(max)`: Devuelve un número entero aleatorio.

### Constantes de Color Predefinidas
- `NEGRO`, `BLANCO`, `ROJO`, `VERDE`, `AZUL`, `AMARILLO`, `CYAN`, `MAGENTA`, `GRIS`.

---

## Sistemas de Coordenadas

El intérprete ajusta automáticamente el sistema de coordenadas según la librería utilizada:

- **Modo Tortuga (`logo`)**: El origen (0,0) está en el **centro**. El eje Y crece hacia **arriba**. Ideal para geometría y dibujos simétricos.
- **Modo Processing (`processing`)**: El origen (0,0) está en la **esquina superior izquierda**. El eje X aumenta hacia la derecha y el eje Y aumenta hacia **abajo**. Las unidades corresponden a píxeles (ventana virtual de 1000x1000).

### Cambio Manual
Puedes alternar entre sistemas usando la función:
- `modo_coordenadas(0)`: Activa modo Logo (Central, Y↑).
- `modo_coordenadas(1)`: Activa modo Processing (Esquina, Y↓).
