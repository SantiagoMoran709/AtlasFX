import type {CinemaSettings} from '@corte/core';

const vertex = `
  attribute vec2 position;
  varying mediump vec2 uv;
  void main() {
    uv = position * .5 + .5;
    gl_Position = vec4(position, 0., 1.);
  }
`;

const fragment = `
  precision mediump float;
  varying mediump vec2 uv;
  uniform sampler2D frame;
  uniform vec3 lift, gamma, gain;
  uniform vec3 controls;
  uniform vec2 balance;
  uniform float intensity;
  uniform int style;
  float luma(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
  float classic(float c) {
    c = clamp(c, 0., 1.);
    if (c < .25) return mix(.02, .20, c * 4.);
    if (c < .75) return mix(.20, .82, (c - .25) * 2.);
    return mix(.82, .98, (c - .75) * 4.);
  }
  void main() {
    vec4 source = texture2D(frame, uv);
    vec3 c = source.rgb * controls.x;
    c += vec3(balance.x * .18 + balance.y * .06, -balance.y * .12, -balance.x * .18 + balance.y * .06);
    c = (c - .5) * controls.y + .5;
    c = gain * (c + lift * (1. - clamp(c, 0., 1.)));
    c = pow(max(c, 0.), 1. / gamma);
    c = mix(vec3(luma(c)), c, controls.z);
    float y = luma(source.rgb);
    float shadows = 1. - smoothstep(.03, .52, y);
    float highs = smoothstep(.45, .96, y);
    float warmth = source.r - source.b;
    if (style == 3) {
      c = mix(vec3(luma(c)), c, 1. + .20 * smoothstep(.06, .36, length(source.rgb - vec3(y))));
      c += vec3(.20, 0., .20) * shadows + vec3(0., .30, .30) * highs;
      c = max(c, .02);
    }
    if (style == 4) c.g += .15 * shadows;
    if (style == 5) c += vec3(.15, .08, 0.) * highs + vec3(0., .03, .10) * shadows;
    if (style == 6) c = mix(vec3(luma(c)), c, mix(.20, 1.40, smoothstep(-.04, .12, warmth)));
    if (style == 7) {
      float orange = smoothstep(.04, .22, warmth) * smoothstep(.01, .13, source.g - source.b);
      c = mix(vec3(luma(c)), c, 1. + .05 * orange);
      c += vec3(.04, -.015, .05) * orange;
      c = .06 + .94 * c - .15 * highs * max(c - .60, 0.);
    }
    if (style == 8) {
      float cool = smoothstep(.02, .25, max(source.g, source.b) - source.r);
      c = mix(vec3(luma(c)), c, 1. + .40 * cool);
    }
    if (style == 9) {
      vec3 weights = vec3(.2126 * 1.3, .7152, .0722 * .7);
      c = vec3(dot(c, weights) / (weights.r + weights.g + weights.b));
    }
    if (style == 1) c = vec3(classic(luma(c)));
    if (style == 2) c = mix(c, vec3((luma(c) - .5) * 1.3 + .5), .4);
    gl_FragColor = vec4(mix(source.rgb, clamp(c, 0., 1.), intensity), source.a);
  }
`;

function makeProgram(gl:WebGLRenderingContext) {
  const program=gl.createProgram()!;
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const shader=gl.createShader(type)!;
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    gl.attachShader(program,shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    gl.deleteProgram(program);
    return undefined;
  }
  return program;
}

const styles: Partial<Record<CinemaSettings['look'],number>> = {
  mono:1, bleach:2, cyberpunk:3, horror:4, goldenHour:5, bloodbath:6, portra:7, velvia:8, fineArt:9,
};

export function createCatalogGrade(){
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl',{antialias:false});
  if(!gl)return undefined;
  const program=makeProgram(gl);
  if(!program)return undefined;
  gl.useProgram(program);
  const vertices=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  const uniforms=Object.fromEntries(['lift','gamma','gain','controls','balance','intensity','style']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  let previous:HTMLCanvasElement|undefined;
  let width=0,height=0;
  return {
    draw(source:HTMLCanvasElement,settings:CinemaSettings){
      const grade=settings.grade!;
      if(gl.isContextLost())return undefined;
      if(source!==previous||source.width!==width||source.height!==height){
        previous=source;
        canvas.width=width=source.width;
        canvas.height=height=source.height;
        gl.viewport(0,0,width,height);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      }else{
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
      }
      gl.uniform3fv(uniforms.lift,grade.lift);
      gl.uniform3fv(uniforms.gamma,grade.gamma);
      gl.uniform3fv(uniforms.gain,grade.gain);
      gl.uniform3f(uniforms.controls,2**grade.exposure,grade.contrast,grade.saturation);
      gl.uniform2f(uniforms.balance,grade.temperature/100,grade.tint/100);
      gl.uniform1f(uniforms.intensity,settings.intensity);
      gl.uniform1i(uniforms.style,styles[settings.look]??0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      return canvas;
    },
    dispose(){
      gl.deleteTexture(texture);
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
