import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from '../platform.js';

export class ShadeAccessory {
  private service: Service;

  private shade_state = {
    shadelevel: 100,
    valid_shadelevel: false,
  };

  queue : number[] = [];
  queue_ready = true;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.WindowCovering) ||
    this.accessory.addService(this.platform.Service.WindowCovering);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(this.getCurrentPosition.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(this.getPositionState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onSet(this.setTargetPosition.bind(this)).onGet(this.getTargetPosition.bind(this));
  }

  updateShadeLevel(shadelevel: number) {
    this.platform.log.error('queueing', shadelevel);
    this.queue.push(shadelevel);
    this.process_queue();
  }

  async setTargetPosition(value: CharacteristicValue) {
    this.platform.log.error(this.accessory.context.device.name, 'Set Characteristic TargetPosition -> ', value);

    this.shade_state.shadelevel = value as number;
    this.shade_state.valid_shadelevel = false;
    this.platform.enqueue('Shade_controller::ShadeSet(Address1 = ' + this.accessory.context.device.address
    + ', ShadeLevel = ' + value + ')');
  }

  async getCurrentPosition(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get Characteristic CurrentPosition ->', this.shade_state.shadelevel);

    return this.shade_state.shadelevel;
  }

  async getPositionState(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get Characteristic PositionState ->',
      this.platform.Characteristic.PositionState.STOPPED);

    return this.platform.Characteristic.PositionState.STOPPED;
  }

  async getTargetPosition(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get Characteristic TargetPosition ->', this.shade_state.shadelevel);

    return this.shade_state.shadelevel;
  }

  process_queue() {
    if (this.queue_ready) {
      if (this.queue.length > 0) {
        const shadelevel = this.queue.shift()!;
        this.platform.log.error('unqueueing', shadelevel);

        if (!this.shade_state.valid_shadelevel || this.shade_state.shadelevel !== shadelevel) {
          this.queue_ready = false;
          this.platform.log.error(this.accessory.context.device.name, 'Update Characteristic CurrentPosition ->', shadelevel);
          this.shade_state.shadelevel = shadelevel;
          this.shade_state.valid_shadelevel = true;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, shadelevel);
          this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, shadelevel);
        }

        this.queue_ready = true;
        /*if (!this.queue_ready) {
          setTimeout(() => {
            this.queue_ready = true;
            this.process_queue();
          }, 500);
        }*/
      }
    }
  }
}
