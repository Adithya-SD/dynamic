// Particle state: xy on the sheet, life 1..0, seed. Stored as 32-bit float so slow drift never rounds to zero.
// Behaviours (uBeh, see web/src/56_geo.js):
//   1 Swarm: particles climb the blurred pattern towards its lines and settle there, so the shape is drawn by the swarm;
//            beats blow them outwards and they fly back.
//   5 Magnet: particles run along the contours of the pattern (perpendicular to its gradient), like filings round a magnet.
//   others: carried by the fluid only.
in vec2 v;out vec4 o;
uniform sampler2D uState,uVel,uGeo;
uniform vec2 uRefTx,uGeoAsp;
uniform vec4 uEmit;   // x, y, active, spread
uniform vec4 uGeoT;   // scale, rotA, rotB, tile
uniform float uDt,uSpeed,uLife,uTime,uWrap,uBeh,uPull,uScatter,uReset,uMaxStep;
float inside(vec2 a){return uGeoT.w>.5?1.:step(max(abs(a.x),abs(a.y)),1.);}
float mask(vec2 g,float lod){
  vec2 a=rot2(g,uGeoT.y),b=rot2(g,uGeoT.z);
  return textureLod(uGeo,a*.5+.5,lod).r*inside(a)+textureLod(uGeo,b*.5+.5,lod).g*inside(b)+textureLod(uGeo,g*.5+.5,lod).b*inside(g)*.8;
}
vec2 grad(vec2 g,float lod){float e=exp2(lod)*2./1024.;return vec2(mask(g+vec2(e,0.),lod)-mask(g-vec2(e,0.),lod),mask(g+vec2(0.,e),lod)-mask(g-vec2(0.,e),lod))/(2.*e);}
void main(){
  vec4 s=texture(uState,v);
  vec2 flow=texture(uVel,s.xy).xy*uRefTx*uDt*uSpeed;
  {float fl=length(flow),mx=uMaxStep*uDt;if(fl>mx)flow*=mx/fl;}   // never faster than the eye can follow
  if(uBeh>.5&&(uBeh<1.5||uBeh>4.5)){
    vec2 g=(s.xy-.5)*uGeoAsp/uGeoT.x,toUv=uGeoT.x/uGeoAsp;
    vec2 gc=grad(g,5.),gm=grad(g,3.5),gf=grad(g,2.);
    float h=hash12(v*733.+s.w*19.);
    vec2 d;
    if(uBeh<1.5){
      // Long-range pull from the coarse field, final snap from the fine one; speed eases off once on a line.
      float on=mask(g,1.5);
      d=normalize(gc+1e-5)*min(1.,length(gc)*.6)*.35+normalize(gm+1e-5)*min(1.,length(gm)*.3)*.45+normalize(gf+1e-5)*min(1.,length(gf)*.15)*.5;
      d*=uPull*(1.-.9*clamp(on*1.2,0.,1.));
      flow*=.35+.65*(1.-clamp(on,0.,1.))*.4;
      d+=normalize(g+1e-4)*uScatter*(.4+h);
    }else{
      // Pulled in like the swarm while far away, then carried round the contour once close.
      float near=clamp(mask(g,2.5)*2.,0.,1.);vec2 t=vec2(-gm.y,gm.x);
      vec2 pull=normalize(gc+1e-5)*min(1.,length(gc)*.6)*.4+normalize(gm+1e-5)*min(1.,length(gm)*.3)*.6;
      d=(pull*(1.-near)*.8+normalize(t+1e-5)*near*(.7+.8*h)+normalize(gf+1e-5)*min(1.,length(gf)*.15)*.35)*uPull;
      d+=normalize(g+1e-4)*uScatter*(.3+h)*.6;
      flow*=.5;
    }
    s.xy+=d*toUv*uDt+flow;
  }else s.xy+=flow;
  s.z-=uDt/uLife*(.5+hash12(v*913.+s.w*71.));
  if(uWrap>.5)s.xy=fract(s.xy);
  if(uReset>.5&&hash12(v*97.+uTime)<.5)s.z=0.;
  if(s.z<=0.||s.x<0.||s.x>1.||s.y<0.||s.y>1.){
    float t=fract(uTime*.6180339);
    vec2 p=vec2(hash12(v*731.+t*97.),hash12(v*977.+t*131.));
    if(uEmit.z>.5&&hash12(v*313.+t*53.)<.6)p=uEmit.xy+(vec2(hash12(v*419.+t*37.),hash12(v*541.+t*29.))-.5)*uEmit.w;
    // Swarm and Magnet: of six random spots, be born at the one most on the pattern, so the shape fills in at once.
    if(uBeh>.5&&(uBeh<1.5||uBeh>4.5)){float best=-1.;vec2 bp=p;
      for(int k=0;k<6;k++){vec2 c=vec2(hash12(v*(31.+float(k)*7.)+t*(13.+float(k))),hash12(v*(57.+float(k)*5.)+t*(29.+float(k))));
        float m=mask((c-.5)*uGeoAsp/uGeoT.x,2.)+hash12(c*91.)*.15;if(m>best){best=m;bp=c;}}
      if(hash12(v*211.+t)<.85)p=bp;}
    s=vec4(clamp(p,0.,1.),1.,hash12(v*571.+t*17.));
  }
  o=s;
}
