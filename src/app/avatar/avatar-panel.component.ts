import { AfterViewInit, Component, ElementRef, OnDestroy, inject, input, signal, viewChild } from '@angular/core';
import { AvatarStage } from '../../avatar';
import { CaptureService, describeError } from '../services/capture.service';

@Component({ selector: 'app-avatar-panel', standalone: true, templateUrl: './avatar-panel.component.html' })
export class AvatarPanelComponent implements AfterViewInit, OnDestroy {
  readonly capture = inject(CaptureService);
  readonly mirror = input(true);
  readonly smoothing = input(0.1);
  readonly visibility = input(0.5);
  readonly ready = signal(false);
  readonly modelName = signal('Loading sample avatar…');
  readonly focus = signal<'body' | 'left' | 'right'>('body');
  private host = viewChild.required<ElementRef<HTMLDivElement>>('avatarView');
  private stage?: AvatarStage;
  private raf = 0;
  private previous = performance.now();
  private disposed = false;

  ngAfterViewInit(): void {
    try {
      this.stage = new AvatarStage(this.host().nativeElement);
      this.raf = requestAnimationFrame(this.render);
      void this.stage.load(new URL('avatar/sample.vrm', document.baseURI).href).then(loaded => {
        if (!loaded || this.disposed) return;
        this.ready.set(true);
        this.modelName.set('pixiv · VRM Twist Sample');
        if (!this.capture.running() && !this.capture.starting()) this.capture.setNotice('Ready. Start the camera or try the motion demo. Holistic tracks body, hands, and face together. Sample avatar © pixiv Inc.');
      }).catch(error => {
        if (this.disposed) return;
        this.modelName.set('Import a VRM model');
        this.capture.setNotice(`Sample model unavailable: ${describeError(error)} Run npm run setup-assets or import your own .vrm file.`, true);
      });
    } catch (error) { this.capture.setNotice(`Unable to create the 3D view: ${describeError(error)} Enable WebGL in your browser.`, true); }
  }

  private render = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(Math.max((now - this.previous) / 1000, 0.001), 0.1);
    this.previous = now;
    this.stage?.render(this.capture.currentMotion(now), dt, this.smoothing(), this.visibility());
    this.raf = requestAnimationFrame(this.render);
  };

  setFocus(focus: 'body' | 'left' | 'right'): void { this.focus.set(focus); this.stage?.setFocus(focus); }
  reset(): void { this.focus.set('body'); this.stage?.resetView(); }

  async importModel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.stage) { this.capture.setNotice('The 3D view is unavailable. Enable WebGL and reload the page.', true); input.value = ''; return; }
    if (!file.name.toLowerCase().endsWith('.vrm')) { this.capture.setNotice('Please select a .vrm file.', true); input.value = ''; return; }
    const url = URL.createObjectURL(file);
    this.capture.setNotice('Loading the VRM model…');
    try {
      if (await this.stage.load(url) && !this.disposed) {
        this.modelName.set(/\p{Script=Han}/u.test(file.name) ? 'Imported VRM' : file.name);
        this.focus.set('body');
        this.ready.set(true);
        this.capture.setNotice('VRM loaded. Start the camera or try the motion demo.');
      }
    } catch (error) { if (!this.disposed) this.capture.setNotice(`Model loading failed: ${describeError(error)}`, true); }
    finally { URL.revokeObjectURL(url); input.value = ''; }
  }

  ngOnDestroy(): void { this.disposed = true; cancelAnimationFrame(this.raf); this.stage?.dispose(); }
}
