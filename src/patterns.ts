/**
 * Design patterns over the generated model, the TypeScript twin of wmoop.py's `wmoop.patterns` and
 * wmoop.net's `Wmoop.Patterns`: Visitor, Specification (with `and` / `or` / `not`), Builder,
 * Strategy and a Registry / Flyweight.
 *
 * Behaviour lives here, OUTSIDE the data model. The generated classes stay data; the patterns use
 * the behaviour src/ext adds to them (`accept`, `totalPopulation`, `canDrive`), and importing this
 * module loads it.
 *
 * @module
 */

import "./ext/index.js";
import type { AreaVisitor } from "./ext/index.js";
import { ConceptId, type Entity, type Role } from "../generated/wmoop/core.js";
import type { AdministrativeArea, City, Country, County } from "../generated/wmoop/geography.js";
import { Person } from "../generated/wmoop/nature.js";
import { Driver, type LicenceCategory, Owner, type Vehicle } from "../generated/wmoop/transport.js";

// ------------------------------------------------------------------ Visitor
/** Renders an administrative tree as indented text: behaviour outside the model. */
export class PrettyPrintVisitor implements AreaVisitor {
  readonly #lines: string[] = [];
  #depth = 0;

  /** The rendering so far, one line per visited area. */
  get result(): string {
    return this.#lines.map((line) => `${line}\n`).join("");
  }

  visitCountry(country: Country): void {
    this.#descend(country);
  }

  visitCounty(county: County): void {
    this.#descend(county);
  }

  visitCity(city: City): void {
    this.#line(city);
  }

  #line(area: AdministrativeArea): void {
    const pop = area.residentPopulation ?? "unknown";
    this.#lines.push(`${"  ".repeat(this.#depth)}- ${area.name} (${area.areaKind}, pop ${pop})`);
  }

  #descend(area: AdministrativeArea): void {
    this.#line(area);
    this.#depth += 1;
    for (const child of area.contains) {
      child.accept(this);
    }
    this.#depth -= 1;
  }
}

/**
 * Totals population and counts cities by walking the composite. A new report is a new visitor,
 * never an edit to a generated class.
 */
export class PopulationSumVisitor implements AreaVisitor {
  #total = 0;
  #cityCount = 0;

  /** Resident population across every visited area. */
  get total(): number {
    return this.#total;
  }

  /** How many cities were visited. */
  get cityCount(): number {
    return this.#cityCount;
  }

  visitCountry(country: Country): void {
    this.#recurse(country);
  }

  visitCounty(county: County): void {
    this.#recurse(county);
  }

  visitCity(city: City): void {
    this.#total += city.residentPopulation ?? 0;
    this.#cityCount += 1;
  }

  #recurse(area: AdministrativeArea): void {
    this.#total += area.residentPopulation ?? 0;
    for (const child of area.contains) {
      child.accept(this);
    }
  }
}

// ------------------------------------------------------------------ Specification
/**
 * A composable boolean rule, combined with `and`, `or` and `not`. The same vocabulary validates
 * model data and filters it: `people.filter((p) => spec.isSatisfiedBy(p))`.
 */
export abstract class Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  /** Satisfied when this rule and `other` both are. */
  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  /** Satisfied when this rule or `other` is. */
  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  /** Satisfied when this rule is not. */
  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class AndSpecification<T> extends Specification<T> {
  readonly #left: Specification<T>;
  readonly #right: Specification<T>;

  constructor(left: Specification<T>, right: Specification<T>) {
    super();
    this.#left = left;
    this.#right = right;
  }

  override isSatisfiedBy(candidate: T): boolean {
    return this.#left.isSatisfiedBy(candidate) && this.#right.isSatisfiedBy(candidate);
  }
}

class OrSpecification<T> extends Specification<T> {
  readonly #left: Specification<T>;
  readonly #right: Specification<T>;

  constructor(left: Specification<T>, right: Specification<T>) {
    super();
    this.#left = left;
    this.#right = right;
  }

  override isSatisfiedBy(candidate: T): boolean {
    return this.#left.isSatisfiedBy(candidate) || this.#right.isSatisfiedBy(candidate);
  }
}

class NotSpecification<T> extends Specification<T> {
  readonly #inner: Specification<T>;

  constructor(inner: Specification<T>) {
    super();
    this.#inner = inner;
  }

  override isSatisfiedBy(candidate: T): boolean {
    return !this.#inner.isSatisfiedBy(candidate);
  }
}

/**
 * Satisfied when a Person holds a Driver role valid for a licence category on a date.
 *
 * It reads a ROLE (`getRole`), never a subclass: the cross-domain facet stays composed, so this
 * rule works without `wmoop/nature` ever knowing about licences.
 */
export class ActiveDriverSpecification extends Specification<Person> {
  readonly #category: LicenceCategory;
  readonly #on: Date;

  constructor(category: LicenceCategory, on: Date) {
    super();
    this.#category = category;
    this.#on = on;
  }

  override isSatisfiedBy(candidate: Person): boolean {
    return candidate.getRole(Driver)?.canDrive(this.#category, this.#on) === true;
  }
}

// ------------------------------------------------------------------ Builder
/** Fluent builder assembling a Person together with the roles they play. */
export class PersonBuilder {
  #id: ConceptId | string | null = null;
  #name = "Unnamed";
  #fullName: string | null = null;
  #dateOfBirth: Date | null = null;
  readonly #roles: (() => Role)[] = [];

  withId(id: ConceptId | string): this {
    this.#id = id;
    return this;
  }

  /** The person's name, and their full name when it is not the same. */
  named(name: string, fullName: string | null = null): this {
    this.#name = name;
    this.#fullName = fullName;
    return this;
  }

  bornOn(dateOfBirth: Date): this {
    this.#dateOfBirth = dateOfBirth;
    return this;
  }

  /** Attaches a Driver role holding `categories`, valid until `expiry` when one is given. */
  withDriverLicence(number: string, categories: Iterable<LicenceCategory>, expiry: Date | null = null): this {
    const held = [...categories];
    this.#roles.push(() => new Driver({ licenceNumber: number, licenceCategories: held, licenceExpiry: expiry }));
    return this;
  }

  /** Attaches an Owner role, since `since`, that owns `vehicles`. */
  withOwnership(since: Date, ...vehicles: Vehicle[]): this {
    this.#roles.push(() => {
      const owner = new Owner({ ownedSince: since });
      for (const vehicle of vehicles) {
        owner.owns.add(vehicle);
      }
      return owner;
    });
    return this;
  }

  /** A new Person, with a new instance of every role attached in the order they were added. */
  build(): Person {
    if (this.#id === null) {
      throw new Error("A person needs a ConceptId; call withId() first.");
    }
    const person = new Person({
      id: this.#id,
      name: this.#name,
      fullName: this.#fullName ?? this.#name,
      dateOfBirth: this.#dateOfBirth,
    });
    for (const make of this.#roles) {
      person.addRole(make());
    }
    return person;
  }
}

// ------------------------------------------------------------------ Strategy
/** A swappable algorithm for formatting an area label. */
export interface AreaFormatStrategy {
  format(area: AdministrativeArea): string;
}

/** A compact, one-line label. */
export class CompactAreaFormat implements AreaFormatStrategy {
  format(area: AdministrativeArea): string {
    return `${area.name} (${area.areaKind})`;
  }
}

/** A census-style label, with the total population and the number of sub-areas. */
export class CensusAreaFormat implements AreaFormatStrategy {
  format(area: AdministrativeArea): string {
    const pop = area.totalPopulation.toLocaleString("en-US");
    return `${area.name} [${area.areaKind}] pop=${pop} across ${area.contains.size} sub-area(s)`;
  }
}

// ------------------------------------------------------------------ Registry + Flyweight
/** Canonicalizes ConceptId values (Flyweight) and holds L2 individuals for lookup by id (Registry). */
export class ConceptRegistry {
  readonly #ids = new Map<string, ConceptId>();
  readonly #entities = new Map<string, Entity>();

  /** The one shared ConceptId for `value`: interning the same text twice returns the same instance. */
  intern(value: string): ConceptId {
    let id = this.#ids.get(value);
    if (id === undefined) {
      id = new ConceptId(value);
      this.#ids.set(value, id);
    }
    return id;
  }

  /** Registers `entity` under its id, replacing any entity registered under the same id, and returns it. */
  register<E extends Entity>(entity: E): E {
    this.#entities.set(entity.id.value, entity);
    return entity;
  }

  /** The entity registered under `id`, or null. */
  resolve(id: ConceptId | string): Entity | null {
    return this.#entities.get(id instanceof ConceptId ? id.value : id) ?? null;
  }

  /** How many entities are registered. */
  get count(): number {
    return this.#entities.size;
  }
}
