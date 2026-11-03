/**
 * Behaviour of the generated `wmoop/nature` classes.
 *
 * @module
 */

import { extend } from "../../generated/wmoop/core.js";
import { Person } from "../../generated/wmoop/nature.js";

declare module "../../generated/wmoop/nature.js" {
  interface Person {
    /** Age in whole years on `on`, or null when the date of birth is not recorded. */
    ageOn(on: Date): number | null;
  }
}

extend(Person, {
  ageOn(on) {
    const born = this.dateOfBirth;
    if (born === null) {
      return null;
    }
    const month = on.getUTCMonth() - born.getUTCMonth();
    const beforeBirthday = month < 0 || (month === 0 && on.getUTCDate() < born.getUTCDate());
    return on.getUTCFullYear() - born.getUTCFullYear() - (beforeBirthday ? 1 : 0);
  },
});
