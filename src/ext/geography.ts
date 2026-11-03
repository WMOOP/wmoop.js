/**
 * Behaviour of the generated `wmoop/geography` classes: the composite and its visitor hook.
 *
 * The data, including the `partOf` / `contains` composite, is generated from `wmoop.geography`;
 * this only adds behaviour over it.
 *
 * @module
 */

import { extend } from "../../generated/wmoop/core.js";
import { AdministrativeArea, City, Country, County } from "../../generated/wmoop/geography.js";

/** Visitor hook, where behaviour over the composite lives. */
export interface AreaVisitor {
  visitCountry(country: Country): void;
  visitCounty(county: County): void;
  visitCity(city: City): void;
}

declare module "../../generated/wmoop/geography.js" {
  interface AdministrativeArea {
    /** A short kind name for display: `country`, `county`, `city`. */
    readonly areaKind: string;
    /**
     * This area's own residents plus those of every area it contains, recursively.
     *
     * An area whose resident population is not recorded counts as 0 here.
     */
    readonly totalPopulation: number;
    /** Double dispatch for {@link AreaVisitor}; every kind of area overrides it. */
    accept(visitor: AreaVisitor): void;
  }
}

extend(AdministrativeArea, {
  get areaKind() {
    return this.constructor.name.toLowerCase();
  },
  get totalPopulation(): number {
    let total = this.residentPopulation ?? 0;
    for (const area of this.contains) {
      total += area.totalPopulation;
    }
    return total;
  },
  accept() {
    throw new TypeError(`${this.constructor.name} does not accept an AreaVisitor yet.`);
  },
});

extend(Country, {
  accept(visitor) {
    visitor.visitCountry(this);
  },
});

extend(County, {
  accept(visitor) {
    visitor.visitCounty(this);
  },
});

extend(City, {
  accept(visitor) {
    visitor.visitCity(this);
  },
});
