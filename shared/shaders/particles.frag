in vec3 vCol;in vec2 vLocal;in float vLen;out vec4 o;uniform float uSharp;
// Sharpness narrows the falloff (soft glow -> crisp dot) and keeps the light the dot carries.
void main(){float ax=max(abs(vLocal.x)*vLen-(vLen-1.),0.);float d=ax*ax+vLocal.y*vLocal.y;o=vec4(vCol*exp(-d*mix(3.,20.,uSharp))*(1.+uSharp*.6),1.);}
