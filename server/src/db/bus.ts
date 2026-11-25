import { EventEmitter } from 'node:events';

export interface ConfigChangedEvent {
  projectId: string;
}

class ConfigBus extends EventEmitter {
  emitConfigChanged(event: ConfigChangedEvent): void {
    this.emit('config:changed', event);
  }

  onConfigChanged(listener: (event: ConfigChangedEvent) => void): void {
    this.on('config:changed', listener);
  }
}

export const bus = new ConfigBus();
bus.setMaxListeners(100);
