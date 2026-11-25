import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import * as fs from 'node:fs';

export interface TrayManagerOptions {
  iconPath?: string;
  getLang: () => 'ar' | 'en';
  onShow: () => void;
  onOpenDownloads: () => void;
  onQuit: () => void;
}

/** Builds a clean 16x16 charcoal/silver tray icon bitmap without external image assets. */
function createTrayIcon(): NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const isBorder = x === 1 || x === size - 2 || y === 1 || y === size - 2;
      const isOuter = x === 0 || x === size - 1 || y === 0 || y === size - 1;
      const isCenterArrow =
        (x >= 7 && x <= 8 && y >= 4 && y <= 10) ||
        (y === 9 && x >= 5 && x <= 10) ||
        (y === 10 && x >= 6 && x <= 9) ||
        (y === 12 && x >= 5 && x <= 10);

      if (isOuter) {
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
      } else if (isBorder || isCenterArrow) {
        // #D6D9DE (BGRA)
        buf[idx] = 0xde; buf[idx + 1] = 0xd9; buf[idx + 2] = 0xd6; buf[idx + 3] = 255;
      } else {
        // #171C23 (BGRA)
        buf[idx] = 0x23; buf[idx + 1] = 0x1c; buf[idx + 2] = 0x17; buf[idx + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(private opts: TrayManagerOptions) {}

  start(): void {
    if (this.tray) return;
    let img: NativeImage | null = null;
    if (this.opts.iconPath && fs.existsSync(this.opts.iconPath)) {
      const loaded = nativeImage.createFromPath(this.opts.iconPath);
      if (!loaded.isEmpty()) img = loaded;
    }
    this.tray = new Tray(img ?? createTrayIcon());
    this.tray.setToolTip('nbrsflow');
    this.tray.on('click', () => this.opts.onShow());
    this.tray.on('double-click', () => this.opts.onShow());
    this.refreshMenu();
  }

  refreshMenu(): void {
    if (!this.tray) return;
    const ar = this.opts.getLang() === 'ar';
    const menu = Menu.buildFromTemplate([
      { label: ar ? 'إظهار nbrsflow' : 'Show nbrsflow', click: () => this.opts.onShow() },
      { label: ar ? 'فتح مجلد التحميلات' : 'Open Downloads Folder', click: () => this.opts.onOpenDownloads() },
      { type: 'separator' },
      { label: ar ? 'خروج نهائي' : 'Quit nbrsflow', click: () => this.opts.onQuit() }
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
