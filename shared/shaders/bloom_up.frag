in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform vec2 uTx;
void main(){
  vec3 c=texture(uSrc,v+vec2(-uTx.x*2.,0.)).rgb+texture(uSrc,v+vec2(uTx.x*2.,0.)).rgb+texture(uSrc,v+vec2(0.,-uTx.y*2.)).rgb+texture(uSrc,v+vec2(0.,uTx.y*2.)).rgb;
  c+=(texture(uSrc,v+uTx*vec2(-1,-1)).rgb+texture(uSrc,v+uTx*vec2(1,-1)).rgb+texture(uSrc,v+uTx*vec2(-1,1)).rgb+texture(uSrc,v+uTx*vec2(1,1)).rgb)*2.;
  o=vec4(c/12.,1.);
}
