// Pass to screen: bloom, lens, liquid-glass UI, vignette, contrast, film grain, dither.
// Glass: every UI surface is a rounded-rect SDF; inside it the live image is refracted at the bezel,
// dispersed per channel and lit. Coordinates here are y-down pixels to match the UI layout.
in vec2 v;out vec4 o;
uniform sampler2D uImg,uBloom;
uniform vec2 uRes;
uniform float uBloomAmt,uVig,uContrast,uGrain,uLens,uTime,uDp;
uniform vec4 uR[8];uniform vec2 uQ[8];uniform float uX[8];
uniform float uN,uRefr,uBlur,uBezel,uDisp;
vec3 img(vec2 f){vec2 u=vec2(f.x,uRes.y-f.y)/uRes;return texture(uImg,u).rgb+texture(uBloom,u).rgb*uBloomAmt+vec3(.012,.016,.03)+.035*vec3(.4,.5,1.)*u.y;}
float sd(vec2 p,vec4 R,float r){vec2 h=R.zw*.5,q=abs(p-R.xy-h)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){
  vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec3 col;
  if(uLens>0.){vec2 d=(v-.5)*uLens*.012;col=vec3(texture(uImg,v+d).r,texture(uImg,v).g,texture(uImg,v-d).b)+texture(uBloom,v).rgb*uBloomAmt+vec3(.012,.016,.03)+.035*vec3(.4,.5,1.)*v.y;}
  else col=img(fc);
  float best=1e5,a=0.,rr=0.,dsv=0.;vec4 R=vec4(0.);
  int nr=int(uN);for(int i=0;i<nr;i++){float d=sd(fc,uR[i],uQ[i].x);if(d<best){best=d;R=uR[i];rr=uQ[i].x;a=uQ[i].y;dsv=uX[i];}}
  col*=1.-.32*a*(1.-dsv)*exp(-max(best,0.)/(16.*uDp));
  if(best<0.){
    float B=min(22.*uDp*uBezel,.5*min(R.z,R.w)),dep=clamp(-best/B,0.,1.);
    vec2 e=vec2(1.,0.),g=vec2(sd(fc+e,R,rr)-sd(fc-e,R,rr),sd(fc+e.yx,R,rr)-sd(fc-e.yx,R,rr));g/=length(g)+1e-4;
    float f=1.-sqrt(1.-pow(1.-dep,2.));
    float nz=vnoise(fc/(30.*uDp)+uTime*.35)*.65+vnoise(fc/(9.*uDp)-uTime)*.35;
    vec2 m=(fc-R.xy-R.zw*.5)*.05*uRefr+dsv*vec2(nz-.5,vnoise(fc/(24.*uDp)+7.)-.5)*90.*uDp;
    vec3 s=vec3(0.);int taps=uBlur>.01?6:1;
    for(int k=0;k<taps;k++){
      float an=float(k)*2.399,rd=taps==1?0.:sqrt((float(k)+.5)/6.)*uBlur*uDp;vec2 o2=vec2(cos(an),sin(an))*rd;
      for(int c=0;c<3;c++)s[c]+=img(fc-m+o2+g*f*uRefr*B*(1.+(float(c)-1.)*uDisp))[c];}
    s=s/float(taps)*.72+.04;
    float rim=exp(-max(-best,0.)/(1.6*uDp)),ang=dot(g,vec2(-.6,-.8)),sp=pow(max(ang,0.),1.5)+.55*pow(max(-ang,0.),2.);
    s+=rim*(.18+.85*sp)+(1.-dep)*(1.-dep)*.12*(.5+sp);
    s+=.06*(1.-clamp((fc.y-R.y)/R.w,0.,1.));
    float cvg=smoothstep(dsv*1.25-.25,dsv*1.25-.05,nz),ins=smoothstep(0.,1.5*uDp,-best);
    col=mix(col,s,ins*a*cvg);col+=cvg*(1.-cvg)*4.*step(.001,dsv)*(.3+col)*ins;
  }
  col*=1.-uVig*dot(v-.5,v-.5);
  col=max((col-.35)*uContrast+.35,0.);
  if(uGrain>0.)col+=(hash12(gl_FragCoord.xy+fract(uTime*7.13)*917.)-.5)*uGrain*.12*(.4+col);
  col+=(hash12(gl_FragCoord.xy*1.37+3.1)-.5)/255.;
  o=vec4(col,1.);
}
