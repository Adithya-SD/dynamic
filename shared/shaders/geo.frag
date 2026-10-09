// Geometry layer (see web/src/56_geo.js). Mode 0 paints the pattern's three layers into the ink, coloured from the
// palette; mode 1 pushes the flow: outward along the lines on the beat, around the centre (swirl), plus a pressure
// ring that sweeps the whole screen on every beat.
in vec2 v;out vec4 o;
uniform sampler2D uSrc,uGeo;
uniform vec2 uAspect;
uniform float uTile,uScale,uRotA,uRotB,uAmt,uPush,uSwirl,uRing,uRingW,uShock,uTime,uHue,uHueRange,uSat,uPal,uOn;
uniform int uMode,uCm;
uniform vec3 uStops[6];
vec3 palette(float t){
  if(uPal<.5)return hsv2rgb(vec3(t,1.,1.));
  int n=int(uPal);float q=fract(t)*float(n);int i=int(floor(q));float f=q-float(i);f=f*f*(3.-2.*f);
  return mix(uStops[i%n],uStops[(i+1)%n],f);}
vec3 layers(vec2 p){
  vec2 a=rot2(p,uRotA)*.5+.5,b=rot2(p,uRotB)*.5+.5,c=p*.5+.5;
  vec3 L=vec3(texture(uGeo,a).r,texture(uGeo,b).g,texture(uGeo,c).b);
  if(uTile<.5)L*=vec3(step(max(abs(a.x-.5),abs(a.y-.5)),.5),step(max(abs(b.x-.5),abs(b.y-.5)),.5),step(max(abs(c.x-.5),abs(c.y-.5)),.5));
  return L;
}
void main(){
  vec2 q=(v-.5)*uAspect;            // short-side units, centre 0
  vec2 p=q/max(uScale,.05);         // pattern units: the drawing spans -1..1
  vec4 s=texture(uSrc,v);
  if(uMode==0){
    vec3 L=layers(p);float r=length(p),an=atan(p.y,p.x)/TAU;
    vec3 tA,tB,tC;
    if(uCm==1){tA=vec3(an,an+.33,an+.66);}
    else if(uCm==2){tA=vec3(0.,.5,.25);}
    else{tA=vec3(r*.55,r*.55+.33,r*.3+.66);}
    tA+=uTime*.015;
    vec3 cA=mix(vec3(1.),palette(uHue+uHueRange*tA.x),uSat),cB=mix(vec3(1.),palette(uHue+uHueRange*tA.y),uSat),cC=mix(vec3(1.),palette(uHue+uHueRange*tA.z),uSat);
    vec3 add=(cA*L.r+cB*L.g+cC*L.b*.8)*uAmt;
    o=vec4(s.rgb+add,s.a);
  }else{
    vec2 f=vec2(0.);
    if(uOn>.5){
      float e=.012/max(uScale,.05);
      float m=dot(layers(p),vec3(1.,1.,.7));
      vec2 rd=normalize(p+1e-5);
      f+=rd*m*uPush+vec2(-rd.y,rd.x)*m*uSwirl;
    }
    float rr=length(q),w=exp(-pow((rr-uRing)/max(uRingW,.01),2.));
    f+=normalize(q+1e-5)*w*uShock;
    o=vec4(s.xy+f,0.,1.);
  }
}
