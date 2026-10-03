// Relief lighting from the composed image: height = luminance. Light, metal, thin-film iridescence and rim.
in vec2 v;out vec4 o;
uniform sampler2D uScene;
uniform vec2 uTx;
uniform float uRelief,uSharp,uLight,uMetal,uIris,uRim,uShine;
void main(){
  vec4 c=texture(uScene,v);vec3 col=c.rgb;
  float kk=uShine*6.+uRelief*16.;
  vec2 e=uTx*2.;
  float lx=texture(uScene,v+vec2(e.x,0.)).a-texture(uScene,v-vec2(e.x,0.)).a;
  float ly=texture(uScene,v+vec2(0.,e.y)).a-texture(uScene,v-vec2(0.,e.y)).a;
  vec3 n=normalize(vec3(-lx*kk,-ly*kk,1.));
  vec3 L=normalize(vec3(cos(uLight)*.72,-sin(uLight)*.72,.7));
  float s2=pow(max(dot(n,L),0.),uSharp);
  vec3 rv=reflect(vec3(0.,0.,-1.),n);float ev=-rv.y*.5+.5;
  vec3 env=mix(vec3(.03,.04,.08),vec3(.8,.88,1.),smoothstep(.3,.85,ev))+vec3(1.,.92,.75)*smoothstep(.9,.98,ev);
  float lum=c.a,fm=smoothstep(.02,.2,lum);
  // Thin film: interference of a 250-1150 nm layer, thickness follows ink density and surface tilt.
  float d=250.+lum*900.+(n.x*.6+n.y*.4)*300.;
  vec3 ir=.5+.5*cos(TAU*2.66*d/vec3(650.,532.,450.));
  col=col*(.8+.4*n.z);
  col=mix(col,ir*(.25+lum*1.1),min(uIris,1.)*fm);
  col=mix(col,env*(.35+col*1.3),uMetal*fm);
  col+=s2*uShine*.35*(.4+col)+s2*uRelief*.4+pow(1.-n.z,2.5)*uRim*env*.8*fm;
  o=vec4(col,c.a);
}
