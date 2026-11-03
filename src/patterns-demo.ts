/**
 * Design-patterns showcase, the TypeScript twin of wmoop.py's patterns_demo.py and wmoop.net's
 * Wmoop.Patterns.Demo.
 *
 * Each section demonstrates one named pattern from src/patterns.ts on the generated WMOOP model and
 * checks itself. The exit code is non-zero when a check fails, so CI can gate on it. Deterministic:
 * fixed dates, no randomness.
 *
 * @module
 */

import "./ext/index.js";
import { Quantity, date } from "../generated/wmoop/core.js";
import { City, Country, County } from "../generated/wmoop/geography.js";
import { Person } from "../generated/wmoop/nature.js";
import { Driver, LicenceCategory, Moped } from "../generated/wmoop/transport.js";
import {
  ActiveDriverSpecification,
  CensusAreaFormat,
  CompactAreaFormat,
  ConceptRegistry,
  PersonBuilder,
  PopulationSumVisitor,
  PrettyPrintVisitor,
  type AreaFormatStrategy,
  type Specification,
} from "./patterns.js";

let failures = 0;

function check(label: string, ok: boolean): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) {
    failures += 1;
  }
}

console.log("=== WMOOP (.js) design-patterns showcase ===\n");

console.log("-- Composite: administrative containment (partOf, NOT inheritance) --");
const cluj = new City({ id: "wmoop.geography/city/cluj-napoca", name: "Cluj-Napoca", residentPopulation: 286_598 });
const turda = new City({ id: "wmoop.geography/city/turda", name: "Turda", residentPopulation: 43_319 });
const bucharest = new City({ id: "wmoop.geography/city/bucharest", name: "Bucharest", residentPopulation: 1_716_961 });

const clujCounty = new County({ id: "wmoop.geography/county/cluj", name: "Cluj" });
clujCounty.contains.add(cluj);
turda.partOf = clujCounty; // either end of the relation can be used

const romania = new Country({ id: "wmoop.geography/country/romania", name: "Romania" });
romania.contains.add(clujCounty);
romania.contains.add(bucharest); // a municipality at county level, not part of a county

check("The inverse end follows: a city knows its county (partOf)", cluj.partOf === clujCounty);
check("Composite sums population recursively", romania.totalPopulation === 286_598 + 43_319 + 1_716_961);

console.log("\n-- Visitor: operations over the model (double dispatch) --");
const printer = new PrettyPrintVisitor();
romania.accept(printer);
process.stdout.write(printer.result);
const census = new PopulationSumVisitor();
romania.accept(census);
check("Visitor computes the same total, independently", census.total === romania.totalPopulation);
check("Visitor counts 3 cities", census.cityCount === 3);

console.log("\n-- Builder: fluent construction of a Person with roles --");
const moped = new Moped({
  id: "wmoop.transport/moped/ciao",
  name: "Piaggio Ciao",
  wheelCount: 2,
  maxSpeed: new Quantity(45, "km/h"),
  engineDisplacement: new Quantity(49, "cm3"),
});
const ada = new PersonBuilder()
  .withId("wmoop.nature/person/ada")
  .named("Ada", "Ada Lovelace")
  .bornOn(date(1990, 1, 1))
  .withDriverLicence("RO-AB-123456", [LicenceCategory.AM, LicenceCategory.A1, LicenceCategory.B], date(2028, 6, 1))
  .withOwnership(date(2022, 3, 15), moped)
  .build();
const owners = [...moped.ownedBy];
check("Builder attached 2 roles", ada.roles.length === 2);
check("Builder's person is a driver (hasRole)", ada.hasRole(Driver));
check("The moped knows its owner (ownedBy)", owners.length === 1 && owners[0]?.subject === ada);

console.log("\n-- Specification: composable rules (and / or / not) --");
const on = date(2026, 10, 16);
const canRideMoped: Specification<Person> = new ActiveDriverSpecification(LicenceCategory.AM, on);
const canRideAnyMotorcycle: Specification<Person> = new ActiveDriverSpecification(LicenceCategory.A, on);
check("Ada satisfies 'can ride a moped (AM)'", canRideMoped.isSatisfiedBy(ada));
check("Ada does NOT satisfy 'can ride an unrestricted motorcycle (A)'", !canRideAnyMotorcycle.isSatisfiedBy(ada));
check("AM and not A holds", canRideMoped.and(canRideAnyMotorcycle.not()).isSatisfiedBy(ada));
check("A or AM holds", canRideAnyMotorcycle.or(canRideMoped).isSatisfiedBy(ada));

console.log("\n-- Strategy: swappable area formatting --");
const compact: AreaFormatStrategy = new CompactAreaFormat();
const detailed: AreaFormatStrategy = new CensusAreaFormat();
console.log(`  compact:  ${compact.format(romania)}`);
console.log(`  detailed: ${detailed.format(romania)}`);
check("Two strategies produce different output", compact.format(romania) !== detailed.format(romania));

console.log("\n-- Registry + Flyweight: canonical ids and instance lookup --");
const registry = new ConceptRegistry();
check(
  "Interned ids are one shared instance",
  registry.intern("wmoop.nature/Person") === registry.intern("wmoop.nature/Person"),
);
registry.register(ada);
registry.register(romania);
check("Registry resolves a registered entity", registry.resolve("wmoop.nature/person/ada") instanceof Person);
check("Registry holds 2 entities", registry.count === 2);

console.log(`\n=== ${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`} ===`);
process.exitCode = failures === 0 ? 0 : 1;
