// MacCormack correction keeps ink filaments sharp; the neighbourhood clamp prevents overshoot.
in vec2 v;out vec4 o;uniform sampler2D uVel,uSrc,uFwd;uniform vec2 uRefTx,uSrcTx;uniform float uDt,uDiss;
void main(){vec2 w=texture(uVel,v).xy*uRefTx*uDt,p=v-w;
vec4 r=texture(uFwd,v)+.5*(texture(uSrc,v)-texture(uFwd,v+w));
vec4 a=texture(uSrc,p+vec2(uSrcTx.x,0.)),b=texture(uSrc,p-vec2(uSrcTx.x,0.)),c=texture(uSrc,p+vec2(0.,uSrcTx.y)),d=texture(uSrc,p-vec2(0.,uSrcTx.y)),e=texture(uSrc,p);
o=clamp(r,min(min(min(a,b),min(c,d)),e),max(max(max(a,b),max(c,d)),e));
  float m=max(o.r,max(o.g,o.b));o.rgb/=1.+(uDiss+1.5*m*m)*uDt;}
