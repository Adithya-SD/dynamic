// Curl and vorticity confinement in one pass: the same maths as curl.frag + vorticity.frag (watch only: every extra render
// pass costs about a millisecond of driver time there, and the GPU idles).
in vec2 v;out vec4 o;uniform sampler2D uVel;uniform vec2 uTx;uniform float uScale,uCurlStr,uDt,uMaxVel;
float curlAt(vec2 p){return .5*uScale*(texture(uVel,p+vec2(uTx.x,0.)).y-texture(uVel,p-vec2(uTx.x,0.)).y-texture(uVel,p+vec2(0.,uTx.y)).x+texture(uVel,p-vec2(0.,uTx.y)).x);}
void main(){float L=curlAt(v-vec2(uTx.x,0.)),R=curlAt(v+vec2(uTx.x,0.)),T=curlAt(v+vec2(0.,uTx.y)),B=curlAt(v-vec2(0.,uTx.y)),C=curlAt(v);
vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=uCurlStr*C;f.y=-f.y;
o=vec4(clamp(texture(uVel,v).xy+f*uDt,-uMaxVel,uMaxVel),0.,1.);}
