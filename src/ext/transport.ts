/**
 * Behaviour of the generated `wmoop/transport` classes: describing vehicles, what a licence allows.
 *
 * @module
 */

import { extend } from "../../generated/wmoop/core.js";
import { Driver, Moped, Motorcycle, Vehicle } from "../../generated/wmoop/transport.js";

declare module "../../generated/wmoop/transport.js" {
  interface Vehicle {
    /** A short kind name for display; each kind of vehicle refines it. */
    readonly classification: string;
    /** One line about the vehicle: its name, kind, wheels and top speed. */
    describe(): string;
  }

  interface Driver {
    /**
     * True when the licence covers `category` and has not expired on `on`.
     *
     * The model records no issue date, and a licence whose expiry is not recorded counts as valid.
     */
    canDrive(category: LicenceCategory, on: Date): boolean;
  }
}

// Every vehicle inherits these.
extend(Vehicle, {
  get classification() {
    return "vehicle";
  },
  describe() {
    const speed = this.maxSpeed ?? "unknown";
    return `${this.name} — a ${this.classification} with ${this.wheelCount} wheels, top speed ${speed}.`;
  },
});

// Inherited by Moped too.
extend(Motorcycle, {
  get classification() {
    return "motorcycle";
  },
  describe() {
    return `${super.describe()} Engine: ${this.engineDisplacement}.`;
  },
});

extend(Moped, {
  get classification() {
    return "moped";
  },
});

extend(Driver, {
  canDrive(category, on) {
    const expiry = this.licenceExpiry;
    return this.licenceCategories.includes(category) && (expiry === null || on.getTime() <= expiry.getTime());
  },
});
