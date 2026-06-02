import { Component, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { ColorPickerDirective } from 'ngx-color-picker';
import { Database, ref, onValue, set, push, off, onDisconnect, remove } from '@angular/fire/database';
import { inject } from '@angular/core';

interface DrawingPoint {
  x: number;
  y: number;
  color: string;
  lineWidth: number;
  timestamp: number;
}

interface StrokeElement {
  type: 'stroke';
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
}

interface ImageElement {
  type: 'image';
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FillElement {
  type: 'fill';
  color: string;
  width: number;
  height: number;
}

type GradientDirection = 'vertical' | 'horizontal' | 'diagonal';

interface GradientFillElement {
  type: 'gradientFill';
  colors: string[];
  direction: GradientDirection;
  width: number;
  height: number;
}

type WhiteboardElement = StrokeElement | ImageElement | FillElement | GradientFillElement;

interface GradientPreset {
  name: string;
  colors: string[];
}

interface ActiveImage {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-whiteboard',
  imports: [CommonModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatMenuModule, MatSelectModule, MatToolbarModule, ColorPickerDirective],
  templateUrl: './whiteboard.html',
  styleUrl: './whiteboard.scss',
})
export class Whiteboard implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraInput', { static: false }) cameraInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('videoEl', { static: false }) videoRef?: ElementRef<HTMLVideoElement>;

  private database = inject(Database);
  private ngZone = inject(NgZone);
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: DrawingPoint[] = [];
  private elementsRef = ref(this.database, 'whiteboard/elements');
  private clientId = Math.random().toString(36).slice(2);
  private clientsRef = ref(this.database, 'whiteboard/clients');
  private clientRef = ref(this.database, `whiteboard/clients/${this.clientId}`);

  private elements: { [key: string]: WhiteboardElement } = {};
  private loadedImages = new Map<string, HTMLImageElement>();
  private videoStream: MediaStream | null = null;
  private dragState: {
    type: 'move' | 'resize';
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null = null;

  selectedColor = signal('#000000');
  customColor = signal('#FF8800');
  lineWidth = signal(5);
  isDrawing = signal(false);
  viewportBorder = signal<{ width: number; height: number } | null>(null);
  activeImage = signal<ActiveImage | null>(null);
  showCameraModal = signal(false);

  showGradientModal = signal(false);
  gradientColors = signal<string[]>([]);
  gradientDirection = signal<GradientDirection>('vertical');

  gradientCss = computed(() => {
    const dirMap: Record<GradientDirection, string> = {
      vertical: 'to bottom',
      horizontal: 'to right',
      diagonal: 'to bottom right',
    };
    return `linear-gradient(${dirMap[this.gradientDirection()]}, ${this.gradientColors().join(', ')})`;
  });

  gradientPresets: GradientPreset[] = [
    { name: 'Duga', colors: ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#800080'] },
    { name: 'Zalazak sunca', colors: ['#FF0000', '#FF7F00', '#FFE000', '#FF00AA'] },
    { name: 'More', colors: ['#00FFD0', '#00A2FF', '#0033FF', '#001A66'] },
    { name: 'Livada', colors: ['#FFE000', '#7CFF00', '#00B140', '#005522'] },
    { name: 'Sladoled', colors: ['#FF1FA0', '#FF61D2', '#7B2FF7', '#00D2FF'] },
    { name: 'Noćno nebo', colors: ['#FF7A00', '#C400FF', '#1B1B8F', '#000022'] },
  ];

  gradientDirections: { value: GradientDirection; icon: string; label: string }[] = [
    { value: 'vertical', icon: '⬇️', label: 'Prema dolje' },
    { value: 'horizontal', icon: '➡️', label: 'Udesno' },
    { value: 'diagonal', icon: '↘️', label: 'Koso' },
  ];

  lineWidths = [1, 2, 3, 5, 8, 12, 16, 20];

  emojis = [
    '😀', '😂', '😍', '😎', '🤩', '😢', '😡', '👍',
    '👎', '👏', '🙌', '💪', '🙏', '❤️', '🧡', '💛',
    '💚', '💙', '💜', '⭐', '🔥', '✨', '🎉', '🎈',
    '🎁', '✅', '❌', '❓', '❗', '💡', '📌', '🏆',
    '🌟', '🌈', '☀️', '🌙', '⚡', '❄️', '🌸', '🍀',
    '🐶', '🐱', '🦄', '🍎', '🍕', '⚽', '🚗', '🚀',
  ];

  colors = [
    '#000000',
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFF00',
    '#FF00FF',
    '#00FFFF',
    '#FFA500',
    '#800080',
    '#FFFFFF',
  ];

  constructor() {
    effect(() => {
      console.log('Selected color:', this.selectedColor());
      console.log('Line width:', this.lineWidth());
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');

    this.resizeCanvas();
    this.publishCanvasSize();
    window.addEventListener('resize', () => { this.resizeCanvas(); this.redrawAll(); this.publishCanvasSize(); });
    window.visualViewport?.addEventListener('resize', () => { this.resizeCanvas(); this.redrawAll(); this.publishCanvasSize(); });

    onDisconnect(this.clientRef).remove();

    onValue(this.clientsRef, (snapshot) => {
      const clients = snapshot.val();
      const cvs = this.canvasRef.nativeElement;
      this.ngZone.run(() => {
        if (!clients) { this.viewportBorder.set(null); return; }
        const sizes = Object.values(clients) as { width: number; height: number }[];
        const minW = Math.min(...sizes.map(s => s.width));
        const minH = Math.min(...sizes.map(s => s.height));
        if (minW < cvs.width || minH < cvs.height) {
          this.viewportBorder.set({ width: minW, height: minH });
        } else {
          this.viewportBorder.set(null);
        }
      });
    });

    onValue(this.elementsRef, (snapshot) => {
      this.ngZone.run(() => {
        this.elements = snapshot.val() ?? {};
        const toLoad = Object.entries(this.elements).filter(
          ([key, el]) => el.type === 'image' && !this.loadedImages.has(key)
        ) as [string, ImageElement][];

        if (toLoad.length === 0) {
          this.redrawAll();
          return;
        }

        let remaining = toLoad.length;
        toLoad.forEach(([key, el]) => {
          const img = new Image();
          img.onload = () => {
            this.loadedImages.set(key, img);
            if (--remaining === 0) this.redrawAll();
          };
          img.src = el.dataUrl;
        });
      });
    });

    canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
  }

  ngOnDestroy(): void {
    this.stopVideoStream();
    off(this.elementsRef);
    off(this.clientsRef);
    remove(this.clientRef);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (this.ctx) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
      }
    }
  }

  private redrawAll(): void {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const [key, el] of Object.entries(this.elements)) {
      if (el.type === 'stroke' && el.points?.length > 0) {
        this.drawStroke(el.points, el.color, el.lineWidth);
      } else if (el.type === 'image') {
        const img = this.loadedImages.get(key);
        if (img) this.ctx.drawImage(img, el.x, el.y, el.width, el.height);
      } else if (el.type === 'fill') {
        this.ctx.fillStyle = el.color;
        this.ctx.fillRect(0, 0, el.width, el.height);
      } else if (el.type === 'gradientFill') {
        this.ctx.fillStyle = this.makeGradient(el.direction, el.width, el.height, el.colors);
        this.ctx.fillRect(0, 0, el.width, el.height);
      }
    }
  }

  private drawStroke(points: DrawingPoint[], color: string, lineWidth: number): void {
    if (!this.ctx || points.length === 0) return;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }

  onMouseDown(event: MouseEvent): void {
    this.drawing = true;
    this.isDrawing.set(true);
    this.currentStroke = [];
    this.addPoint(event.offsetX, event.offsetY);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.drawing) return;
    this.addPoint(event.offsetX, event.offsetY);
  }

  onMouseUp(): void {
    if (this.drawing && this.currentStroke.length > 0) {
      this.saveStroke();
    }
    this.drawing = false;
    this.isDrawing.set(false);
    this.currentStroke = [];
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.drawing = true;
    this.isDrawing.set(true);
    this.currentStroke = [];
    this.addPoint(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.drawing) return;
    event.preventDefault();
    const touch = event.touches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.addPoint(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    if (this.drawing && this.currentStroke.length > 0) {
      this.saveStroke();
    }
    this.drawing = false;
    this.isDrawing.set(false);
    this.currentStroke = [];
  }

  private addPoint(x: number, y: number): void {
    const point: DrawingPoint = {
      x, y,
      color: this.selectedColor(),
      lineWidth: this.lineWidth(),
      timestamp: Date.now()
    };
    this.currentStroke.push(point);
    if (this.ctx && this.currentStroke.length > 1) {
      const prev = this.currentStroke[this.currentStroke.length - 2];
      this.ctx.strokeStyle = this.selectedColor();
      this.ctx.lineWidth = this.lineWidth();
      this.ctx.beginPath();
      this.ctx.moveTo(prev.x, prev.y);
      this.ctx.lineTo(point.x, point.y);
      this.ctx.stroke();
    }
  }

  private saveStroke(): void {
    const el: StrokeElement = {
      type: 'stroke',
      points: this.currentStroke,
      color: this.selectedColor(),
      lineWidth: this.lineWidth()
    };
    set(push(this.elementsRef), el);
  }

  selectColor(color: string): void {
    this.selectedColor.set(color);
  }

  fillArea(): void {
    const canvas = this.canvasRef.nativeElement;
    const border = this.viewportBorder();
    const width = border ? border.width : canvas.width;
    const height = border ? border.height : canvas.height;
    const el: FillElement = {
      type: 'fill',
      color: this.selectedColor(),
      width,
      height
    };
    set(push(this.elementsRef), el);
  }

  private makeGradient(direction: GradientDirection, width: number, height: number, colors: string[]): CanvasGradient {
    const ctx = this.ctx!;
    let grad: CanvasGradient;
    if (direction === 'horizontal') {
      grad = ctx.createLinearGradient(0, 0, width, 0);
    } else if (direction === 'diagonal') {
      grad = ctx.createLinearGradient(0, 0, width, height);
    } else {
      grad = ctx.createLinearGradient(0, 0, 0, height);
    }
    colors.forEach((color, i) => {
      const stop = colors.length === 1 ? 0 : i / (colors.length - 1);
      grad.addColorStop(stop, color);
    });
    return grad;
  }

  presetCss(preset: GradientPreset): string {
    return `linear-gradient(135deg, ${preset.colors.join(', ')})`;
  }

  openGradientModal(): void {
    this.gradientColors.set(this.gradientPresets[0].colors);
    this.gradientDirection.set('vertical');
    this.showGradientModal.set(true);
  }

  closeGradientModal(): void {
    this.showGradientModal.set(false);
  }

  selectGradientPreset(preset: GradientPreset): void {
    this.gradientColors.set(preset.colors);
  }

  applyGradientFill(): void {
    if (this.gradientColors().length === 0) return;
    const canvas = this.canvasRef.nativeElement;
    const border = this.viewportBorder();
    const width = border ? border.width : canvas.width;
    const height = border ? border.height : canvas.height;
    const el: GradientFillElement = {
      type: 'gradientFill',
      colors: this.gradientColors(),
      direction: this.gradientDirection(),
      width,
      height
    };
    set(push(this.elementsRef), el);
    this.showGradientModal.set(false);
  }

  selectCustomColor(color: string): void {
    this.customColor.set(color);
    this.selectedColor.set(color);
  }

  private publishCanvasSize(): void {
    const canvas = this.canvasRef.nativeElement;
    set(this.clientRef, { width: canvas.width, height: canvas.height });
  }

  onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const reader = new FileReader();
    reader.onload = (e) => this.placeImageFromDataUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  insertEmoji(emoji: string): void {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = `${Math.floor(size * 0.8)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // leichter vertikaler Versatz, damit Emojis optisch zentriert wirken
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);
    this.placeImageFromDataUrl(canvas.toDataURL('image/png'));
  }

  private placeImageFromDataUrl(dataUrl: string): void {
    const img = new Image();
    img.onload = () => {
      const canvas = this.canvasRef.nativeElement;
      const maxWidth = canvas.width * 0.3;
      const scale = Math.min(maxWidth / img.width, 1);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      this.ngZone.run(() => {
        this.activeImage.set({
          dataUrl,
          x: Math.round((canvas.width - width) / 2),
          y: Math.round((canvas.height - height) / 2),
          width,
          height
        });
      });
    };
    img.src = dataUrl;
  }

  private isMobile(): boolean {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  async openCamera(): Promise<void> {
    if (this.isMobile()) {
      this.cameraInputRef.nativeElement.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraInputRef.nativeElement.click();
      return;
    }
    this.showCameraModal.set(true);
    setTimeout(async () => {
      const video = this.videoRef?.nativeElement;
      if (!video) return;
      try {
        this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = this.videoStream;
      } catch {
        this.ngZone.run(() => this.showCameraModal.set(false));
      }
    }, 50);
  }

  capturePhoto(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
    this.closeCameraModal();
    this.placeImageFromDataUrl(dataUrl);
  }

  closeCameraModal(): void {
    this.stopVideoStream();
    this.showCameraModal.set(false);
  }

  private stopVideoStream(): void {
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.videoStream = null;
  }

  onImagePointerDown(event: PointerEvent): void {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const img = this.activeImage()!;
    this.dragState = {
      type: 'move',
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: img.x,
      startY: img.y,
      startWidth: img.width,
      startHeight: img.height
    };
  }

  onResizePointerDown(event: PointerEvent): void {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const img = this.activeImage()!;
    this.dragState = {
      type: 'resize',
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: img.x,
      startY: img.y,
      startWidth: img.width,
      startHeight: img.height
    };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragState) return;
    const dx = event.clientX - this.dragState.startMouseX;
    const dy = event.clientY - this.dragState.startMouseY;
    const current = this.activeImage()!;
    if (this.dragState.type === 'move') {
      this.activeImage.set({ ...current, x: this.dragState.startX + dx, y: this.dragState.startY + dy });
    } else {
      this.activeImage.set({
        ...current,
        width: Math.max(50, this.dragState.startWidth + dx),
        height: Math.max(50, this.dragState.startHeight + dy)
      });
    }
  }

  onPointerUp(): void {
    this.dragState = null;
  }

  commitImage(): void {
    const active = this.activeImage();
    if (!active) return;
    this.activeImage.set(null);
    const el: ImageElement = { type: 'image', ...active };
    set(push(this.elementsRef), el);
  }

  cancelImage(): void {
    this.activeImage.set(null);
  }

  downloadCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = `whiteboard-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  }

  clearCanvas(): void {
    if (this.ctx) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.elements = {};
    this.loadedImages.clear();
    set(this.elementsRef, null);
  }
}
