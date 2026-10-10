// Geometry layer (see web/src/56_geo.js). Mode 0 paints the pattern into the ink, coloured from the palette.
// Mode 1 shapes the flow, by behaviour (uBeh):
//   3 Vortex: the fluid runs along every line (force along the contours of the blurred pattern).
//   4 Obstacle: the pattern is solid; a slow current circles the centre and parts around it like water round rocks.
//   all: beat push outward along the lines, swirl, and a pressure ring sweeping the whole screen on each beat.
in vec2 v;out vec4 o;
uniform sampler2D uSrc,uGeo;
uniform vec2 uAspect,uGeoCtr;
uniform float uTile,uScale,uRotA,uRotB,uAmt,uPush,uSwirl,uRing,uRingW,uShock,uTime,uHue,uHueRange,uSat,uPal,uOn,uBeh,uVort,uCurrent,uHalo;
uniform int uMode,uCm;
uniform vec3 uStops[6];
vec3 palette(float t){
  if(uPal<.5)return hsv2rgb(vec3(t,1.,1.));
  int n=int(uPal);float q=fract(t)*float(n);int i=int(floor(q));float f=q-float(i);f=f*f*(3.-2.*f);
  return mix(uStops[i%n],uStops[(i+1)%n],f);}
float inside(vec2 a){return uTile>.5?1.:step(max(abs(a.x),abs(a.y)),1.);}
vec3 layers(vec2 p,float lod){
  vec2 a=rot2(p,uRotA),b=rot2(p,uRotB);
  return vec3(textureLod(uGeo,a*.5+.5,lod).r*inside(a),textureLod(uGeo,b*.5+.5,lod).g*inside(b),textureLod(uGeo,p*.5+.5,lod).b*inside(p));
}
float mask(vec2 p,float lod){return dot(layers(p,lod),vec3(1.,1.,.7));}
vec2 grad(vec2 p,float lod){float e=exp2(lod)*2./1024.;return vec2(mask(p+vec2(e,0.),lod)-mask(p-vec2(e,0.),lod),mask(p+vec2(0.,e),lod)-mask(p-vec2(0.,e),lod))/(2.*e);}
void main(){
  vec2 q=(v-uGeoCtr)*uAspect;       // short-side units, centre 0
  vec2 p=q/max(uScale,.05);         // pattern units: the drawing spans -1..1
  vec4 s=texture(uSrc,v);
  if(uMode==0){
    vec3 L=layers(p,0.);float r=length(p),an=atan(p.y,p.x)/TAU;
    // Obstacle: ink is shed from a halo around the shape rather than from the lines themselves.
    if(uHalo>0.)L=max(layers(p,3.5)*2.2-L*3.,0.)*uHalo;
    vec3 t;
    if(uCm==1)t=vec3(an,an+.33,an+.66);else if(uCm==2)t=vec3(0.,.5,.25);else t=vec3(r*.55,r*.55+.33,r*.3+.66);
    t+=uTime*.015;
    vec3 cA=mix(vec3(1.),palette(uHue+uHueRange*t.x),uSat),cB=mix(vec3(1.),palette(uHue+uHueRange*t.y),uSat),cC=mix(vec3(1.),palette(uHue+uHueRange*t.z),uSat);
    o=vec4(s.rgb+(cA*L.r+cB*L.g+cC*L.b*.8)*uAmt,s.a);
  }else{
    vec2 vel=s.xy,f=vec2(0.);
    if(uOn>.5){
      float m=mask(p,0.);vec2 rd=normalize(p+1e-5);
      f+=rd*m*uPush+vec2(-rd.y,rd.x)*m*uSwirl;
      if(uBeh>2.5&&uBeh<3.5){vec2 g=grad(p,2.);float m2=mask(p,2.);f+=normalize(vec2(-g.y,g.x)+1e-5)*min(1.,length(g)*.15)*uVort*clamp(m2*3.,0.,1.);}
      if(uBeh>3.5&&uBeh<4.5){
        vel=mix(vel,vec2(-q.y,q.x)*uCurrent,.02);
        float solid=clamp(mask(p,1.)*1.6,0.,1.);vec2 n=normalize(grad(p,2.)+1e-5);
        vel-=n*dot(vel,n)*solid;vel*=1.-.6*solid;
      }
    }
    float rr=length(q),w=exp(-pow((rr-uRing)/max(uRingW,.01),2.));
    f+=normalize(q+1e-5)*w*uShock;
    o=vec4(vel+f,0.,1.);
  }
}
