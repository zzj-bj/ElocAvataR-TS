import { Component, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { CameraPanelComponent } from './camera/camera-panel.component';
import { AvatarPanelComponent } from './avatar/avatar-panel.component';
import { CaptureService } from './services/capture.service';

@Component({
  selector: 'app-root', standalone: true,
  imports: [CameraPanelComponent, AvatarPanelComponent], templateUrl: './app.component.html',
})
export class AppComponent implements OnDestroy {
  readonly capture = inject(CaptureService);
  readonly mirror = signal(true);
  readonly landmarks = signal(true);
  readonly smoothing = signal(0.1);
  readonly visibility = signal(0.5);
  readonly avatar = viewChild(AvatarPanelComponent);
  private readonly devicesChanged = () => void this.capture.updateDevices().catch(() => {});

  constructor() {
    this.devicesChanged();
    navigator.mediaDevices?.addEventListener('devicechange', this.devicesChanged);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if ((event.target as HTMLElement)?.matches('input,select,textarea')) return;
    if (event.key.toLowerCase() === 'r') this.avatar()?.reset();
    if (event.key === 'Escape') { this.capture.demonstrating.set(false); this.capture.stop(); }
  }

  @HostListener('window:pagehide')
  stop(): void { this.capture.demonstrating.set(false); this.capture.stop(false); }

  ngOnDestroy(): void {
    this.stop();
    navigator.mediaDevices?.removeEventListener('devicechange', this.devicesChanged);
  }
}
