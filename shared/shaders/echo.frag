// Video feedback: the previous frame, slightly scaled and turned, sinks under the new one: infinite tunnels.
in vec2 v;out vec4 o;uniform sampler2D uCur,uPrev;uniform float uEcho,uZoom,uTwist;uniform vec2 uAspect,uCenter;
void main(){
  vec2 ct=.5+uCenter;   // tilt steers the tunnel
  vec2 p=rot2((v-ct)*uAspect,uTwist)*(1.-uZoom)/uAspect+ct;
  vec3 prev=all(greaterThanEqual(p,vec2(0.)))&&all(lessThanEqual(p,vec2(1.)))?texture(uPrev,p).rgb*uEcho:vec3(0.);
  vec4 cur=texture(uCur,v);
  vec3 c=max(cur.rgb,prev); // max, not add: feedback fades out instead of climbing to white
  o=vec4(c,luma(c));
}
