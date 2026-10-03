in vec2 vD;in float vRad,vSeed;in vec4 vVal;out vec4 o;
uniform int uMode,uBrush;
void main(){
  float q=dot(vD,vD),w=exp(-q/vRad);
  if(uMode==1){
    if(uBrush==1)w=exp(-pow(sqrt(q)-sqrt(vRad)*1.5,2.)/(vRad*.2));
    else if(uBrush==2)w*=step(.45,hash12(gl_FragCoord.xy+vSeed*97.))*2.;
  }
  o=vVal*w;
}
