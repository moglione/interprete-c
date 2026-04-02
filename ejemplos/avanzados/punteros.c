#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 10, y = 20;
    printf("Antes:  x=%d, y=%d\n", x, y);
    swap(&x, &y);
    printf("Después: x=%d, y=%d\n", x, y);

    int arr[5] = {10, 20, 30, 40, 50};
    int *p = arr;
    int i;
    for (i = 0; i < 5; i++) {
        printf("arr[%d] via puntero: %d\n", i, *(p + i));
    }
    return 0;
}
