in vec3 vCol;in vec2 vLocal;in float vLen;out vec4 o;
void main(){float ax=max(abs(vLocal.x)*vLen-(vLen-1.),0.);float d=ax*ax+vLocal.y*vLocal.y;o=vec4(vCol*exp(-d*3.),1.);}
