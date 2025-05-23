import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { ShadeAccessory } from './device_types/shade.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import { Socket } from 'net';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  socket = new Socket;
  socket_buffer = '';

  pong_timeout = () => {
    this.socket.destroy();
  };
  
  pong_timer = setTimeout(this.pong_timeout, 15000);

  ping_timeout = () => {
    this.enqueue('Shade_controller::Ping()');
    this.pong_timer = setTimeout(this.pong_timeout, 15000);
    this.ping_timer = setTimeout(this.ping_timeout, 30000);
  };
  
  ping_timer = setTimeout(this.ping_timeout, 30000);

  queue : string[] = [];
  queue_ready = false;

  shades = {};

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    clearTimeout(this.ping_timer);
    clearTimeout(this.pong_timer);

    this.log.debug('Finished initializing platform:', this.config.name);

    this.socket.setEncoding('utf8');
    this.socket.on('close', this.on_close.bind(this));
    //this.socket.on('connect', this.on_connect.bind(this));
    this.socket.on('data', this.on_data.bind(this));
    this.socket.on('drain', this.on_drain.bind(this));
    //this.socket.on('end', this.on_end.bind(this));
    this.socket.on('error', this.on_error.bind(this));
    //this.socket.on('loopkup', this.on_lookup.bind(this));
    this.socket.on('ready', this.on_ready.bind(this));
    this.socket.on('timeout', this.on_timeout.bind(this));

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
      this.socket.connect(12324);
    });
  }

  reconnect() {
    this.socket.connect(12324);
  }

  on_close() {
    clearTimeout(this.ping_timer);
    clearTimeout(this.pong_timer);
    this.log.error('close');
    setTimeout(this.reconnect.bind(this), 10000);
  }

  // on_connect() {
  //   this.log.error('connect');
  // }

  on_data(data: string) {
    this.socket_buffer += data;
    //this.log.error('data "', data, '"');
    let index = this.socket_buffer.indexOf('\n');
    while (index !== -1) {
      const line = this.socket_buffer.substring(0, index);
      this.log.error('read', line);
      const shade_set_matcher = /Shade_controller::ShadePosition\(Address1 = (.*), ShadeLevel = (.*)\)/;
      const shade_set_matched = shade_set_matcher.exec(line);
      if (shade_set_matched !== null) {
        //this.log.error('shade_set', shade_set_matched[1], shade_set_matched[2]);
        if (this.shades[shade_set_matched[1]] !== undefined) {
          this.shades[shade_set_matched[1]].updateShadeLevel(parseInt(shade_set_matched[2], 10));
        }
      }

      const ping_matcher = /Shade_controller::Ping\(\)/;
      const ping_matched= ping_matcher.exec(line);
      if (ping_matched !== null) {
        //this.log.error('ping');
        this.enqueue('Shade_controller::Pong()');
      }

      const pong_matcher = /Shade_controller::Pong\(\)/;
      const pong_matched= pong_matcher.exec(line);
      if (pong_matched !== null) {
        clearTimeout(this.pong_timer);
      }

      //this.log.error('remaining "', this.socket_buffer.substring(index + 1), '"');
      this.socket_buffer = this.socket_buffer.substring(index + 1);
      index = this.socket_buffer.indexOf('\n');
    }
  }

  on_drain() {
    this.log.error('drain');
    this.queue_ready = true;
    while (this.queue.length > 0 && this.queue_ready) {
      this.queue_ready = this.socket.write(this.queue.shift()!);
    }
  }

  // on_end() {
  //   this.log.error('end');
  // }

  on_error() {
    this.log.error('error');
    this.socket.destroy();
  }

  // on_lookup() {
  //   this.log.error('lookup');
  // }

  on_ready() {
    this.ping_timer = setTimeout(this.ping_timeout, 30000);
    this.log.error('ready');
    this.enqueue('Shade_controller::Configure(Shade_Address = ' + this.config.shade_address + ')');
    for (const address in this.shades) {
      this.enqueue('Shade_controller::ConfigureShade(Address1 = ' + address + ')');
    }
    this.on_drain();
  }

  on_timeout() {
    this.log.error('timeout');
    this.socket.destroy();
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.config.shade_table) {

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      this.log.error('shade_table[].name', device.name);
      this.log.error('shade_table[].device_type', device.device_type);
      this.log.error('shade_table[].address', device.address);
      const uuid = this.api.hap.uuid.generate(device.device_type + device.address);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (device.device_type === 'Shade') {
          this.shades[device.address] = new ShadeAccessory(this, existingAccessory);
        }

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if (device.device_type === 'Shade') {
          this.shades[device.address] = new ShadeAccessory(this, accessory);
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  enqueue(data: string) {
    this.log.error('write', data);
    this.queue.push(data + '\n');
    if (this.queue_ready) {
      this.queue_ready = this.socket.write(this.queue.shift()!);
    }
  }
}
