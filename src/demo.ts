/**
 * Runnable walkthrough, the TypeScript twin of wmoop.py's demo.py and wmoop.net's Wmoop.Demo.
 *
 * Same scenario, same output shape: cross-domain roles by composition, then the Vehicle hierarchy
 * polymorphically. The data classes (Person, Moped, Driver, Owner, ...) are GENERATED from the WML
 * model in wmoop.doc (see generated/); the behaviour used here (ageOn, canDrive, describe) is
 * hand-written, in src/ext.
 *
 * @module
 */

import "./ext/index.js";
import { Quantity, date } from "../generated/wmoop/core.js";
import { Person } from "../generated/wmoop/nature.js";
import { Driver, LicenceCategory, Moped, Motorcycle, Owner, type Vehicle } from "../generated/wmoop/transport.js";

/** A model date as the model writes it: `2026-10-16`. */
const day = (d: Date | null): string => (d === null ? "unknown" : d.toISOString().slice(0, 10));

console.log("=== WMOOP (.js) demo ===\n");

console.log("-- Part 1: a Person and the roles they play --");
// A Person is an intrinsic biological entity (wmoop.nature). Nothing here knows about vehicles.
const today = date(2026, 10, 16);
const ada = new Person({
  id: "wmoop.nature/person/ada-lovelace",
  name: "Ada",
  fullName: "Ada Lovelace",
  legCount: 2,
  dateOfBirth: date(1990, 1, 1),
});
console.log(`${ada.name}: legs=${ada.legCount}, age on ${day(today)}=${ada.ageOn(today)}`);

const moped = new Moped({
  id: "wmoop.transport/moped/piaggio-ciao",
  name: "Piaggio Ciao",
  wheelCount: 2,
  maxSpeed: new Quantity(45, "km/h"),
  engineDisplacement: new Quantity(49, "cm3"),
});

// Grant two Transport facets to the SAME person, at the same time, by composition.
ada.addRole(
  new Driver({
    licenceNumber: "RO-AB-123456",
    licenceCategories: [LicenceCategory.AM, LicenceCategory.A1, LicenceCategory.B],
    licenceExpiry: date(2028, 6, 1),
  }),
);
const owner = ada.addRole(new Owner({ ownedSince: date(2022, 3, 15) }));
owner.owns.add(moped); // a generated relation: the moped's ownedBy follows

console.log(`Is ${ada.name} a driver? ${ada.hasRole(Driver)}`);
console.log(`Is ${ada.name} an owner? ${ada.hasRole(Owner)}`);
console.log(`${ada.name} holds ${ada.roles.length} role(s):`);
for (const role of ada.roles) {
  console.log(`   - ${role.roleType} (on ${role.subject?.name})`);
}

const licence = ada.getRole(Driver);
if (licence === null) {
  throw new Error("Ada was given a Driver role above.");
}
console.log(
  `Licence ${licence.licenceNumber}: can ride a moped (AM) today? ${licence.canDrive(LicenceCategory.AM, today)}`,
);
console.log(`Can ride an unrestricted motorcycle (A) today? ${licence.canDrive(LicenceCategory.A, today)}`);
console.log(`Owns '${[...owner.owns].map((v) => v.name).join(", ")}' since ${day(owner.ownedSince)}`);
console.log(`'${moped.name}' is owned by ${[...moped.ownedBy].map((o) => o.subject?.name).join(", ")}\n`);

console.log("-- Part 2: the Vehicle hierarchy, polymorphically --");
const fleet: Vehicle[] = [
  moped,
  new Motorcycle({
    id: "wmoop.transport/motorcycle/bmw-r1250gs",
    name: "BMW R1250 GS",
    wheelCount: 2,
    maxSpeed: new Quantity(200, "km/h"),
    engineDisplacement: new Quantity(1254, "cm3"),
  }),
  new Motorcycle({
    id: "wmoop.transport/motorcycle/ural-gear-up",
    name: "Ural Gear-Up",
    wheelCount: 3, // a sidecar outfit
    maxSpeed: new Quantity(110, "km/h"),
    engineDisplacement: new Quantity(749, "cm3"),
  }),
];
for (const vehicle of fleet) {
  console.log(`   ${vehicle.describe()}`);
}

console.log("\n=== demo complete ===");
