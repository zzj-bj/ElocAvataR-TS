import { NgFor } from '@angular/common';
import { AfterViewChecked, AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { CaptureService } from '../services/capture.service';
import { drawOverlay } from '../../overlay';
import { emptyMotion, type MotionFrame } from '../../motion';

@Component({ selector: 'app-camera-panel', standalone: true, imports: [NgFor], templateUrl: './camera-panel.component.html' })
export class CameraPanelComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  readonly capture = inject(CaptureService);
  @Input() mirror = true;
  @Input() landmarks = true;
  @Input() visibility = 0.5;
  selectedDevice = '';
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraView', { static: true }) private host!: ElementRef<HTMLDivElement>;
  @ViewChild('cameraMedia', { static: true }) private media!: ElementRef<HTMLDivElement>;
  private drawnFrame?: MotionFrame;
  private drawnRunning?: boolean;
  private drawnVisibility?: number;
  private observer?: ResizeObserver;
  private fitRaf = 0;

  ngAfterViewChecked(): void {
    const frame = this.capture.frame, running = this.capture.running;
    if (frame === this.drawnFrame && running === this.drawnRunning && this.visibility === this.drawnVisibility) return;
    const video = this.video.nativeElement, canvas = this.canvas.nativeElement;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    drawOverlay(canvas, running ? frame : emptyMotion(), this.visibility);
    this.drawnFrame = frame;
    this.drawnRunning = running;
    this.drawnVisibility = this.visibility;
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(this.fitRaf);
      this.fitRaf = requestAnimationFrame(this.fitVideo);
    });
    this.observer.observe(this.host.nativeElement);
  }

  fitVideo = (): void => {
    const video = this.video.nativeElement, host = this.host.nativeElement;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const height = Math.min(host.clientHeight, host.clientWidth / aspect);
    this.media.nativeElement.style.width = `${height * aspect}px`;
    this.media.nativeElement.style.height = `${height}px`;
  };

  trackDevice(_index: number, device: { id: string }): string { return device.id; }
  start(): void { void this.capture.start(this.video.nativeElement, this.selectedDevice); }
  ngOnDestroy(): void { this.observer?.disconnect(); cancelAnimationFrame(this.fitRaf); this.capture.stop(false); }
}
