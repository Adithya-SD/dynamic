/* WebGL2 host: programs, render targets and reflected uniform setters. The C++ host mirrors this. */
const cv=$('#cv');
const gl=cv.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance',desynchronized:true});
if(!gl&&WATCH){location.replace('watch.html');throw Error('WebGL2 unavailable: opening Dynamic Lite')}
if(!gl){document.body.innerHTML='<p style="padding:40px;font:16px system-ui;color:#fff">Dynamic needs WebGL2. Update your browser or enable hardware acceleration.</p>';throw Error('WebGL2 unavailable')}
const floatTargets=!!gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');gl.getExtension('EXT_float_blend');
const timerExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');
const HEADER='#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\n';
const emptyVao=gl.createVertexArray();

/* Programs compile asynchronously (KHR_parallel_shader_compile) so boot never stalls the page, and each
   variant is keyed by its #defines. Windows D3D compiles are slow (seconds), so everything is started in parallel. */
const KHR=gl.getExtension('KHR_parallel_shader_compile');
const programs=new Map(),programTimes={};
function startProgram(vs,fs,defs){
  const key=vs+'|'+fs+'|'+defs.replace(/\s+/g,' ').trim();let e=programs.get(key);if(e)return e;
  const p=gl.createProgram(),sh=[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].map(([type,name])=>{const s=gl.createShader(type);gl.shaderSource(s,HEADER+defs+SHADERS[name]);gl.compileShader(s);gl.attachShader(p,s);return s});
  gl.linkProgram(p);e={p,sh,key,t0:performance.now(),ready:false,failed:false,u:null,error:''};programs.set(key,e);return e;
}
function finishProgram(e){
  if(e.ready||e.failed)return;
  if(gl.getProgramParameter(e.p,gl.LINK_STATUS)){
    const u={};
    for(let i=0,n=gl.getProgramParameter(e.p,gl.ACTIVE_UNIFORMS);i<n;i++){const info=gl.getActiveUniform(e.p,i),name=info.name.replace(/\[0\]$/,'');u[name]={loc:gl.getUniformLocation(e.p,info.name),type:info.type,size:info.size}}
    e.u=u;e.ready=true;
  }else{e.failed=true;e.error=e.key+': '+e.sh.map(s=>gl.getShaderInfoLog(s)).join(' ')+' '+gl.getProgramInfoLog(e.p);console.error(e.error)}
  for(const s of e.sh){gl.detachShader(e.p,s);gl.deleteShader(s)}e.sh=null;programTimes[e.key]=Math.round(performance.now()-e.t0);
}
const compileDone=e=>e.ready||e.failed||!KHR||gl.getProgramParameter(e.p,KHR.COMPLETION_STATUS_KHR);
/* Blocking: used for anything not warmed up (rare). */
function program(vs,fs,defs=''){const e=startProgram(vs,fs,defs);finishProgram(e);if(e.failed)throw Error(e.error);return e}
/* Non-blocking: the program if its compile has finished, else null (and the compile is under way). */
function programIfReady(vs,fs,defs=''){const e=startProgram(vs,fs,defs);if(!e.ready&&!e.failed&&compileDone(e))finishProgram(e);return e.ready?e:null}
/* Start every program at once and resolve when all are linked. */
function warmPrograms(list,onProgress){
  const es=list.map(([vs,fs,defs])=>startProgram(vs,fs,defs||''));
  return new Promise(res=>{const tick=()=>{let n=0;for(const e of es){if(!e.ready&&!e.failed&&compileDone(e))finishProgram(e);if(e.ready||e.failed)n++}onProgress&&onProgress(n,es.length);if(n===es.length)res(es.filter(e=>e.failed).map(e=>e.error));else setTimeout(tick,30)};tick()});
}
const SAMPLERS=new Set([gl.SAMPLER_2D]);
function setUniforms(prog,values){
  let unit=0;
  for(const k in values){
    const info=prog.u[k];if(!info)continue;const x=values[k],L=info.loc;
    switch(info.type){
      case gl.SAMPLER_2D:gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,x.tex||x);gl.uniform1i(L,unit++);break;
      case gl.FLOAT:info.size>1?gl.uniform1fv(L,x):gl.uniform1f(L,x);break;
      case gl.FLOAT_VEC2:gl.uniform2fv(L,x);break;
      case gl.FLOAT_VEC3:gl.uniform3fv(L,x);break;
      case gl.FLOAT_VEC4:gl.uniform4fv(L,x);break;
      case gl.INT:case gl.BOOL:gl.uniform1i(L,x);break;
    }
  }
}
const FORMATS={
  rgba16f:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT],rg16f:[gl.RG16F,gl.RG,gl.HALF_FLOAT],r16f:[gl.R16F,gl.RED,gl.HALF_FLOAT],
  rgba32f:[gl.RGBA32F,gl.RGBA,gl.FLOAT],rgba8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE]
};
const liveTargets=new Set();
function target(w,h,fmt='rgba16f',{nearest=false,wrap=false}={}){
  w=Math.max(1,Math.round(w))|0;h=Math.max(1,Math.round(h))|0;
  const[internal,format,type]=FORMATS[fmt],tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  const f=nearest?gl.NEAREST:gl.LINEAR,wr=wrap?gl.REPEAT:gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wr);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wr);
  gl.texStorage2D(gl.TEXTURE_2D,1,internal,w,h);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if(status!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(fb);gl.deleteTexture(tex);throw Error(`GPU cannot render to ${fmt} ${w}×${h}`)}
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  const t={tex,fb,w,h,fmt,wrap,bytes:w*h*{rgba16f:8,rg16f:4,r16f:2,rgba32f:16,rgba8:4}[fmt]};liveTargets.add(t);return t;
}
function pair(w,h,fmt,opt){return{r:target(w,h,fmt,opt),w:target(w,h,fmt,opt),swap(){const t=this.r;this.r=this.w;this.w=t}}}
function kill(t){if(!t)return;if(t.r){kill(t.r);kill(t.w);return}gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fb);liveTargets.delete(t)}
function setWrap(t,wrap){for(const x of t.r?[t.r,t.w]:[t]){gl.bindTexture(gl.TEXTURE_2D,x.tex);const m=wrap?gl.REPEAT:gl.CLAMP_TO_EDGE;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,m);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,m);x.wrap=wrap}}
function bindOut(t){gl.bindFramebuffer(gl.FRAMEBUFFER,t?t.fb:null);t?gl.viewport(0,0,t.w,t.h):gl.viewport(0,0,cv.width,cv.height)}
/* Full-screen pass: run fragment shader `fs` into target `t` (null = screen). */
function pass(fs,values,t,defs=''){const prog=program('fullscreen.vert',fs,defs);gl.useProgram(prog.p);setUniforms(prog,values);bindOut(t);gl.bindVertexArray(emptyVao);gl.drawArrays(gl.TRIANGLES,0,3)}
function clearTarget(t){for(const x of t.r?[t.r,t.w]:[t]){gl.bindFramebuffer(gl.FRAMEBUFFER,x.fb);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}}
