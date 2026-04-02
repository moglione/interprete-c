#include <stdio.h>
#include <tortuga.h>

int main() {
    printf("Dibujando un triángulo con Tortuga...\n");
    
    ps(5);          // grosor
    colorlapiz(0, 255, 136);
    
    repetir(3) {
        avanza(100);
        gd(120);
    }
    
    printf("¡Listo!\n");
    return 0;
}
