// Semi-Lagrangian transport. Velocity is in reference cells/s (128 cells per short side), so motion is resolution independent.
in vec2 v;out vec4 o;uniform sampler2D uVel,uSrc;uniform vec2 uRefTx;uniform float uDt,uDiss;
void main(){vec2 p=v-uDt*texture(uVel,v).xy*uRefTx;o=texture(uSrc,p)/(1.+uDiss*uDt);}
