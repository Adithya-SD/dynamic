// Semi-Lagrangian transport. Velocity is in reference cells/s (128 cells per short side), so motion is resolution independent.
in vec2 v;out vec4 o;uniform sampler2D uVel,uSrc;uniform vec2 uRefTx;uniform float uDt,uDiss,uOpen;
void main(){vec2 p=v-uDt*texture(uVel,v).xy*uRefTx;o=texture(uSrc,p)/(1.+uDiss*uDt);
if(uOpen>.5&&(p.x<0.||p.x>1.||p.y<0.||p.y>1.))o=vec4(0.);}   // open edge (infinite canvas): nothing flows in from outside
