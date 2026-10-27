// <InkField/>: stamp-pad ink diffusing in water. A single full-screen WebGL
// fragment shader (domain-warped fbm), rendered at reduced resolution, paused
// off-screen / in hidden tabs, one still frame under reduced motion. ~3KB.
import { useEffect, useRef } from 'react';
import { REDUCED } from '../util.js';

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec2 m;uniform float mi;uniform vec3 bg,c0,c1,c2;uniform float amp;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.03;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec2 p=(gl_FragCoord.xy-.5*r)/min(r.x,r.y)*1.7;
  vec2 mm=(m-.5)*r/min(r.x,r.y)*1.7;
  float d=length(p-mm);
  p+=normalize(p-mm+1e-4)*.22*exp(-d*d*2.2)*mi;
  float T=t*.045;
  vec2 q=vec2(fbm(p+vec2(0.,T)),fbm(p+vec2(5.2,1.3)-T));
  vec2 s=vec2(fbm(p+3.2*q+vec2(1.7,9.2)+T*1.4),fbm(p+3.2*q+vec2(8.3,2.8)-T*.8));
  float f=fbm(p+3.4*s);
  vec3 col=mix(bg,c0,smoothstep(.32,.95,f));
  col=mix(col,c1,smoothstep(.55,1.15,length(q))*.75);
  col=mix(col,c2,smoothstep(.62,1.,s.y)*.55*f);
  float v=smoothstep(1.05,.15,length((uv-vec2(.5,.55))*vec2(1.15,1.5)));
  col=mix(bg,col,v*amp);
  col+=(h(gl_FragCoord.xy+fract(t))-.5)*.035;
  gl_FragColor=vec4(col,1.);
}`;

const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export const INK_DARK = { bg: '#0d0916', c0: '#2e1065', c1: '#7c3aed', c2: '#c4b5fd' };
export const INK_LIGHT = { bg: '#0d0916', c0: '#2e1065', c1: '#7c3aed', c2: '#c4b5fd' };

export default function InkField({ palette, dark, amp = 1, scale = 0.5, speed = 1, className = '', interactive = true }) {
  const ref = useRef(null);
  const st = useRef({});
  st.current.pal = palette || (dark ? INK_DARK : INK_LIGHT);
  st.current.amp = amp;

  useEffect(() => {
    const cv = ref.current;
    const gl = cv && (cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' }));
    if (!gl) { if (cv) cv.style.display = 'none'; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.style.display = 'none'; return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['r', 't', 'm', 'mi', 'bg', 'c0', 'c1', 'c2', 'amp'].forEach(k => (U[k] = gl.getUniformLocation(pr, k)));

    let raf = 0, visible = true, t0 = performance.now(), last = 0;
    const mouse = { x: .5, y: .5, tx: .5, ty: .5, i: 0, ti: 0 };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    };
    const draw = now => {
      size();
      const p = st.current.pal;
      mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05; mouse.i += (mouse.ti - mouse.i) * .04;
      gl.uniform2f(U.r, cv.width, cv.height);
      gl.uniform1f(U.t, ((now - t0) / 1000) * speed + 20);
      gl.uniform2f(U.m, mouse.x, mouse.y);
      gl.uniform1f(U.mi, mouse.i);
      gl.uniform3fv(U.bg, hex(p.bg)); gl.uniform3fv(U.c0, hex(p.c0)); gl.uniform3fv(U.c1, hex(p.c1)); gl.uniform3fv(U.c2, hex(p.c2));
      gl.uniform1f(U.amp, st.current.amp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (now - last < 32) return;              // ~30fps is plenty for ink
      last = now; draw(now);
    };
    const start = () => { if (!raf && visible && !document.hidden && !REDUCED) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    draw(performance.now());
    start();
    st.current.redraw = () => draw(performance.now());

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
    io.observe(cv);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const onMove = e => {
      if (!interactive) return;
      const r = cv.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width; mouse.ty = 1 - (e.clientY - r.top) / r.height;
      mouse.ti = (mouse.tx >= 0 && mouse.tx <= 1 && mouse.ty >= 0 && mouse.ty <= 1) ? 1 : 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    const ro = new ResizeObserver(() => { if (!raf) draw(performance.now()); });
    ro.observe(cv);
    return () => {
      stop(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    };
  }, [scale, speed, interactive]);

  useEffect(() => { st.current.redraw && st.current.redraw(); }, [dark, palette, amp]);

  return <canvas ref={ref} className={'fx-canvas ink-field ' + className} aria-hidden="true" />;
}
