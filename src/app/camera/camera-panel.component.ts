import { AfterViewInit, Component, ElementRef, OnDestroy, afterRenderEffect, inject, input, signal, viewChild } from '@angular/core';
import { CaptureService } from '../services/capture.service';
import { drawOverlay } from '../../overlay';
import { emptyMotion } from '../../motion';

@Component({ selector: 'app-camera-panel', standalone: true, templateUrl: './camera-panel.component.html' })
export class CameraPanelComponent implements AfterViewInit, OnDestroy {
  readonly capture = inject(CaptureService);
  readonly mirror = input(true);
  readonly landmarks = input(true);
  readonly visibility = input(0.5);
  readonly selectedDevice = signal('');
  readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('cameraView');
  private readonly media = viewChild.required<ElementRef<HTMLDivElement>>('cameraMedia');
  private observer?: ResizeObserver;
  private fitRaf = 0;

  constructor() {
    afterRenderEffect(() => {
      const frame = this.capture.frame();
      const video = this.video()?.nativeElement;
      const canvas = this.canvas()?.nativeElement;
      if (!canvas || !video) return;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      drawOverlay(canvas, this.capture.running() ? frame : emptyMotion(), this.visibility());
    });
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(this.fitRaf);
      this.fitRaf = requestAnimationFrame(this.fitVideo);
    });
    this.observer.observe(this.host().nativeElement);
  }

  fitVideo = (): void => {
    const video = this.video().nativeElement, host = this.host().nativeElement;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const height = Math.min(host.clientHeight, host.clientWidth / aspect);
    this.media().nativeElement.style.width = `${height * aspect}px`;
    this.media().nativeElement.style.height = `${height}px`;
  };

  start(): void { void this.capture.start(this.video().nativeElement, this.selectedDevice()); }
  ngOnDestroy(): void { this.observer?.disconnect(); cancelAnimationFrame(this.fitRaf); this.capture.stop(false); }
}
