in vec2 v;out vec4 o;uniform sampler2D uVel;uniform vec2 uTx;uniform float uScale;
void main(){o=vec4(.5*uScale*(texture(uVel,v+vec2(uTx.x,0.)).y-texture(uVel,v-vec2(uTx.x,0.)).y-texture(uVel,v+vec2(0.,uTx.y)).x+texture(uVel,v-vec2(0.,uTx.y)).x),0.,0.,1.);}
