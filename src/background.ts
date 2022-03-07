
class Timeline {
  private terminate: boolean = false;
  private handle?: NodeJS.Timeout;
  private startTime: number = 0;

  constructor(private periodicJob: PeriodicJob) {
  }

  private run() {
    this.handle = undefined;
    const timeDiff = process.hrtime()[0] - this.startTime;
    if (timeDiff < this.periodicJob.interval()) {
      return this.start();
    }
    this.periodicJob.callback().finally(() => this.start());
  }

  public start(immediateRun: boolean = false) {
    if (this.terminate) {
      return;
    }
    if (immediateRun) {
      this.periodicJob.callback().finally(() => this.start());
      return;
    }
    this.startTime = process.hrtime()[0];
    this.handle = setTimeout(() => this.run(), this.periodicJob.minInterval);
  }

  public stop() {
    this.terminate = true;
    if (this.handle !== undefined && this.handle !== null) {
      clearTimeout(this.handle);
    }
  }
}

export class PeriodicJob {
  private timeline?: Timeline;

  public readonly minInterval = 60;

  constructor(
    public interval: () => number = () => 0,
    public callback: () => Promise<void> = async () => {}) {
  }

  public start(immediateRun: boolean = false) {
    this.stop();
    this.timeline = new Timeline(this);
    this.timeline.start(immediateRun);
  }

  public stop() {
    if (this.timeline !== undefined && this.timeline !== null) {
      this.timeline.stop();
      this.timeline = undefined;
    }
  }
}
