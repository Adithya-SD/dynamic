// One oversized triangle; no vertex buffers.
out vec2 v;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v=p;gl_Position=vec4(p*2.-1.,0.,1.);}
