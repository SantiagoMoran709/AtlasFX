import type { ChromaKey } from '@corte/core';

type Visual = HTMLVideoElement | HTMLImageElement;
type RGB = [number, number, number];

function normalize(r: number, g: number, b: number): RGB {
  const sum = Math.max(r + g + b, 10.2);
  return [r / sum, g / sum, b / sum];
}

function smooth(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

const fragment = `
  precision mediump float;
  varying mediump vec2 uv;
  uniform sampler2D frame;
  uniform vec3 key;
  uniform vec3 controls;
  uniform vec3 spillChannel;
  void main() {
    vec4 pixel = texture2D(frame, uv);
    vec3 rgb = pixel.rgb;
    float distanceToKey = distance(rgb / max(dot(rgb, vec3(1.0)), 0.04), key);
    float outer = controls.x + max(controls.y, 0.001);
    float matte = smoothstep(controls.x, outer, distanceToKey);
    vec3 other = rgb * (vec3(1.0) - spillChannel);
    float excess = max(0.0, dot(rgb, spillChannel) - max(other.r, max(other.g, other.b)));
    float spill = (1.0 - smoothstep(controls.x, outer + 0.2, distanceToKey)) * controls.z;
    gl_FragColor = vec4(rgb - spillChannel * excess * spill, pixel.a * matte);
  }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error('Chroma shader compilation failed.');
  return shader;
}

function setupGpu() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  try {
    const vertex = compile(
      gl,
      gl.VERTEX_SHADER,
      `
      attribute vec2 position;
      varying mediump vec2 uv;
      void main() {
        uv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `,
    );
    const pixel = compile(gl, gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, pixel);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Chroma shader link failed.');
    gl.deleteShader(vertex);
    gl.deleteShader(pixel);
    gl.useProgram(program);
    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    return {
      canvas,
      gl,
      vertices,
      texture,
      program,
      limit: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      key: gl.getUniformLocation(program, 'key'),
      controls: gl.getUniformLocation(program, 'controls'),
      spillChannel: gl.getUniformLocation(program, 'spillChannel'),
    };
  } catch {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
}

function setSize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export class ChromaRenderer {
  private gpu = setupGpu();
  private cpu?: CanvasRenderingContext2D;

  render(
    source: Visual,
    sourceWidth: number,
    sourceHeight: number,
    scale: number,
    key: ChromaKey,
  ) {
    const width = Math.max(1, Math.round(sourceWidth * Math.min(scale, 1)));
    const height = Math.max(1, Math.round(sourceHeight * Math.min(scale, 1)));
    const hex = parseInt(key.color.slice(1), 16);
    const rgb = normalize(hex >> 16, (hex >> 8) & 255, hex & 255);
    const dominant = rgb.indexOf(Math.max(...rgb));
    const gpu = this.gpu;
    if (
      gpu &&
      !gpu.gl.isContextLost() &&
      Math.max(sourceWidth, sourceHeight) <= gpu.limit
    ) {
      const { gl, canvas } = gpu;
      setSize(canvas, width, height);
      gl.viewport(0, 0, width, height);
      gl.uniform3f(gpu.key, ...rgb);
      gl.uniform3f(gpu.controls, key.tolerance, key.softness, key.spill);
      gl.uniform3f(
        gpu.spillChannel,
        Number(dominant === 0),
        Number(dominant === 1),
        Number(dominant === 2),
      );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    }

    const ctx = (this.cpu ??= document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })!);
    setSize(ctx.canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height);
    const data = frame.data;
    const outer = key.tolerance + Math.max(key.softness, 0.001);
    const other1 = (dominant + 1) % 3;
    const other2 = (dominant + 2) % 3;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const sum = Math.max(data[i] + data[i + 1] + data[i + 2], 10.2);
      const r = data[i] / sum - rgb[0];
      const g = data[i + 1] / sum - rgb[1];
      const b = data[i + 2] / sum - rgb[2];
      const distance = Math.sqrt(r * r + g * g + b * b);
      data[i + 3] *= smooth(key.tolerance, outer, distance);
      if (key.spill && distance < outer + 0.2) {
        const excess = Math.max(
          0,
          data[i + dominant] - Math.max(data[i + other1], data[i + other2]),
        );
        data[i + dominant] -=
          excess *
          key.spill *
          (1 - smooth(key.tolerance, outer + 0.2, distance));
      }
    }
    ctx.putImageData(frame, 0, 0);
    return ctx.canvas;
  }

  dispose() {
    if (!this.gpu) return;
    const { gl, vertices, texture, program } = this.gpu;
    gl.deleteBuffer(vertices);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
