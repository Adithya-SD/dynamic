// Pass 1 at render resolution: fold space once per pixel, add particles, tone. Later passes read this texture
// instead of re-folding, which is what made the old renderer expensive at high resolution.
#include "space.glsl"
in vec2 v;out vec4 o;
uniform sampler2D uDye,uPart,uCurl;
uniform float uExposure,uHue,uParityHue,uChroma,uPartOn,uFloor,uVib;
// Geometry outline: the pattern itself, crisp, sampled at the same folded sheet position as the ink.
uniform sampler2D uGeo;uniform vec2 uGeoAsp;uniform vec4 uGeoT;uniform float uGeoLine;uniform vec3 uGeoA,uGeoB,uGeoC;uniform float uGeoNest;
void main(){
  vec2 uv=spaceUV(gl_FragCoord.xy);
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
  float a=uHue+gParity*uParityHue;
  if(uChroma>0.)a+=uChroma*clamp(texture(uCurl,uv).x*.004,-1.,1.)*2.5;
  z=hueRotate(max(z,0.),a);
  // Vibrance: mixed inks drift towards grey; push each colour away from its own grey.
  {float g=dot(z,vec3(.299,.587,.114));z=max(vec3(g)+(z-g)*uVib,0.);}
  // Soft black floor: faint haze (z << floor) is crushed towards black, real ink loses only the floor. Keeps contrast.
  if(uFloor>0.){float l=max(z.r,max(z.g,z.b));z*=l/(l+uFloor);}
  // Hue-preserving tone map: the brightest channel is compressed and the others keep their ratio to it, so dense ink
  // stays saturated instead of washing to white. Only very hot cores roll gently towards white.
  float m=max(z.r,max(z.g,z.b)),mm=1.-exp(-m*uExposure);
  vec3 c=m>1e-6?z*(mm/m):vec3(0.);
  c=mix(c,vec3(mm),clamp((m*uExposure-2.5)/7.,0.,.45));
  o=vec4(c,luma(c));
}
