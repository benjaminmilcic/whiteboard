import { Component, signal, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Database, ref, onValue, set, push, off, onDisconnect, remove } from '@angular/fire/database';
import { inject } from '@angular/core';

interface DrawingPoint {
  x: number;
  y: number;
  color: string;
  lineWidth: number;
  timestamp: number;
}

interface DrawingStroke {
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
}

@Component({
  selector: 'app-whiteboard',
  imports: [CommonModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, MatToolbarModule],
  templateUrl: './whiteboard.html',
  styleUrl: './whiteboard.css',
})
export class Whiteboard implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private database = inject(Database);
  private ngZone = inject(NgZone);
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: DrawingPoint[] = [];
  private dbRef = ref(this.database, 'whiteboard/strokes');
  private clientId = Math.random().toString(36).slice(2);
  private clientsRef = ref(this.database, 'whiteboard/clients');
  private clientRef = ref(this.database, `whiteboard/clients/${this.clientId}`);

  // Signals für reaktive Zustände
  selectedColor = signal('#000000');
  lineWidth = signal(5);
  isDrawing = signal(false);
  viewportBorder = signal<{ width: number; height: number } | null>(null);

  lineWidths = [1, 2, 3, 5, 8, 12, 16, 20];

  // Verfügbare Farben
  colors = [
    '#000000', // Schwarz
    '#FF0000', // Rot
    '#00FF00', // Grün
    '#0000FF', // Blau
    '#FFFF00', // Gelb
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFA500', // Orange
    '#800080', // Lila
    '#FFFFFF', // Weiß
  ];

  constructor() {
    // Effect für Farbänderungen (optional, für Debugging)
    effect(() => {
      console.log('Selected color:', this.selectedColor());
      console.log('Line width:', this.lineWidth());
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');

    // Canvas-Größe anpassen
    this.resizeCanvas();
    this.publishCanvasSize();
    window.addEventListener('resize', () => { this.resizeCanvas(); this.publishCanvasSize(); });
    window.visualViewport?.addEventListener('resize', () => { this.resizeCanvas(); this.publishCanvasSize(); });

    // Eigene Viewport-Größe bei Disconnect entfernen
    onDisconnect(this.clientRef).remove();

    // Viewport-Größen aller Instanzen beobachten
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

    // Firebase-Listener für Echtzeit-Updates
    onValue(this.dbRef, (snapshot) => {
      const strokes = snapshot.val();
      if (!this.ctx) return;
      if (strokes) {
        this.redrawCanvas(strokes);
      } else {
        const canvas = this.canvasRef.nativeElement;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Touch-Events für Stift-Unterstützung
    canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
  }

  ngOnDestroy(): void {
    off(this.dbRef);
    off(this.clientsRef);
    remove(this.clientRef);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Canvas nach Größenänderung neu zeichnen
      if (this.ctx) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
      }
    }
  }

  private redrawCanvas(strokes: any): void {
    if (!this.ctx) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Alle Striche neu zeichnen
    Object.values(strokes).forEach((stroke: any) => {
      if (stroke.points && stroke.points.length > 0) {
        this.drawStroke(stroke.points, stroke.color, stroke.lineWidth);
      }
    });
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
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.drawing = true;
    this.isDrawing.set(true);
    this.currentStroke = [];
    this.addPoint(x, y);
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.drawing) return;
    event.preventDefault();

    const touch = event.touches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.addPoint(x, y);
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
      x,
      y,
      color: this.selectedColor(),
      lineWidth: this.lineWidth(),
      timestamp: Date.now()
    };

    this.currentStroke.push(point);

    // Lokal zeichnen für sofortiges Feedback
    if (this.ctx && this.currentStroke.length > 1) {
      const prevPoint = this.currentStroke[this.currentStroke.length - 2];
      this.ctx.strokeStyle = this.selectedColor();
      this.ctx.lineWidth = this.lineWidth();
      this.ctx.beginPath();
      this.ctx.moveTo(prevPoint.x, prevPoint.y);
      this.ctx.lineTo(point.x, point.y);
      this.ctx.stroke();
    }
  }

  private saveStroke(): void {
    const stroke: DrawingStroke = {
      points: this.currentStroke,
      color: this.selectedColor(),
      lineWidth: this.lineWidth()
    };

    // In Firebase speichern
    const newStrokeRef = push(this.dbRef);
    set(newStrokeRef, stroke);
  }

  selectColor(color: string): void {
    this.selectedColor.set(color);
  }

  private publishCanvasSize(): void {
    const canvas = this.canvasRef.nativeElement;
    set(this.clientRef, { width: canvas.width, height: canvas.height });
  }

  clearCanvas(): void {
    if (this.ctx) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    set(this.dbRef, null);
  }
}
