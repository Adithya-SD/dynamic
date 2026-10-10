// Pass to screen: bloom, lens, liquid-glass UI, vignette, contrast, film grain, dither.
// Glass: every UI surface is a rounded-rect SDF; inside it the live image is refracted at the bezel,
// dispersed per channel and lit. Coordinates here are y-down pixels to match the UI layout.
in vec2 v;out vec4 o;
uniform sampler2D uImg,uBloom,uFarA,uFarB;
uniform sampler2D uGhost;uniform float uGhostA,uGhostT,uGhostK;uniform vec3 uGhostC;   // the last frame, melting away (76_trans.js)
uniform float uOrb,uDof;   // ball radius (short-side units) and how out of focus its backdrop is
uniform vec2 uRes;
uniform float uBloomAmt,uVig,uContrast,uGrain,uLens,uTime,uDp,uBlack,uSharp;
uniform vec4 uR[8];uniform vec2 uQ[8];
uniform sampler2D uUi;uniform float uUiA;   // interface ink (uiflow.frag): the interface melting into the flow
uniform float uN,uRefr,uBlur,uBezel,uDisp;
// Depth of field: behind the ball the picture is replaced by a wide soft blur (bokeh from the quarter and eighth size copies).
vec3 base(vec2 u){
  vec3 c=texture(uImg,u).rgb;
  if(uDof>0.){
    float r=length((u-.5)*uRes)/(uOrb*min(uRes.x,uRes.y));
    float m=smoothstep(.97,1.12,r)*uDof;
    if(m>0.){vec3 s=texture(uFarA,u).rgb*.4+texture(uFarB,u).rgb*.3;vec2 t=6.4/uRes;
      s+=(texture(uFarA,u+vec2(t.x,0.)).rgb+texture(uFarA,u-vec2(t.x,0.)).rgb+texture(uFarA,u+vec2(0.,t.y)).rgb+texture(uFarA,u-vec2(0.,t.y)).rgb)*.075;
      c=mix(c,s,m);}
  }
  return c;
}
vec3 img(vec2 f){vec2 u=vec2(f.x,uRes.y-f.y)/uRes;return base(u)+texture(uBloom,u).rgb*uBloomAmt;}
// The picture as the glass sees it: already blurred (Gaussian, built once per frame), plus glow.
vec3 frosted(vec2 f){vec2 u=vec2(f.x,uRes.y-f.y)/uRes;return texture(uFarB,u).rgb+texture(uBloom,u).rgb*uBloomAmt;}
float sd(vec2 p,vec4 R,float r){vec2 h=R.zw*.5,q=abs(p-R.xy-h)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){
  vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec3 col;
  if(uLens>0.){vec2 d=(v-.5)*uLens*.012;vec3 c0=base(v);   // colour fringes: the blurred backdrop has none, so only the sharp part is shifted
    float k=uDof>0.?smoothstep(.97,1.12,length((v-.5)*uRes)/(uOrb*min(uRes.x,uRes.y)))*uDof:0.;
    col=vec3(mix(texture(uImg,v+d).r,c0.r,k),c0.g,mix(texture(uImg,v-d).b,c0.b,k))+texture(uBloom,v).rgb*uBloomAmt;}
  else col=img(fc);
  if(uGhostA>0.){
    float t=uGhostT;
    if(uGhostK<.5){   // dissolve: the old picture drifts outwards a little as it fades
      col=mix(col,texture(uGhost,.5+(v-.5)/(1.+t*.05)).rgb,uGhostA);
    }else{   // ring of light opening from the centre: the new picture inside, the old one outside
      vec2 p=(v-.5)*uRes/min(uRes.x,uRes.y);float r=length(p),mx=.5*length(uRes/min(uRes.x,uRes.y))+.12,e=1.-pow(1.-t,2.2),rad=e*mx;
      float k=smoothstep(rad-.05,rad+.05,r),ring=exp(-pow((r-rad)/.02,2.))*(1.-t);
      col=mix(col,texture(uGhost,v).rgb,k)+uGhostC*ring*.9;
    }
  }
  if(uSharp>0.){   // unsharp mask on the picture itself (not the glass): crisp edges
    vec2 t=1./uRes;vec3 s0=texture(uImg,v+vec2(t.x,0.)).rgb+texture(uImg,v-vec2(t.x,0.)).rgb+texture(uImg,v+vec2(0.,t.y)).rgb+texture(uImg,v-vec2(0.,t.y)).rgb;
    col+=(texture(uImg,v).rgb-s0*.25)*uSharp;col=max(col,0.);}
  // Black point: whatever is fainter than this is pushed to true black, so fading ink never leaves a coloured smudge behind.
  if(uBlack>0.){float l=max(col.r,max(col.g,col.b)),x=l-uBlack;col*=.5*(x+sqrt(x*x+.00015))/max(l,1e-4)/(1.-uBlack);}   // levels with a soft knee: hue kept, haze to true black, the rest stretched back up
  float best=1e5,a=0.,rr=0.;vec4 R=vec4(0.);
  int nr=int(uN);for(int i=0;i<nr;i++){
    vec2 q=abs(fc-uR[i].xy-uR[i].zw*.5)-uR[i].zw*.5;if(max(q.x,q.y)>120.*uDp)continue;   // a panel's shadow is gone 120 px out: skip its distance field
    float d=sd(fc,uR[i],uQ[i].x);if(d<best){best=d;R=uR[i];rr=uQ[i].x;a=uQ[i].y;}}
  col*=1.-.32*a*exp(-max(best,0.)/(16.*uDp));
  if(best<0.){
    float B=min(22.*uDp*uBezel,.5*min(R.z,R.w)),dep=clamp(-best/B,0.,1.);
    vec2 e=vec2(1.,0.),g=vec2(sd(fc+e,R,rr)-sd(fc-e,R,rr),sd(fc+e.yx,R,rr)-sd(fc-e.yx,R,rr));g/=length(g)+1e-4;
    float f=1.-sqrt(1.-pow(1.-dep,2.));
    vec2 m=(fc-R.xy-R.zw*.5)*.05*uRefr;
    vec3 s=vec3(0.);
    // Refraction bends the lookup at the bezel and splits the colours a little; the middle sees the frosted picture.
    if(uBlur>.5){for(int c=0;c<3;c++)s[c]=frosted(fc-m+g*f*uRefr*B*(1.+(float(c)-1.)*uDisp))[c];
      s=mix(vec3(dot(s,vec3(.299,.587,.114))),s,1.22)*.86+.05;
      s*=1.-.5*smoothstep(.25,.7,dot(s,vec3(.299,.587,.114)));}   // a bright backdrop is dimmed under the glass so the text on it stays readable   // vibrancy and a lift, as the real material has
    else{for(int c=0;c<3;c++)s[c]=img(fc-m+g*f*uRefr*B*(1.+(float(c)-1.)*uDisp))[c];s=s*.72+.04;}
    float rim=exp(-max(-best,0.)/(1.6*uDp)),ang=dot(g,vec2(-.6,-.8)),sp=pow(max(ang,0.),1.5)+.55*pow(max(-ang,0.),2.);
    s+=rim*(.18+.85*sp)+(1.-dep)*(1.-dep)*.12*(.5+sp);
    s+=.06*(1.-clamp((fc.y-R.y)/R.w,0.,1.));
    col=mix(col,s,smoothstep(0.,1.5*uDp,-best)*a);
  }
  if(uUiA>0.){vec4 u=texture(uUi,v);col=col*(1.-u.a*uUiA)+u.rgb*uUiA;}
  col*=1.-uVig*dot(v-.5,v-.5);
  col=max((col-.35)*uContrast+.35,0.);
  float live=smoothstep(0.,.02,max(col.r,max(col.g,col.b)));
  if(uGrain>0.)col+=(hash12(gl_FragCoord.xy+fract(uTime*7.13)*917.)-.5)*uGrain*.12*(.4+col)*live;
  col+=(hash12(gl_FragCoord.xy*1.37+3.1)-.5)/255.*live;
  o=vec4(col,1.);
}
