// Vorticity confinement re-injects the small swirls numerical diffusion removes.
in vec2 v;out vec4 o;uniform sampler2D uVel,uCurl;uniform vec2 uTx;uniform float uCurlStr,uDt,uMaxVel;
void main(){float L=texture(uCurl,v-vec2(uTx.x,0.)).x,R=texture(uCurl,v+vec2(uTx.x,0.)).x,T=texture(uCurl,v+vec2(0.,uTx.y)).x,B=texture(uCurl,v-vec2(0.,uTx.y)).x,C=texture(uCurl,v).x;
vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=uCurlStr*C;f.y=-f.y;
o=vec4(clamp(texture(uVel,v).xy+f*uDt,-uMaxVel,uMaxVel),0.,1.);}
