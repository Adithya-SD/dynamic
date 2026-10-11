// One oversized triangle; no vertex buffers.
// The four neighbours one texel away (uTx) come out of the vertex shader, as in PavelDoGreat/WebGL-Fluid-Simulation: a texture
// read at an interpolated coordinate is not a "dependent" read, which tiled mobile GPUs (Mali, Adreno) can fetch ahead of time.
// Passes that do not read vL..vB (or do not set uTx) simply ignore them.
out vec2 v;out vec2 vL,vR,vT,vB;uniform vec2 uTx;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v=p;vL=p-vec2(uTx.x,0.);vR=p+vec2(uTx.x,0.);vT=p+vec2(0.,uTx.y);vB=p-vec2(0.,uTx.y);gl_Position=vec4(p*2.-1.,0.,1.);}
