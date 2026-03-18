export class Input {
  constructor(target) {
    this.target = target;
    this._listeners = {
      tap: [],
      dragstart: [],
      dragmove: [],
      dragend: [],
    };

    this._bind();
  }

  _bind() {
    let pointerId = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let moved = false;
    let startTime = 0;

    const getPoint = (event) => {
      // Pointer events and mouse events use clientX/clientY.
      // Touch events may be passed in (e.g. from older browsers) so we handle that too.
      const touch = event.changedTouches?.[0];
      const rect = this.target.getBoundingClientRect();
      const hasCanvasSpace =
        typeof this.target.width === "number" &&
        typeof this.target.height === "number";
      const scaleX = hasCanvasSpace ? this.target.width / rect.width : 1;
      const scaleY = hasCanvasSpace ? this.target.height / rect.height : 1;
      if (touch) {
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }

      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    };

    const onDown = (event) => {
      // Only track primary pointer
      if (pointerId !== null) return;
      if (event.cancelable) event.preventDefault();

      pointerId = event.pointerId ?? 1;
      if (event.pointerId != null && this.target.setPointerCapture) {
        try {
          this.target.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures on unsupported/edge cases.
        }
      }
      start = getPoint(event);
      last = { ...start };
      moved = false;
      startTime = performance.now();

      this._emit("dragstart", { ...start });
    };

    const onMove = (event) => {
      if (pointerId === null) return;
      if (event.pointerId != null && event.pointerId !== pointerId) return;

      const point = getPoint(event);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!moved && Math.hypot(dx, dy) > 10) {
        moved = true;
      }
      last = point;
      this._emit("dragmove", { ...point, start: { ...start } });
    };

    const onUp = (event) => {
      if (pointerId === null) return;
      if (event.pointerId != null && event.pointerId !== pointerId) return;

      const end = getPoint(event);
      const duration = performance.now() - startTime;
      const dx = end.x - start.x;
      const dy = end.y - start.y;

      if (!moved && duration < 300 && Math.hypot(dx, dy) < 16) {
        this._emit("tap", { ...end });
      }

      if (moved) {
        this._emit("dragend", { ...end, start: { ...start } });
      }

      if (event.pointerId != null && this.target.releasePointerCapture) {
        try {
          this.target.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore release failures on unsupported/edge cases.
        }
      }
      pointerId = null;
    };

    this.target.addEventListener("pointerdown", onDown);
    this.target.addEventListener("pointermove", onMove);
    this.target.addEventListener("pointerup", onUp);
    this.target.addEventListener("pointercancel", onUp);

    // Allow desktop click/tap fallback when pointer events are not available
    this.target.addEventListener("click", (event) => {
      this._emit("tap", getPoint(event));
    });
  }

  onTap(fn) {
    this._listeners.tap.push(fn);
  }

  onDragStart(fn) {
    this._listeners.dragstart.push(fn);
  }

  onDragMove(fn) {
    this._listeners.dragmove.push(fn);
  }

  onDragEnd(fn) {
    this._listeners.dragend.push(fn);
  }

  _emit(eventName, ...args) {
    for (const fn of this._listeners[eventName] || []) {
      fn(...args);
    }
  }
}
