// Two Jacobi pressure iterations in one render pass (watch only). Jacobi is p' = A p - d/4 with A the average of the four
// neighbours, so two steps are p'' = A^2 p - (d + A d)/4: nine reads of p and five of d. uS scales the incoming pressure
// (0.8 on the first pass: the warm start the reference WebGL-Fluid-Simulation uses, which replaces a separate copy pass).
precision SIMP float;
in highp vec2 v;out vec4 o;uniform sampler2D uP,uDiv;uniform highp vec2 uTx;uniform float uS;
void main(){highp vec2 a=vec2(uTx.x,0.),b=vec2(0.,uTx.y);
float p=4.*texture(uP,v).x+2.*(texture(uP,v+a+b).x+texture(uP,v+a-b).x+texture(uP,v-a+b).x+texture(uP,v-a-b).x)+texture(uP,v+2.*a).x+texture(uP,v-2.*a).x+texture(uP,v+2.*b).x+texture(uP,v-2.*b).x;
float d=texture(uDiv,v).x*.25+(texture(uDiv,v+a).x+texture(uDiv,v-a).x+texture(uDiv,v+b).x+texture(uDiv,v-b).x)*.0625;
o=vec4(uS*p*.0625-d,0.,0.,1.);}
