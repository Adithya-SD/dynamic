// Each particle is a streak stretched along its velocity, so fast motion reads as continuous light.
uniform sampler2D uState,uVel;
uniform int uSide;
uniform vec2 uTarget,uRefTx;
uniform float uSize,uStretch,uBright,uMode,uTime,uSat,uPal;
uniform vec3 uStops[6];
uniform float uHue,uHueRange;
out vec3 vCol;out vec2 vLocal;out float vLen;
vec3 palette(float t){
  if(uPal<.5)return hsv2rgb(vec3(t,1.,1.));
  int n=int(uPal);float q=fract(t)*float(n);int i=int(floor(q));float f=q-float(i);f=f*f*(3.-2.*f);
  return mix(uStops[i%n],uStops[(i+1)%n],f);}
void main(){
  int id=gl_InstanceID;vec4 s=texelFetch(uState,ivec2(id%uSide,id/uSide),0);
  vec2 vel=textureLod(uVel,s.xy,0.).xy;float sp=length(vel);
  vec2 dir=sp>1e-3?vel/sp:vec2(1.,0.);
  vec2 pxVel=vel*uRefTx*uTarget/60.;
  float len=max(uSize,length(pxVel)*uStretch);
  vec2 c[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  vec2 k=c[gl_VertexID];
  vec2 px=s.xy*uTarget+dir*k.x*len*.5+vec2(-dir.y,dir.x)*k.y*uSize*.5;
  gl_Position=vec4(px/uTarget*2.-1.,0.,1.);
  float f=min(s.z*4.,1.)*min((1.-s.z)*8.,1.)*min(.25+sp*.004,1.6);
  if(uMode>1.5&&uMode<2.5)f*=.55+.45*sin(s.w*60.+uTime*3.);
  vec3 col=mix(vec3(1.),palette(uHue+uHueRange*fract(s.w*.618034)+sp*.0004),uSat);
  vCol=col*uBright*f*uSize/len;vLocal=k;vLen=len/uSize;
}
