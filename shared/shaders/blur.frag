// Separable Gaussian, 9 taps in 5 fetches (the bilinear trick). Run once along x, once along y.
in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform vec2 uDir;
void main(){
  o=vec4(texture(uSrc,v).rgb*.2270270270+(texture(uSrc,v+uDir*1.3846153846).rgb+texture(uSrc,v-uDir*1.3846153846).rgb)*.3162162162+(texture(uSrc,v+uDir*3.2307692308).rgb+texture(uSrc,v-uDir*3.2307692308).rgb)*.0702702703,1.);
}
