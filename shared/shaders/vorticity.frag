// Vorticity confinement re-injects the small swirls numerical diffusion removes. Stays highp (velocity limits and the curl ratio need it).
in vec2 v,vL,vR,vT,vB;out vec4 o;uniform sampler2D uVel,uCurl;uniform float uCurlStr,uDt,uMaxVel;
void main(){float L=texture(uCurl,vL).x,R=texture(uCurl,vR).x,T=texture(uCurl,vT).x,B=texture(uCurl,vB).x,C=texture(uCurl,v).x;
vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=uCurlStr*C;f.y=-f.y;
o=vec4(clamp(texture(uVel,v).xy+f*uDt,-uMaxVel,uMaxVel),0.,1.);}
