// Pass 1 at render resolution: fold space once per pixel, add particles, tone. Later passes read this texture
// instead of re-folding, which is what made the old renderer expensive at high resolution.
#include "space.glsl"
in vec2 v;out vec4 o;
uniform sampler2D uDye,uPart,uCurl;
uniform float uExposure,uHue,uParityHue,uChroma,uPartOn,uFloor,uVib,uTone;
// The ball (uOrb in space.glsl): light direction in view space, rim colour, how much depth cueing to apply.
uniform vec3 uOrbL,uOrbRim;uniform float uOrbDepth;
// Geometry outline: the pattern itself, crisp, sampled at the same folded sheet position as the ink.
uniform sampler2D uGeo;uniform vec2 uGeoAsp;uniform vec4 uGeoT;uniform float uGeoLine;uniform vec3 uGeoA,uGeoB,uGeoC;uniform float uGeoNest;
// Ink, particles and pattern at one sheet position, tinted by how many mirrors the pixel went through.
vec3 sceneAt(vec2 uv,float parity){
  vec3 z=texture(uDye,uv).rgb;
  if(uPartOn>.5)z+=texture(uPart,uv).rgb;
  if(uGeoLine>0.){vec2 g=(uv-.5)*uGeoAsp/uGeoT.x;
    vec2 a=rot2(g,uGeoT.y),b=rot2(g,uGeoT.z);
    {vec3 L=vec3(texture(uGeo,a*.5+.5).r,texture(uGeo,b*.5+.5).g,texture(uGeo,g*.5+.5).b);
    if(uGeoT.w<.5)L*=vec3(step(max(abs(a.x),abs(a.y)),1.),step(max(abs(b.x),abs(b.y)),1.),step(max(abs(g.x),abs(g.y)),1.));
    z+=(uGeoA*L.r+uGeoB*L.g+uGeoC*L.b)*uGeoLine;
    // Nested copies (inner by phi, rotated) appear as the music grows more intricate.
    if(uGeoNest>.01){vec2 n=rot2(g*PHI,-uGeoT.y*1.5);vec2 m=rot2(g/PHI*.94,uGeoT.z*.7);
      float i1=texture(uGeo,n*.5+.5).r+texture(uGeo,n*.5+.5).g,o1=texture(uGeo,m*.5+.5).g+texture(uGeo,m*.5+.5).b;
      if(uGeoT.w<.5){i1*=step(max(abs(n.x),abs(n.y)),1.);o1*=step(max(abs(m.x),abs(m.y)),1.);}
      z+=(uGeoB*i1*.7+uGeoC*o1*.45)*uGeoLine*uGeoNest;}}}
  float a=uHue+parity*uParityHue;
  if(uChroma>0.)a+=uChroma*clamp(texture(uCurl,uv).x*.004,-1.,1.)*2.5;
  z=hueRotate(max(z,0.),a);
  // Vibrance: mixed inks drift towards grey; push each colour away from its own grey.
  {float g=dot(z,vec3(.299,.587,.114));z=max(vec3(g)+(z-g)*uVib,0.);}
  return z;
}
void main(){
  vec3 z;
  if(uOrb<=0.){
    vec2 uv=spaceUV(gl_FragCoord.xy);
    z=sceneAt(uv,gParity);
  }else{
    // A ball in front of an endless backdrop. Inside the ball: the picture wrapped on a sphere, lit, with a glowing rim.
    // Outside: the flat picture, darker and (in the final pass) out of focus. A one pixel blend hides the edge.
    float sh=min(uRes.x,uRes.y),rad=uOrb*sh,r=length(gl_FragCoord.xy-.5*uRes)/rad,e=1.5/rad;
    float m=1.-smoothstep(1.-e,1.+e,r),dp=uOrbDepth;
    vec3 zb=vec3(0.),zf=vec3(0.);
    if(m>0.){
      vec2 uv=wrapUV(spaceMapBall(gl_FragCoord.xy));
      zb=sceneAt(uv,gParity);
      vec3 N=gOrbN,Lg=normalize(uOrbL),H=normalize(Lg+vec3(0.,0.,1.));
      float df=max(dot(N,Lg),0.),fres=pow(1.-N.z,2.6),sp=pow(max(dot(N,H),0.),48.);
      float lit=mix(1.,.3+.95*df,dp);   // terminator: the far side of the ball falls into shadow
      vec3 rim=hueRotate(uOrbRim,uHue);
      zb=zb*lit+rim*fres*dp*1.1+sp*dp*.45*(zb+.12);
    }
    if(m<1.){
      vec2 uv=wrapUV(spaceMapFlat(gl_FragCoord.xy));
      zf=sceneAt(uv,gParity);
      zf*=1.-.62*dp;   // the backdrop sits far behind: dimmer
      zf+=hueRotate(uOrbRim,uHue)*exp(-max(r-1.,0.)*7.)*.35*dp;   // glow spilling round the ball
    }
    z=mix(zf,zb,m);
  }
  // Soft black floor: faint haze (z << floor) is crushed towards black, real ink loses only the floor. Keeps contrast.
  if(uFloor>0.){float l=max(z.r,max(z.g,z.b));z*=l/(l+uFloor);}
  vec3 c;
  if(uTone>.5){
    // Colour-true tone map: the brightest channel is compressed and the others keep their ratio to it, so dense ink
    // stays saturated instead of washing to white. Only very hot cores roll gently towards white.
    float m=max(z.r,max(z.g,z.b)),mm=1.-exp(-m*uExposure);
    c=m>1e-6?z*(mm/m):vec3(0.);
    c=mix(c,vec3(mm),clamp((m*uExposure-2.5)/7.,0.,.45));
  }else c=1.-exp(-z*uExposure);   // classic: the look every original preset was tuned on
  o=vec4(c,luma(c));
}
