// Space: maps a screen pixel to the fluid sheet. The brush uses the same map (space.js / Space.kt),
// so ink lands under the finger and every symmetric image appears at once.
// Hosts compile one variant per space with `#define SPACE n` so each shader stays small and compiles fast:
// 0 Plain, 1 Kaleido, 2 Prism (three-mirror kaleidoscope), 3 Hyperbolic {p,q}, 4 Golden spiral, 5 Two-pole spiral.
// Any space can also be wrapped round a 3D ball (uOrb > 0): the picture lives on the sphere and the sphere turns.
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
uniform vec2 uTilt;     // 3D tilt of the plane (gyro or mouse), already weighted per space
uniform vec2 uMobBg;    // the same, for the backdrop around the ball (tilt walks it: parallax)
uniform float uOrb;     // ball radius in short-side units; 0 = flat
uniform float uPulse;   // the frame swells by this fraction on every hit
uniform mat3 uOrbM;     // view-space normal -> normal on the ball's own surface
uniform int uLoop;      // fold iteration cap; a uniform bound keeps D3D shader compilers from unrolling
float gParity;          // number of mirror flips; tints alternate tiles
vec3 gOrbN;             // view-space surface normal of the ball at this pixel

vec2 sheetUV(vec2 q){float s=min(uRes.x,uRes.y);return .5+q*s/uRes/uWorld;}

#if SPACE==3
// Hyperbolic plane in the Poincare disk, z in the unit disk (outside is mirrored in); mob walks the view through the tiling.
vec2 hyperFold(vec2 z,vec2 mob){
  float r2=dot(z,z);if(r2>1.){z/=r2;gParity+=1.;}
  z=cdiv(z-mob,vec2(1.,0.)-cmul(vec2(mob.x,-mob.y),z));
  float w=TAU/uHyp.w,cr2=uHyp.y*uHyp.y;
  for(int i=0;i<uLoop;i++){
    float m=mod(atan(z.y,z.x),w);if(m>w*.5){m=w-m;gParity+=1.;}
    z=length(z)*vec2(cos(m),sin(m));
    vec2 d=z-vec2(uHyp.x,0.);float d2=dot(d,d);
    if(d2>=cr2)break;
    z=vec2(uHyp.x,0.)+d*(cr2/d2);gParity+=1.;}
  return uHypOff+z*uHyp.z;
}
#endif

// Flat plane: q is in short-side units, already tilted.
vec2 foldFlat(vec2 q){
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
  return hyperFold(rot2(q,uSpin)/.48,uMobBg);
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

// The ball: a point on the sphere (body frame) goes to the plane by stereographic projection, then through the same fold.
// In hyperbolic space the northern hemisphere is the Poincare disk and the southern its mirror image: one seamless globe.
vec2 foldBall(vec3 n){
  vec2 p=n.xy/max(1.+n.z,1e-3);
#if SPACE==3
  return hyperFold(p,uMob);
#else
  return foldFlat(p*.5);
#endif
}

vec2 spaceMapFlat(vec2 fc){
  float sh=min(uRes.x,uRes.y);
  vec2 q=(fc-.5*uRes)/sh;
  q*=1.-uPulse;
  q/=max(.3,1.+dot(q,uTilt));   // perspective foreshortening of the tilted plane
  gParity=0.;
  return foldFlat(q);
}
vec2 spaceMapBall(vec2 fc){
  float sh=min(uRes.x,uRes.y);
  vec2 q=(fc-.5*uRes)/(sh*uOrb);
  gOrbN=vec3(q,sqrt(max(1.-dot(q,q),0.)));
  gParity=0.;
  return foldBall(uOrbM*gOrbN);
}
vec2 spaceMap(vec2 fc){
  if(uOrb>0.){float sh=min(uRes.x,uRes.y);if(length(fc-.5*uRes)<uOrb*sh)return spaceMapBall(fc);}
  return spaceMapFlat(fc);
}
vec2 spaceUV(vec2 fc){return mirrorWrap(spaceMap(fc));}
