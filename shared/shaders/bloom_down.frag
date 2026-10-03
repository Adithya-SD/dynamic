// Dual-filter bloom. The first level keeps only light above a soft threshold.
in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform vec2 uTx;uniform float uThreshold,uFirst;
void main(){
  vec3 c=(texture(uSrc,v+uTx*vec2(-1,-1)).rgb+texture(uSrc,v+uTx*vec2(1,-1)).rgb+texture(uSrc,v+uTx*vec2(-1,1)).rgb+texture(uSrc,v+uTx*vec2(1,1)).rgb)*.25;
  if(uFirst>.5){float l=max(c.r,max(c.g,c.b)),k=clamp(l-uThreshold+.25,0.,.5);k=k*k*2.;c*=max(k,l-uThreshold)/max(l,1e-4);}
  o=vec4(c,1.);
}
