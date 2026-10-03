in vec4 vVal;out vec4 o;
void main(){vec2 d=gl_PointCoord-.5;o=vVal*exp(-dot(d,d)*6.);}
