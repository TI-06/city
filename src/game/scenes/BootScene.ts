import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('boot');
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#dbe6df');
  }
}
