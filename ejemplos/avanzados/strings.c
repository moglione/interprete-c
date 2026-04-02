#include <stdio.h>
#include <string.h>

int main() {
    char saludo[50] = "Hola";
    char nombre[]   = "Mundo";
    strcat(saludo, ", ");
    strcat(saludo, nombre);
    strcat(saludo, "!");
    printf("%s\n", saludo);
    printf("Longitud: %d\n", (int)strlen(saludo));
    printf("strcmp(\"abc\", \"abd\") = %d\n", strcmp("abc", "abd"));
    return 0;
}
