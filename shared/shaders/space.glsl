// Space: maps a screen pixel to the fluid sheet. The brush uses the same map (space.js / Space.kt),
// so ink lands under the finger and every symmetric image appears at once.
// Hosts compile one variant per space with `#define SPACE n` so each shader stays small and compiles fast:
// 0 Plain, 1 Kaleido, 2 Prism (three-mirror kaleidoscope), 3 Hyperbolic {p,q}, 4 Golden spiral, 5 Two-pole spiral.
#ifndef SPACE
#define SPACE 0
#endif
uniform vec2 uRes;      // render size, pixels
uniform float uWorld;   // simulated area / visible area (>=1)
uniform float uSegs;    // kaleido segments
uniform float uDepth;   // kaleido fold depth
uniform float uSpin;    // accumulated rotation, radians
uniform float uTile;    // tile size (prism, spiral bands)
uniform vec2 uShift;    // accumulated drift for prism
uniform vec4 uHyp;      // circle centre x, circle radius, triangle scale, p
uniform vec2 uHypOff;   // places the fundamental triangle on the sheet
uniform vec2 uMob;      // disk automorphism parameter, |uMob|<1
uniform vec4 uSpiral;   // k=ln(growth)/2pi, ln(growth), arms, unused
uniform vec2 uSpiralPhase;
uniform vec4 uPoles;    // pole A xy, pole B xy (short-side units)
uniform int uLoop;      // fold iteration cap; a uniform bound keeps D3D shader compilers from unrolling
float gParity;          // number of mirror flips; tints alternate tiles

vec2 sheetUV(vec2 q){float s=min(uRes.x,uRes.y);return .5+q*s/uRes/uWorld;}

vec2 spaceMap(vec2 fc){
  float sh=min(uRes.x,uRes.y);
  vec2 q=(fc-.5*uRes)/sh;
  gParity=0.;
#if SPACE==1
  q=rot2(q,uSpin);
  float w=TAU/max(2.,floor(uSegs)),r=length(q),a=atan(q.y,q.x);
  int nd=int(uDepth);
  for(int j=0;j<nd;j++){float m=mod(a+float(j)*w*.37,w);gParity+=step(w*.5,m);a=abs(m-w*.5);if(j>0)r*=1.18;}
  return sheetUV(r*vec2(cos(a),sin(a)));
#elif SPACE==2
  vec2 p=rot2(q,uSpin)/max(uTile,.05)+vec2(.5,.2887)+uShift;
  const vec2 n1=vec2(.8660254,-.5),n2=vec2(-.8660254,-.5),B=vec2(1.,0.);
  for(int i=0;i<uLoop;i++){bool inside=true;
    if(p.y<0.){p.y=-p.y;gParity+=1.;inside=false;}
    float d1=dot(p,n1);if(d1<0.){p-=2.*d1*n1;gParity+=1.;inside=false;}
    float d2=dot(p-B,n2);if(d2<0.){p-=2.*d2*n2;gParity+=1.;inside=false;}
    if(inside)break;}
  return .5+(p-vec2(.5,.2887))*.9;
#elif SPACE==3
  vec2 z=rot2(q,uSpin)/.48;
  float r2=dot(z,z);if(r2>1.){z/=r2;gParity+=1.;}
  z=cdiv(z-uMob,vec2(1.,0.)-cmul(vec2(uMob.x,-uMob.y),z));
  float w=TAU/uHyp.w,cr2=uHyp.y*uHyp.y;
  for(int i=0;i<uLoop;i++){
    float m=mod(atan(z.y,z.x),w);if(m>w*.5){m=w-m;gParity+=1.;}
    z=length(z)*vec2(cos(m),sin(m));
    vec2 d=z-vec2(uHyp.x,0.);float d2=dot(d,d);
    if(d2>=cr2)break;
    z=vec2(uHyp.x,0.)+d*(cr2/d2);gParity+=1.;}
  return uHypOff+z*uHyp.z;
#elif SPACE==4 || SPACE==5
#if SPACE==5
  vec2 z=cdiv(q-uPoles.xy,q-uPoles.zw);
#else
  vec2 z=rot2(q,uSpin);
#endif
  float lr=log(max(length(z),1e-6)),th=atan(z.y,z.x),s=lr-uSpiral.x*th;
  // A full turn shifts x by exactly 2*arms, so the mirror fold stays seamless across the branch cut.
  return vec2(uSpiral.z*s/(PI*uSpiral.x),2.*lr/(uSpiral.y*max(uTile,.05)))+uSpiralPhase;
#else
  return sheetUV(q);
#endif
}
vec2 spaceUV(vec2 fc){return mirrorWrap(spaceMap(fc));}
