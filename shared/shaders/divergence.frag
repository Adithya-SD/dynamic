precision SIMP float;
in highp vec2 v,vL,vR,vT,vB;out vec4 o;uniform sampler2D uVel;uniform float uWalls;
void main(){vec2 C=texture(uVel,v).xy;
float L=texture(uVel,vL).x,R=texture(uVel,vR).x,T=texture(uVel,vT).y,B=texture(uVel,vB).y;
if(uWalls>.5){if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;}
o=vec4(.5*(R-L+T-B),0.,0.,1.);}
