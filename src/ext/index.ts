/**
 * Hand-written behaviour for the generated classes (the generation gap, TypeScript style).
 *
 * Each module here adds members to the classes of one generated module, with `extend()` from
 * `wmoop/core`, and declares their types by augmenting that module. A member is defined on the
 * class's prototype, so it is inherited down the generated chain and a subclass's own `extend`
 * refines it, through `super` where it needs the parent's. The data, the roles and the relations
 * stay generated.
 *
 * Import this module once, before using the generated classes, so every extension is in place:
 *
 * ```ts
 * import "./ext/index.js";
 * ```
 *
 * A domain gets behaviour by adding its module here and an import below.
 *
 * @module
 */

import "./geography.js";
import "./nature.js";
import "./transport.js";

export type { AreaVisitor } from "./geography.js";
