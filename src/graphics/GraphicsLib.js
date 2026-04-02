/**
 * GraphicsLib.js — Implementación canvas de tortuga.h y processing.h
 *
 * Reimplementa las funciones gráficas de Windows GDI usando HTML5 Canvas 2D.
 * Las coordenadas del mundo usan sistema matemático (Y↑), se transforman
 * al sistema de canvas (Y↓) mediante worldToScreen().
 */

export class GraphicsLib {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');

    // ── Modo de coordenadas ──────────────────────────────────────────
    this.coordMode = 'logo'; // 'logo' o 'processing'
    this.vp = { left: -250, right: 250, top: 250, bottom: -250 };

    // ── Estado de la tortuga ──────────────────────────────────────────
    this.turtle = {
      x:       0,
      y:       0,
      angle:   -90,    // -90 = apunta hacia arriba (norte)
      pen:     true,
      penR: 255, penG: 0, penB: 0,
      penWidth: 2,
      visible: true,
    };

    // ── Overlay canvas para la tortuga (dibujado encima del principal) ──
    this._turtleCanvas = document.createElement('canvas');
    this._turtleCanvas.width  = canvas.width;
    this._turtleCanvas.height = canvas.height;
    this._turtleCanvas.style.position = 'absolute';
    this._turtleCanvas.style.top  = '0';
    this._turtleCanvas.style.left = '0';
    this._turtleCanvas.style.width  = '100%';
    this._turtleCanvas.style.height = '100%';
    this._turtleCanvas.style.objectFit  = 'contain';
    this._turtleCanvas.style.objectPosition = 'left top';
    this._turtleCanvas.style.pointerEvents = 'none';
    canvas.parentElement?.appendChild(this._turtleCanvas);
    this._tctx = this._turtleCanvas.getContext('2d');

    // ── Resize Observer para mantener sincronismo ────────────────────
    this._initResizeObserver();

    // ── Velocidad de animación ───────────────────────────────────────
    this.speed = 5; // 0 = instantáneo, 1 = lento, 10 = rápido
    this.frameTime = 16; // ~60fps

    // ── Inicializar fondo negro ───────────────────────────────────────
    this._clearCanvas(0, 0, 0);
    this._drawTurtle();
  }

  // Helper para pausas
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Utilidades de color ─────────────────────────────────────────────
  // GDI RGB(r,g,b) = r | (g<<8) | (b<<16)
  _packRGB(r, g, b) {
    return ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
  }
  _unpackRGB(color) {
    return {
      r: (color)        & 0xFF,
      g: (color >> 8)   & 0xFF,
      b: (color >> 16)  & 0xFF,
    };
  }
  _cssColor(packed) {
    const { r, g, b } = this._unpackRGB(packed);
    return `rgb(${r},${g},${b})`;
  }
  _penCss() {
    return `rgb(${this.turtle.penR},${this.turtle.penG},${this.turtle.penB})`;
  }

  // ── Transformación de coordenadas ───────────────────────────────────
  _toScreenX(wx) {
    return (wx - this.vp.left) / (this.vp.right - this.vp.left) * this.canvas.width;
  }
  _toScreenY(wy) {
    if (this.coordMode === 'processing') {
      // Y↓: origen arriba, aumenta hacia abajo
      return (wy - this.vp.top) / (this.vp.bottom - this.vp.top) * this.canvas.height;
    } else {
      // Y↑: origen centro (o abajo), aumenta hacia arriba
      return (this.vp.top - wy) / (this.vp.top - this.vp.bottom) * this.canvas.height;
    }
  }
  _scaleX(dw) {
    return dw / (this.vp.right - this.vp.left) * this.canvas.width;
  }
  _scaleY(dh) {
    return dh / (this.vp.top - this.vp.bottom) * this.canvas.height;
  }

  // ── Dibujar tortuga ─────────────────────────────────────────────────
  _drawTurtle() {
    const tc = this._tctx;
    tc.clearRect(0, 0, this._turtleCanvas.width, this._turtleCanvas.height);
    if (!this.turtle.visible) return;

    const sx = this._toScreenX(this.turtle.x);
    const sy = this._toScreenY(this.turtle.y);
    const angleRad = (this.turtle.angle * Math.PI) / 180;
    // En canvas flipped Y: angleRad ya tiene el giro correcto.
    const ca = angleRad;

    const size = 12;
    tc.save();
    tc.translate(sx, sy);
    tc.rotate(ca);
    tc.beginPath();
    tc.moveTo(size, 0);
    tc.lineTo(-size * 0.6,  size * 0.5);
    tc.lineTo(-size * 0.6, -size * 0.5);
    tc.closePath();
    tc.strokeStyle = '#00FF88';
    tc.lineWidth   = 1.5;
    tc.stroke();
    tc.fillStyle   = 'rgba(0, 255, 136, 0.9)';
    tc.fill();
    tc.restore();
  }

  // ── Inicializar/limpiar canvas ──────────────────────────────────────
  _clearCanvas(r, g, b) {
    this.ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ── API interna ─────────────────────────────────────────────────────

  async _forward(dist) {
    const a   = this.turtle.angle * Math.PI / 180;
    const x1  = this.turtle.x;
    const y1  = this.turtle.y;
    const x2  = x1 + Math.cos(a) * dist;
    const y2  = y1 - Math.sin(a) * dist;

    await this._stepMove(x1, y1, x2, y2);
  }

  async _gotoXY(x, y) {
    await this._stepMove(this.turtle.x, this.turtle.y, x, y);
  }

  // Mueve la tortuga de (x1,y1) a (x2,y2) paso a paso según la velocidad
  async _stepMove(x1, y1, x2, y2) {
    if (this.speed <= 0) {
      // Movimiento instantáneo
      if (this.turtle.pen) {
        this._drawLine(x1, y1, x2, y2, this._penCss(), this.turtle.penWidth);
      }
      this.turtle.x = x2;
      this.turtle.y = y2;
      this._drawTurtle();
      return;
    }

    // Calcular pasos (aprox 2-20 pixeles por paso según velocidad)
    const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    if (dist < 1) {
      this.turtle.x = x2; this.turtle.y = y2; this._drawTurtle();
      return;
    }

    const stepSize = this.speed * 2; 
    const numSteps = Math.ceil(dist / stepSize);
    
    for (let i = 1; i <= numSteps; i++) {
      const t = i / numSteps;
      const currX = x1 + (x2 - x1) * t;
      const currY = y1 + (y2 - y1) * t;
      const prevX = x1 + (x2 - x1) * ((i-1)/numSteps);
      const prevY = y1 + (y2 - y1) * ((i-1)/numSteps);

      if (this.turtle.pen) {
        this._drawLine(prevX, prevY, currX, currY, this._penCss(), this.turtle.penWidth);
      }

      this.turtle.x = currX;
      this.turtle.y = currY;
      this._drawTurtle();
      await this._sleep(this.frameTime);
    }

    this.turtle.x = x2;
    this.turtle.y = y2;
    this._drawTurtle();
  }

  _drawLine(x1, y1, x2, y2, cssColor, width) {
    const sx1 = this._toScreenX(x1), sy1 = this._toScreenY(y1);
    const sx2 = this._toScreenX(x2), sy2 = this._toScreenY(y2);
    this.ctx.beginPath();
    this.ctx.moveTo(sx1, sy1);
    this.ctx.lineTo(sx2, sy2);
    this.ctx.strokeStyle = cssColor;
    this.ctx.lineWidth   = width;
    this.ctx.lineCap     = 'round';
    this.ctx.stroke();
  }

  _line(x1, y1, x2, y2, color, width = 1) {
    const { r, g, b } = this._unpackRGB(color);
    this.ctx.beginPath();
    this.ctx.moveTo(this._toScreenX(x1), this._toScreenY(y1));
    this.ctx.lineTo(this._toScreenX(x2), this._toScreenY(y2));
    this.ctx.strokeStyle = `rgb(${r},${g},${b})`;
    this.ctx.lineWidth   = Math.max(1, width);
    this.ctx.stroke();
  }

  _circle(cx, cy, r, color, fill = 0) {
    const { r:cr, g:cg, b:cb } = this._unpackRGB(color);
    const sx = this._toScreenX(cx);
    const sy = this._toScreenY(cy);
    const sr = Math.abs(this._scaleX(r));
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, sr, 0, 2 * Math.PI);
    this.ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    if (fill) {
      const { r:fr, g:fg, b:fb } = this._unpackRGB(fill);
      this.ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      this.ctx.fill();
    }
  }

  _rectangle(x1, y1, x2, y2, color, fill = 0) {
    const { r, g, b } = this._unpackRGB(color);
    const sx1 = this._toScreenX(x1), sy1 = this._toScreenY(y1);
    const sx2 = this._toScreenX(x2), sy2 = this._toScreenY(y2);
    const rx = Math.min(sx1, sx2), ry = Math.min(sy1, sy2);
    const rw = Math.abs(sx2 - sx1),  rh = Math.abs(sy2 - sy1);
    this.ctx.strokeStyle = `rgb(${r},${g},${b})`;
    this.ctx.lineWidth = 2;
    if (fill) {
      const { r:fr, g:fg, b:fb } = this._unpackRGB(fill);
      this.ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      this.ctx.fillRect(rx, ry, rw, rh);
    }
    this.ctx.strokeRect(rx, ry, rw, rh);
  }

  // processing.h: rectangle(x1,y1,ancho,alto, color, fill)
  _rectangleWH(x1, y1, ancho, alto, color, fill = 0) {
    this._rectangle(x1, y1, x1 + ancho, y1 + alto, color, fill);
  }

  _setPixel(x, y, color) {
    const { r, g, b } = this._unpackRGB(color);
    const sx = this._toScreenX(x), sy = this._toScreenY(y);
    this.ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }

  _drawText(text, x, y, color) {
    const { r, g, b } = this._unpackRGB(color);
    const sx = this._toScreenX(x), sy = this._toScreenY(y);
    this.ctx.fillStyle = `rgb(${r},${g},${b})`;
    this.ctx.font = '14px monospace';
    this.ctx.fillText(String(text), sx, sy);
  }

  _clearScreen(color) {
    if (color === undefined || color === null) color = this._packRGB(1, 1, 1);
    const { r, g, b } = this._unpackRGB(color);
    this._clearCanvas(r, g, b);
    this._drawTurtle();
  }

  setViewport(left, right, top, bottom) {
    this.vp = { left, right, top, bottom };
  }

  setCoordMode(mode) {
    this.coordMode = mode;
    if (mode === 'processing') {
      // Reset viewport a pixeles (0,0) arriba-izq
      this.vp = { left: 0, right: 1000, top: 0, bottom: 1000 };
    } else {
      // Reset viewport a Logo (centro 0,0)
      this.vp = { left: -250, right: 250, top: 250, bottom: -250 };
    }
    this._drawTurtle();
  }

  setSize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
    this._turtleCanvas.width  = w;
    this._turtleCanvas.height = h;
    if (this.coordMode === 'processing') {
      this.vp.right = 1000;  // Mantenemos virtual 1000x1000
      this.vp.bottom = 1000;
    }
  }

  _initResizeObserver() {
    const container = this.canvas.parentElement;
    if (!container) return;

    this._resizeObserver = new ResizeObserver(() => {
      // Al redimensionar el contenedor, nos aseguramos que el overlay
      // interno de la tortuga sea consciente de su resolución real.
      // Pero no cambiamos this.canvas.width/height para no perder el rastro de dibujo.
      // El CSS object-fit: contain se encarga de lo visual.
      this._drawTurtle();
    });
    this._resizeObserver.observe(container);
  }

  // ── Tabla de funciones para el intérprete ───────────────────────────
  getFunctions() {
    const self = this;
    return {
      // Colores
      RGB:          ([r, g, b])    => self._packRGB(r, g, b),
      randomColor:  ()             => self._packRGB(Math.random()*255|0, Math.random()*255|0, Math.random()*255|0),
      random:       ([max])        => Math.floor(Math.random() * (max || 1)),
      azar:         ([max])        => Math.floor(Math.random() * (max || 1)),

      // Viewport / ventana
      size:              ([w, h])           => self.setSize(w, h),
      ventana:           ([w, h])           => self.setSize(w, h),
      view:              ([l, t, r, b])     => self.setViewport(l, r, t, b),
      setViewportSize:   ([l, r, t, b])     => self.setViewport(l, r, t, b),
      modo_coordenadas:  ([m])              => self.setCoordMode(m === 1 ? 'processing' : 'logo'),
      horizontalScale:   ([l, r])           => { self.vp.left = l; self.vp.right  = r; },
      verticalScale:     ([t, b])           => { self.vp.top  = t; self.vp.bottom = b; },

      // Canvas init (no-op, ya está iniciado)
      ventanaGrafica:    ()                 => {},
      initCanvas:        ()                 => {},

      // Limpiar
      clearScreen:       ([color])          => self._clearScreen(color),

      // Primitivas de dibujo (tortuga y processing comparten)
      line:     ([x1, y1, x2, y2, color, width]) => self._line(x1, y1, x2, y2, color ?? 0, width ?? 1),
      linea:    ([x1, y1, x2, y2, color, width]) => self._line(x1, y1, x2, y2, color ?? 0, width ?? 1),
      circle:   ([x, y, r, color, fill])         => self._circle(x, y, r, color ?? 0, fill ?? 0),
      circulo:  ([x, y, r, color, fill])         => self._circle(x, y, r, color ?? 0, fill ?? 0),

      // tortuga.h rectangle(x1,y1,x2,y2,color,fill)
      rectangle:  ([x1, y1, x2, y2, color, fill]) => self._rectangle(x1, y1, x2, y2, color ?? 0, fill ?? 0),
      rectangulo: ([x1, y1, x2, y2, color, fill]) => self._rectangle(x1, y1, x2, y2, color ?? 0, fill ?? 0),
      // processing.h rectangle(x1,y1,ancho,alto,color,fill)
      rectangle2:  ([x1, y1, x2, y2, color, fill]) => self._rectangle(x1, y1, x2, y2, color ?? 0, fill ?? 0),

      setPixel: ([x, y, color]) => self._setPixel(x, y, color ?? 0),
      pixel:    ([x, y, color]) => self._setPixel(x, y, color ?? 0),

      drawText:     (args, interp) => {
        const addr  = args[0];
        const x     = args[1], y = args[2], color = args[3];
        const text  = interp ? interp.memory.readString(addr) : String(addr);
        self._drawText(text, x, y, color ?? 0);
      },
      mensaje: (args, interp) => {
        const addr = args[0];
        const text = interp ? interp.memory.readString(addr) : String(addr);
        self._drawText(text, self.vp.left + 5, self.vp.top - 10, self._packRGB(255, 255, 255));
      },

      // ── Tortuga ─────────────────────────────────────────────────────
      forward:    async ([n]) => await self._forward(n),
      backward:   async ([n]) => await self._forward(-n),
      rightTurn:  async ([a]) => { self.turtle.angle += a; self._drawTurtle(); await self._sleep(self.frameTime * 2); },
      leftTurn:   async ([a]) => { self.turtle.angle -= a; self._drawTurtle(); await self._sleep(self.frameTime * 2); },
      penUp:      ()       => { self.turtle.pen = false; },
      penDown:    ()       => { self.turtle.pen = true;  },
      penColour:  ([r, g, b]) => { self.turtle.penR = r; self.turtle.penG = g; self.turtle.penB = b; },
      penSize:    ([s])    => { self.turtle.penWidth = Math.max(1, s); },
      hideTurtle: ()       => { self.turtle.visible = false; self._drawTurtle(); },
      showTurtle: ()       => { self.turtle.visible = true;  self._drawTurtle(); },
      ir:         async ([x, y]) => await self._gotoXY(x, y),
      gotoxy:     async ([x, y]) => await self._gotoXY(x, y),
      velocidad:  ([s])    => { self.speed = Math.max(0, Math.min(10, s)); },

      // Aliases adicionales
      Sleep:          ([ms]) => {},  // no-op
      consoleToFront: ()     => {},
      about:          ()     => {},
      doEvents:       ()     => {},
      wait:           ()     => {},
      esperar:        ()     => {},
      teclado:        ()     => 0,
      debug:          ()     => {},
    };
  }
}
