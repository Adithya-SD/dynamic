in vec2 v;out vec4 o;uniform sampler2D uP,uVel;uniform vec2 uTx;
void main(){o=vec4(texture(uVel,v).xy-vec2(texture(uP,v+vec2(uTx.x,0.)).x-texture(uP,v-vec2(uTx.x,0.)).x,texture(uP,v+vec2(0.,uTx.y)).x-texture(uP,v-vec2(0.,uTx.y)).x),0.,1.);}
