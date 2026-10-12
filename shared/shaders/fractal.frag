// The fractal layer in sheet space: the pixel at sheet position v looks at the fractal plane (see fractal.glsl).
#include "fractal.glsl"
in vec2 v;out vec4 o;
void main(){o=vec4(fractalAt((v-uFrCtr)*uFrAsp),1.);}
