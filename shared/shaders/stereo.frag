// Stereoscopic 3D. A fluid picture has no real depth, so depth is made from what it contains: bright ink and particles stand in
// front, the dark background recedes, a ball is a real sphere in front of its backdrop. Each eye sees the picture shifted
// sideways by (depth - focus) * separation, which is what a second camera would see (depth-image-based rendering, done as an
// inverse warp so there are no holes; the lookup is refined once because the depth under the shifted point is the one that counts).
//   uMode 1  red/cyan glasses (Dubois matrices), the whole picture for each eye.
//   uMode 2  side by side, parallel: left eye's picture on the left. Free viewing (no glasses) only works when the centres of the two
//            pictures are no further apart than your eyes (about 62 mm), so the pair is built from two adjacent pictures whose
//            width the app sizes to your screen (uPair = share of the screen the pair takes up).
//   uMode 3  side by side, cross-eyed: the same pair with the eyes swapped.
//   uMode 4  VR headset (Cardboard style): one picture per half, centred on the lenses (uIpd = eye spacing as a share of the screen
//            width), pre-distorted to cancel the lenses.
// Everything the two pictures show is identical apart from the sideways shift (the film grain in the final pass uses matching
// positions in both), because mismatched noise stops the eyes from merging them.
in vec2 v;out vec4 o;
uniform sampler2D uImg,uBloom,uFarA,uFarB;
uniform vec2 uRes;
uniform float uMode,uDepth,uConv,uSwap,uInv,uLens,uBloomAmt,uOrb,uDof,uPair,uGuide,uIpd;
const float PARALLAX=.1;   // near-to-far disparity at Depth 1, as a share of the width of the picture on show
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
float depthAt(vec2 u){
  float d=1.-exp(-lum(texture(uFarA,u).rgb)*3.2);                      // bright = near
  d=mix(d,1.-exp(-lum(texture(uFarB,u).rgb)*3.2),.35);               // a wider, steadier layer under it
  if(uOrb>0.){vec2 q=(u-.5)*uRes/min(uRes.x,uRes.y);float r=length(q)/uOrb;
    d=r<1.?mix(d,.62+.38*sqrt(max(1.-r*r,0.)),.85):mix(d,.1,.55);}      // the ball is a sphere in front of its backdrop
  return uInv>.5?1.-d:d;
}
// The picture one eye sees at u (0..1 across the whole picture); side = -1 left eye, +1 right eye; rw = how much of the picture's
// width is on show (the disparity is a share of what is on show, so it reads the same in every layout).
vec3 eye(vec2 u,float side,float rw){
  float k=uDepth*PARALLAX*.5*rw*side;
  float s=(depthAt(u)-uConv)*k;
  s=(depthAt(vec2(clamp(u.x+s,0.,1.),u.y))-uConv)*k;
  vec2 p=vec2(clamp(u.x+s,0.,1.),u.y);
  vec3 c=texture(uImg,p).rgb+texture(uBloom,p).rgb*uBloomAmt;
  if(uDof>0.){float m=smoothstep(.97,1.12,length((p-.5)*uRes)/(uOrb*min(uRes.x,uRes.y)))*uDof;
    if(m>0.)c=mix(c,texture(uFarA,p).rgb*.65+texture(uFarB,p).rgb*.35,m);}
  return c;
}
void main(){
  float sw=uSwap>.5?-1.:1.;
  if(uMode<1.5){   // red/cyan glasses
    vec3 L=eye(v,-sw,1.),R=eye(v,sw,1.);
    o=vec4(max(vec3(
       dot(L,vec3(.437,.449,.164))-dot(R,vec3(.011,.032,.007)),
      -dot(L,vec3(.062,.062,.024))+dot(R,vec3(.377,.761,.009)),
      -dot(L,vec3(.048,.050,.017))-dot(R,vec3(.026,.093,-1.234))),0.),1.);
    return;
  }
  if(uMode<3.5){   // side by side: two adjacent pictures, each the middle of the whole picture at its true shape
    bool right=v.x>=.5;float p=uPair;
    vec2 l=vec2(right?(v.x-.5)/(.5*p):(v.x-(.5-.5*p))/(.5*p),(v.y-.5)/p+.5);   // 0..1 inside this picture
    float inside=step(0.,l.x)*step(l.x,1.)*step(0.,l.y)*step(l.y,1.);
    float side=(right?1.:-1.)*sw*(uMode>2.5?-1.:1.);   // cross-eyed: each eye's picture sits on the opposite side
    vec3 c=eye(vec2(.25+clamp(l.x,0.,1.)*.5,clamp(l.y,0.,1.)),side,.5)*inside;
    if(uGuide>.5){
      vec2 px=vec2(min(l.x,1.-l.x)*p*.5*uRes.x,min(l.y,1.-l.y)*p*uRes.y);
      float fr=inside*smoothstep(2.4,1.2,min(px.x,px.y));   // a thin frame: the same in both pictures, it helps the eyes lock on
      c=mix(c,vec3(.55),fr*.8);
      float dd=length((v-vec2(.5+(right?.25:-.25)*p,.94))*uRes)/(min(uRes.x,uRes.y)*.011);   // matching dots: three dots = eyes lined up
      c=mix(c,vec3(1.),smoothstep(1.,.75,dd));}
    o=vec4(c,1.);return;
  }
  // VR headset: a centred crop with the eye's aspect, pushed through the lens correction
  bool right=v.x>=.5;vec2 e=vec2(fract(v.x*2.),v.y);
  vec2 c=e-vec2(right?uIpd:1.-uIpd,.5);float asp=uRes.x*.5/uRes.y,k=uLens*.5;
  vec2 cr=vec2(c.x*asp,c.y);cr*=1.+k*dot(cr,cr)*1.6;c=vec2(cr.x/asp,cr.y);
  float ok=step(abs(c.x),.5)*step(abs(c.y),.5)*step(.003,abs(v.x-.5));
  o=vec4(eye(clamp(vec2(.5+c.x*.5,.5+c.y),0.,1.),(right?1.:-1.)*sw,.5)*ok,1.);
}
