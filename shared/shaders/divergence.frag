in vec2 v;out vec4 o;uniform sampler2D uVel;uniform vec2 uTx;uniform float uWalls;
void main(){vec2 C=texture(uVel,v).xy;
float L=texture(uVel,v-vec2(uTx.x,0.)).x,R=texture(uVel,v+vec2(uTx.x,0.)).x,T=texture(uVel,v+vec2(0.,uTx.y)).y,B=texture(uVel,v-vec2(0.,uTx.y)).y;
if(uWalls>.5){if(v.x-uTx.x<0.)L=-C.x;if(v.x+uTx.x>1.)R=-C.x;if(v.y+uTx.y>1.)T=-C.y;if(v.y-uTx.y<0.)B=-C.y;}
o=vec4(.5*(R-L+T-B),0.,0.,1.);}
