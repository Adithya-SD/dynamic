// Stereoscopic 3D. There is no real depth in a fluid picture, so depth is made from what the picture contains: bright ink and
// particles stand in front, the dark background recedes, a ball is a real sphere in front of its backdrop. Each eye sees the
// picture shifted sideways by (depth - focus) * separation (an inverse warp), which is what a second camera would see.
//   uMode 1 anaglyph (red/cyan glasses, Dubois matrices), 2 side by side (each eye is the middle of the picture at its true proportions, a crop and never a squeeze: 3D TVs, projectors,
//   cross-eyed viewing with Swap), 3 VR headset (each eye a centred crop in its half, lens pre-distortion, for phone viewers).
in vec2 v;out vec4 o;
uniform sampler2D uImg,uBloom,uFarA,uFarB;
uniform vec2 uRes;
uniform float uMode,uDepth,uConv,uSwap,uInv,uLens,uBloomAmt,uOrb,uDof;
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
float depthAt(vec2 u){
  float d=1.-exp(-lum(texture(uFarA,u).rgb)*3.2);                      // bright = near
  d=mix(d,1.-exp(-lum(texture(uFarB,u).rgb)*3.2),.35);               // a wider, steadier layer under it
  if(uOrb>0.){vec2 q=(u-.5)*uRes/min(uRes.x,uRes.y);float r=length(q)/uOrb;
    d=r<1.?mix(d,.62+.38*sqrt(max(1.-r*r,0.)),.85):mix(d,.1,.55);}      // the ball is a sphere in front of its backdrop
  return uInv>.5?1.-d:d;
}
// The picture one eye sees at u (0..1 over the whole picture); side = -1 left, +1 right.
vec3 eye(vec2 u,float side){
  float s=(depthAt(u)-uConv)*uDepth*.05*side;   // each eye shifts near and far things in opposite directions
  vec2 p=vec2(clamp(u.x+s,0.,1.),u.y);
  vec3 c=texture(uImg,p).rgb+texture(uBloom,p).rgb*uBloomAmt;
  if(uDof>0.){float m=smoothstep(.97,1.12,length((p-.5)*uRes)/(uOrb*min(uRes.x,uRes.y)))*uDof;
    if(m>0.)c=mix(c,texture(uFarA,p).rgb*.65+texture(uFarB,p).rgb*.35,m);}
  return c;
}
void main(){
  float sw=uSwap>.5?-1.:1.;
  if(uMode<1.5){   // anaglyph
    vec3 L=eye(v,-sw),R=eye(v,sw);
    o=vec4(max(vec3(
       dot(L,vec3(.437,.449,.164))-dot(R,vec3(.011,.032,.007)),
      -dot(L,vec3(.062,.062,.024))+dot(R,vec3(.377,.761,.009)),
      -dot(L,vec3(.048,.050,.017))-dot(R,vec3(.026,.093,-1.234))),0.),1.);
    return;
  }
  bool right=v.x>=.5;vec2 e=vec2(fract(v.x*2.),v.y);
  float side=(right?1.:-1.)*sw;
  if(uMode<2.5){o=vec4(eye(vec2(.5+(e.x-.5)*.5,e.y),side),1.);return;}   // side by side: the middle half of the picture fills each half of the screen, so nothing is stretched
  // VR headset: a centred crop with the eye's aspect, pushed through the lens correction
  vec2 c=e-.5;float asp=uRes.x*.5/uRes.y,k=uLens*.5;
  vec2 cr=vec2(c.x*asp,c.y);cr*=1.+k*dot(cr,cr)*1.6;c=vec2(cr.x/asp,cr.y);
  float ok=step(abs(c.x),.5)*step(abs(c.y),.5)*step(.003,abs(v.x-.5));
  o=vec4(eye(clamp(vec2(.5+c.x*.5,.5+c.y),0.,1.),side)*ok,1.);
}
