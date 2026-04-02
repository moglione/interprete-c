#include <stdio.h>
#include <processing.h>

int main() {
    printf("Generando círculos aleatorios...\n");
    
    borrarPantalla(NEGRO);
    
    int i;
    for (i = 0; i < 50; i++) {
        int x = azar(500) - 250;
        int y = azar(500) - 250;
        int r = azar(50) + 10;
        int color = colorAzar();
        
        circulo(x, y, r, color, color);
    }
    
    printf("Proceso finalizado.\n");
    return 0;
}
