import { Component, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { ColorPickerDirective } from 'ngx-color-picker';
import { Database, DatabaseReference, ref, onValue, set, get, push, off, onDisconnect, remove, serverTimestamp } from '@angular/fire/database';
import { FormsModule } from '@angular/forms';
import { Auth, signInAnonymously } from '@angular/fire/auth';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

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

type ElementsMap = { [key: string]: WhiteboardElement };

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
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatMenuModule, MatSelectModule, MatToolbarModule, ColorPickerDirective],
  templateUrl: './whiteboard.html',
  styleUrl: './whiteboard.scss',
})
export class Whiteboard implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraInput', { static: false }) cameraInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('videoEl', { static: false }) videoRef?: ElementRef<HTMLVideoElement>;

  private database = inject(Database);
  private auth = inject(Auth);
  private ngZone = inject(NgZone);
  private router = inject(Router);
  // Die Security Rules verlangen `auth != null`. Erst nach dieser anonymen
  // Anmeldung darf das Whiteboard lesen/schreiben (siehe ngAfterViewInit).
  private authReady = signInAnonymously(this.auth);
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: DrawingPoint[] = [];
  private clientId = Math.random().toString(36).slice(2);
  // Die DB-Pfade haengen vom 4-stelligen Sitzungs-Code ab und werden erst
  // gesetzt, sobald eine Tafel erstellt oder betreten wurde (connectSession).
  private elementsRef!: DatabaseReference;
  private clientsRef!: DatabaseReference;
  private clientRef!: DatabaseReference;
  private sessionConnected = false;
  // Nur Ziffern, damit der Code kindgerecht vorlesbar/eintippbar ist.
  private readonly CODE_ALPHABET = '0123456789';

  private elements: ElementsMap = {};
  private loadedImages = new Map<string, HTMLImageElement>();

  private undoStack = signal<ElementsMap[]>([]);
  private redoStack = signal<ElementsMap[]>([]);
  private readonly HISTORY_LIMIT = 50;
  canUndo = computed(() => this.undoStack().length > 0);
  canRedo = computed(() => this.redoStack().length > 0);
  private videoStream: MediaStream | null = null;

  private serverTimeOffset = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_MS = 5000;
  private readonly STALE_MS = 15000;

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

  // ---- Sessions ------------------------------------------------------------
  // Beim Start wird automatisch eine eigene Session erzeugt; man kann sofort
  // malen. Ueber die zwei kleinen Buttons in der Toolbar kann man die Session
  // wechseln (neu/beitreten) oder den Code anzeigen.
  sessionCode = signal('');
  joinCode = signal('');
  lobbyError = signal('');
  lobbyBusy = signal(false);
  // Wie viele Maler gerade aktiv (nicht veraltet) in dieser Session sind.
  participantCount = signal(0);
  // Overlay: neue Session starten oder per Code beitreten.
  showSessionMenu = signal(false);
  // Popup: aktuellen 4-stelligen Code anzeigen.
  showInfo = signal(false);

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
    window.addEventListener('resize', () => { this.resizeCanvas(); this.redrawAll(); this.publishCanvasSize(); });
    window.visualViewport?.addEventListener('resize', () => { this.resizeCanvas(); this.redrawAll(); this.publishCanvasSize(); });

    canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    // Globale Listener + automatische erste Session, erst nach anonymer
    // Anmeldung (Rules: auth != null). Danach kann sofort gemalt werden.
    void this.authReady.then(() => {
      onValue(ref(this.database, '.info/serverTimeOffset'), (snap) => {
        this.serverTimeOffset = snap.val() ?? 0;
      });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      void this.startNewSession();
    });
  }

  // ---- Sessions: neu starten / beitreten / wechseln ------------------------
  /** Erzeugt eine frische Session mit eigenem Code und verbindet sie. */
  async startNewSession(): Promise<void> {
    if (this.lobbyBusy()) return;
    this.lobbyBusy.set(true);
    this.lobbyError.set('');
    try {
      await this.authReady;
      const code = await this.uniqueCode();
      // Sitzungs-Marker, damit Beitretende die Existenz pruefen koennen.
      await set(ref(this.database, `whiteboard/sessions/${code}/meta`), {
        createdAt: serverTimestamp(),
        hostId: this.clientId,
      });
      this.connectSession(code);
      this.showSessionMenu.set(false);
      this.joinCode.set('');
    } catch (e) {
      this.lobbyError.set(this.toMessage(e));
    } finally {
      this.lobbyBusy.set(false);
    }
  }

  /** Tritt einer bestehenden Session ueber ihren Code bei. */
  async joinSession(): Promise<void> {
    if (this.lobbyBusy()) return;
    const code = this.joinCode().trim();
    if (code.length !== 4) return;
    this.lobbyBusy.set(true);
    this.lobbyError.set('');
    try {
      await this.authReady;
      const snap = await get(ref(this.database, `whiteboard/sessions/${code}/meta`));
      if (!snap.exists()) {
        this.lobbyError.set('Nema ploče s tim kodom.');
        return;
      }
      this.connectSession(code);
      this.showSessionMenu.set(false);
      this.joinCode.set('');
    } catch (e) {
      this.lobbyError.set(this.toMessage(e));
    } finally {
      this.lobbyBusy.set(false);
    }
  }

  onJoinCode(value: string): void {
    this.joinCode.set(value.replace(/\D/g, '').slice(0, 4));
  }

  /** Oeffnet das Overlay zum Wechseln der Session (neu / beitreten). */
  openSessionMenu(): void {
    this.lobbyError.set('');
    this.joinCode.set('');
    this.showSessionMenu.set(true);
  }

  closeSessionMenu(): void {
    this.showSessionMenu.set(false);
  }

  toggleInfo(): void {
    this.showInfo.update((v) => !v);
  }

  /**
   * Loest die Listener der bisherigen Session, verbindet die neue und
   * verwirft den lokalen Zeichen-Zustand (Sessions sind voneinander getrennt).
   */
  private connectSession(code: string): void {
    this.detachSession();
    this.sessionCode.set(code);
    this.elementsRef = ref(this.database, `whiteboard/sessions/${code}/elements`);
    this.clientsRef = ref(this.database, `whiteboard/sessions/${code}/clients`);
    this.clientRef = ref(this.database, `whiteboard/sessions/${code}/clients/${this.clientId}`);
    this.sessionConnected = true;

    // Zustand der vorherigen Session vollstaendig verwerfen.
    this.elements = {};
    this.loadedImages.clear();
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.viewportBorder.set(null);
    this.participantCount.set(0);
    this.redrawAll();

    onDisconnect(this.clientRef).remove();
    this.startHeartbeat();

    onValue(this.clientsRef, (snapshot) => {
      const clients = snapshot.val();
      const cvs = this.canvasRef.nativeElement;
      this.ngZone.run(() => {
        if (!clients) { this.viewportBorder.set(null); this.participantCount.set(0); return; }
        const now = this.serverNow();
        const sizes = (Object.values(clients) as { width: number; height: number; lastSeen?: number }[])
          .filter(s => typeof s.lastSeen === 'number' && now - s.lastSeen < this.STALE_MS);
        this.participantCount.set(sizes.length);
        if (sizes.length === 0) { this.viewportBorder.set(null); return; }
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
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await get(ref(this.database, `whiteboard/sessions/${code}/meta`));
      if (!snap.exists()) return code;
    }
    return this.randomCode();
  }

  private randomCode(): string {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += this.CODE_ALPHABET[Math.floor(Math.random() * this.CODE_ALPHABET.length)];
    }
    return s;
  }

  private toMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('PERMISSION_DENIED')) {
      return 'Nema veze s bazom. Jesu li pravila baze za "whiteboard" postavljena?';
    }
    return raw;
  }

  /** Listener der aktuellen Session loesen und Praesenz entfernen. */
  private detachSession(): void {
    if (!this.sessionConnected) return;
    this.stopHeartbeat();
    off(this.elementsRef);
    off(this.clientsRef);
    remove(this.clientRef);
    this.sessionConnected = false;
  }

  ngOnDestroy(): void {
    this.stopVideoStream();
    this.detachSession();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private serverNow(): number {
    return Date.now() + this.serverTimeOffset;
  }

  private onVisibilityChange = (): void => {
    if (!this.sessionConnected) return;
    if (document.visibilityState === 'hidden') {
      this.stopHeartbeat();
      remove(this.clientRef);
    } else {
      this.startHeartbeat();
    }
  };

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.publishCanvasSize();
    this.heartbeatTimer = setInterval(() => this.publishCanvasSize(), this.HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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
    if (!this.sessionConnected) return;
    this.pushHistory();
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
    if (!this.sessionConnected) return;
    const canvas = this.canvasRef.nativeElement;
    const border = this.viewportBorder();
    const width = border ? border.width : canvas.width;
    const height = border ? border.height : canvas.height;
    this.pushHistory();
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
    if (!this.sessionConnected) return;
    if (this.gradientColors().length === 0) return;
    const canvas = this.canvasRef.nativeElement;
    const border = this.viewportBorder();
    const width = border ? border.width : canvas.width;
    const height = border ? border.height : canvas.height;
    this.pushHistory();
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
    if (!this.sessionConnected) return;
    const canvas = this.canvasRef.nativeElement;
    set(this.clientRef, {
      width: canvas.width,
      height: canvas.height,
      lastSeen: serverTimestamp(),
    });
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
    if (!this.sessionConnected) return;
    const active = this.activeImage();
    if (!active) return;
    this.activeImage.set(null);
    this.pushHistory();
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

  goHome(): void {
    this.router.navigate(['/']);
  }

  clearCanvas(): void {
    if (!this.sessionConnected) return;
    this.pushHistory();
    if (this.ctx) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.elements = {};
    this.loadedImages.clear();
    set(this.elementsRef, null);
  }

  private cloneElements(map: ElementsMap): ElementsMap {
    return structuredClone(map);
  }

  // Aktuellen Zustand vor einer Änderung sichern und Redo-Verlauf verwerfen
  private pushHistory(): void {
    this.undoStack.update(stack => [...stack, this.cloneElements(this.elements)].slice(-this.HISTORY_LIMIT));
    this.redoStack.set([]);
  }

  private applySnapshot(snapshot: ElementsMap): void {
    if (!this.sessionConnected) return;
    set(this.elementsRef, Object.keys(snapshot).length === 0 ? null : snapshot);
  }

  undo(): void {
    const stack = this.undoStack();
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    this.redoStack.update(s => [...s, this.cloneElements(this.elements)].slice(-this.HISTORY_LIMIT));
    this.undoStack.set(stack.slice(0, -1));
    this.applySnapshot(previous);
  }

  redo(): void {
    const stack = this.redoStack();
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    this.undoStack.update(s => [...s, this.cloneElements(this.elements)].slice(-this.HISTORY_LIMIT));
    this.redoStack.set(stack.slice(0, -1));
    this.applySnapshot(next);
  }
}
