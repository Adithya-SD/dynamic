// Pass 1 at render resolution: fold space once per pixel, add particles, tone. Later passes read this texture
// instead of re-folding, which is what made the old renderer expensive at high resolution.
#include "space.glsl"
in vec2 v;out vec4 o;
uniform sampler2D uDye,uPart,uCurl;
uniform float uExposure,uHue,uParityHue,uChroma,uPartOn;
void main(){
  vec2 uv=spaceUV(gl_FragCoord.xy);
  vec3 z=texture(uDye,uv).rgb;
  if(uPartOn>.5)z+=texture(uPart,uv).rgb;
  float a=uHue+gParity*uParityHue;
  if(uChroma>0.)a+=uChroma*clamp(texture(uCurl,uv).x*.004,-1.,1.)*2.5;
  z=hueRotate(max(z,0.),a);
  vec3 c=1.-exp(-z*uExposure);
  o=vec4(c,luma(c));
}
