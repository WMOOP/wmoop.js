/**
 * Runs the shared conformance vectors against this binding.
 *
 * The vectors are written once, in wmoop.doc (`external/wmoop.doc/conformance/`; the format is its
 * README.md), and every binding runs them. This runner reads the bundle `suite.json` and drives the
 * generated classes through their model ids (`WM_ID`) and the model's member names. The
 * hand-written behaviour in src/ext is what the `behaviour` cases check. The exit code is non-zero
 * when an active case fails, so CI can gate on it.
 *
 *     node dist/src/conformance.js                  # every case
 *     node dist/src/conformance.js conf.transport   # only the cases whose id starts with a prefix
 *
 * @module
 */

import "./ext/index.js";
import { readFileSync, readdirSync } from "node:fs";
import { ConceptId, Entity, Links, Quantity, Role, WmoopError } from "../generated/wmoop/core.js";

const ROOT = new URL("../../", import.meta.url); // this file runs from dist/src/
const SUITE = new URL("external/wmoop.doc/conformance/suite.json", ROOT);
const GENERATED = new URL("../generated/wmoop/", import.meta.url);
const FORMAT = 1;

/** A value of the vectors' encoding: JSON. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Args = { [key: string]: Json };

interface Case {
  id: string;
  status?: "active" | "pending";
  reason?: string;
  given?: Args[];
  expect: { outcome: "error"; error_code: string } | Args[];
}

/** A generated class, or a hand-written one: what `new` builds, with the static model metadata. */
type ModelClass = (new (init: object) => object) & { WM_ID: string };
type Names = Map<string, object>;

/** The binding did not do what the case says. */
class Mismatch extends Error {}

// ------------------------------------------------------------------ model types and members
/** Every generated class, by its WM_ID: resolved through metadata, not a naming rule. */
const TYPES = new Map<string, ModelClass>();
for (const file of readdirSync(GENERATED).filter((f) => f.endsWith(".js")).sort()) {
  const module: Record<string, unknown> = await import(new URL(file, GENERATED).href);
  for (const value of Object.values(module)) {
    if (typeof value === "function" && Object.hasOwn(value, "WM_ID")) {
      const type = value as ModelClass;
      if (type.WM_ID !== "") {
        TYPES.set(type.WM_ID, type);
      }
    }
  }
}

function modelType(typeId: Json | undefined): ModelClass {
  const type = TYPES.get(String(typeId));
  if (type === undefined) {
    throw new Mismatch(`no generated class has WM_ID ${String(typeId)}`);
  }
  return type;
}

const key = (name: string): string => name.replaceAll("_", "").toLowerCase();

/** The members of `prototype` and its ancestors below `stop`: generated accessors and hand-written ones. */
function memberNames(prototype: object | null, stop: object | null = Object.prototype): Set<string> {
  const names = new Set<string>();
  for (let p = prototype; p !== null && p !== stop; p = Object.getPrototypeOf(p) as object | null) {
    for (const name of Object.getOwnPropertyNames(p)) {
      if (name !== "constructor") {
        names.add(name);
      }
    }
  }
  return names;
}

/** The one name among `names` that is the model name `modelName`: equal ignoring case and underscores. */
function pick(names: Set<string>, modelName: string, owner: string): string {
  const found = [...names].filter((n) => key(n) === key(modelName));
  if (found.length !== 1) {
    throw new Mismatch(`${owner} has ${found.length === 0 ? "no" : "several"} member(s) for '${modelName}'`);
  }
  return found[0] as string;
}

function member(obj: object, modelName: string): string {
  return pick(memberNames(obj), modelName, obj.constructor.name);
}

/** Reads or writes a member the runner found by name. */
const slot = (obj: object): Record<string, unknown> => obj as Record<string, unknown>;

function bound(names: Names, name: Json | undefined): object {
  const obj = names.get(String(name));
  if (obj === undefined) {
    throw new Mismatch(`nothing is bound as ${String(name)}`);
  }
  return obj;
}

// ------------------------------------------------------------------ values
/** A value of the vectors' encoding, as this binding's own type. */
function value(v: Json, names: Names): unknown {
  if (Array.isArray(v)) {
    return v.map((item) => value(item, names));
  }
  if (v !== null && typeof v === "object") {
    if ("ref" in v) {
      return bound(names, v.ref);
    }
    if ("date" in v) {
      return new Date(`${String(v.date)}T00:00:00Z`);
    }
    if ("unit" in v) {
      return new Quantity(v.value as number, v.unit as string);
    }
    if ("id" in v) {
      return new ConceptId(v.id as string);
    }
  }
  return v; // a scalar; an enumeration value is its model id, which is the generated value too
}

/** A result in the vectors' encoding, so it can be compared with `equals`. */
function plain(v: unknown, names: Names): Json {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
    return v;
  }
  if (v instanceof Date) {
    return { date: v.toISOString().slice(0, 10) };
  }
  if (v instanceof Quantity) {
    return { value: v.value, unit: v.unit };
  }
  if (v instanceof ConceptId) {
    return { id: v.value };
  }
  if (v instanceof Entity || v instanceof Role) {
    for (const [name, obj] of names) {
      if (obj === v) {
        return { ref: name };
      }
    }
    throw new Mismatch(`a query returned ${String(v)}, which no step bound`);
  }
  if (typeof v === "object" && Symbol.iterator in v) {
    return [...(v as Iterable<unknown>)].map((item) => plain(item, names));
  }
  throw new Mismatch(`cannot compare a ${typeof v}`);
}

/** Equality of two plain values: numbers by value, but a boolean is never a number. */
function same(a: Json, b: Json): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i] as Json));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a).sort();
    return same(keys, Object.keys(b).sort()) && keys.every((k) => same(a[k] as Json, b[k] as Json));
  }
  return a === b;
}

// ------------------------------------------------------------------ steps
/** The init object for `type` from the case's model properties, under the binding's member names. */
function init(type: ModelClass, given: Json | undefined, names: Names): Record<string, unknown> {
  const members = memberNames(type.prototype, (type.prototype instanceof Role ? Role : Entity).prototype);
  const out: Record<string, unknown> = {};
  for (const [modelName, v] of Object.entries((given ?? {}) as Args)) {
    out[pick(members, modelName, `${type.name}'s init`)] = value(v, names);
  }
  return out;
}

function construct(a: Args, names: Names): void {
  const type = modelType(a.type);
  const props = init(type, a.with, names);
  let obj: object;
  if (type.prototype instanceof Role) {
    obj = new type(props);
  } else {
    const fallback = a.bind === undefined ? String(a.type).split("/").pop() : String(a.bind);
    obj = new type({ id: a.id ?? `conformance/${fallback}`, name: a.name ?? fallback, ...props });
  }
  if (a.bind !== undefined) {
    names.set(String(a.bind), obj);
  }
}

function attachRole(a: Args, names: Names): void {
  let role: object;
  if ("ref" in a) {
    role = bound(names, a.ref);
  } else {
    const type = modelType(a.role);
    role = new type(init(type, a.with, names));
    if (a.bind !== undefined) {
      names.set(String(a.bind), role);
    }
  }
  (bound(names, a.to) as Entity).addRole(role as Role);
}

/** The member of a relation end, and its `Links` when it is to-many. */
function end(obj: object, relation: Json | undefined): [string, Links<object> | null] {
  const name = member(obj, String(relation));
  const current = slot(obj)[name];
  return [name, current instanceof Links ? (current as Links<object>) : null];
}

function link(a: Args, names: Names): void {
  const obj = bound(names, a.subject);
  const target = bound(names, a.to);
  const [name, links] = end(obj, a.relation);
  if (links !== null) {
    links.add(target);
  } else {
    slot(obj)[name] = target;
  }
}

function unlink(a: Args, names: Names): void {
  const obj = bound(names, a.subject);
  const target = bound(names, a.from);
  const [name, links] = end(obj, a.relation);
  if (links !== null) {
    links.delete(target);
  } else if (slot(obj)[name] === target) {
    slot(obj)[name] = null;
  }
}

// ------------------------------------------------------------------ queries
/** The binding's own value equality (`equals`), both ways; JavaScript has no hash codes to compare. */
function sameValue(q: Json, names: Names): boolean {
  const [a, b] = (q as Json[]).map((v) => value(v, names));
  const equal = (x: unknown, y: unknown): boolean => {
    const equals = (x as { equals?: unknown } | null)?.equals;
    return typeof equals === "function" ? equals.call(x, y) === true : Object.is(x, y);
  };
  return equal(a, b) && equal(b, a);
}

function text(q: Args, names: Names): string {
  if ("value" in q) {
    return String(value(q.value as Json, names));
  }
  const obj = bound(names, q.subject);
  return String(q.property === undefined ? obj : slot(obj)[member(obj, String(q.property))]);
}

/** The subject's model types: its own class first, then up the classes it extends. */
function typeChain(q: Args, names: Names): string[] {
  const chain: string[] = [];
  let type: unknown = bound(names, q.subject).constructor;
  for (; typeof type === "function"; type = Object.getPrototypeOf(type)) {
    if (Object.hasOwn(type, "WM_ID") && (type as ModelClass).WM_ID !== "") {
      chain.push((type as ModelClass).WM_ID);
    }
  }
  return chain;
}

function call(q: Args, names: Names): unknown {
  const obj = bound(names, q.subject);
  const operation = slot(obj)[member(obj, String(q.operation))] as (...args: unknown[]) => unknown;
  return operation.apply(obj, ((q.args ?? []) as Json[]).map((v) => value(v, names)));
}

const unsupported = (query: string) => (): never => {
  throw new Mismatch(`this binding does not support ${query} yet`);
};

const QUERIES: Record<string, (q: Args, names: Names) => unknown> = {
  type_chain: typeChain,
  is_a: (q, n) => (bound(n, q.subject) as Entity).isA(String(q.type)),
  get: (q, n) => slot(bound(n, q.subject))[member(bound(n, q.subject), String(q.property))],
  call,
  text,
  roles: (q, n) => (bound(n, q.subject) as Entity).roles.map((r) => r.roleType.value),
  has_role: (q, n) => (bound(n, q.subject) as Entity).hasRole(modelType(q.role) as unknown as typeof Role),
  get_role: (q, n) => (bound(n, q.subject) as Entity).getRole(modelType(q.role) as unknown as typeof Role),
  role_subject: (q, n) => (bound(n, q.role) as Role).subject,
  same_value: (q, n) => sameValue(q as unknown as Json, n),
  has_capability: unsupported("has_capability"),
  canonical_json: unsupported("canonical_json"),
};

const STEPS: Record<string, (a: Args, names: Names) => void> = {
  construct,
  attach_role: attachRole,
  link,
  unlink,
  assert: (a, names) => check(a, names, "assert"),
};

function check(assertion: Args, names: Names, where: string): void {
  const query = Object.keys(assertion).find((k) => k !== "equals") ?? "";
  const run = QUERIES[query];
  if (run === undefined) {
    throw new Mismatch(`${where}: unknown query ${query}`);
  }
  const got = plain(run(assertion[query] as Args, names), names);
  const expected = assertion.equals ?? null;
  if (!same(got, expected)) {
    throw new Mismatch(`${where}: ${query} returned ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
}

// ------------------------------------------------------------------ cases
/** Runs one case; throws Mismatch when the binding does not do what it says. */
function runCase(c: Case): void {
  const names: Names = new Map();
  const steps = c.given ?? [];
  const fails = Array.isArray(c.expect) ? null : c.expect.error_code;
  for (const [i, step] of steps.entries()) {
    const [kind, args] = Object.entries(step)[0] as [string, Args];
    const where = `given[${i + 1}].${kind}`;
    try {
      const run = STEPS[kind];
      if (run === undefined) {
        throw new Mismatch(`unknown step ${kind}`);
      }
      run(args, names);
    } catch (e) {
      if (e instanceof WmoopError) {
        if (fails !== null && i === steps.length - 1) {
          if (e.code !== fails) {
            throw new Mismatch(`${where} failed with ${e.code}, expected ${fails}: ${e.message}`);
          }
          return;
        }
        throw new Mismatch(`${where} failed with ${e.code}: ${e.message}`);
      }
      if (e instanceof Mismatch) {
        throw new Mismatch(`${where}: ${e.message}`);
      }
      // An error without a code never matches a vector.
      const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      throw new Mismatch(`${where} raised ${error}, without an error code`);
    }
  }
  if (fails !== null) {
    throw new Mismatch(`every step succeeded, expected ${fails}`);
  }
  for (const [j, assertion] of (c.expect as Args[]).entries()) {
    check(assertion, names, `expect[${j + 1}]`);
  }
}

function main(prefixes: string[]): number {
  const suite = JSON.parse(readFileSync(SUITE, "utf-8")) as { format?: number; cases: Case[] };
  if (suite.format !== FORMAT) {
    console.log(`${SUITE.pathname} has format ${suite.format}; this runner reads format ${FORMAT}`);
    return 2;
  }
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const c of suite.cases) {
    if (prefixes.length > 0 && !prefixes.some((p) => c.id.startsWith(p))) {
      continue;
    }
    let problem: string | null = null;
    try {
      runCase(c);
    } catch (e) {
      // A crash in one case must not hide the others.
      problem = e instanceof Mismatch ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (c.status === "pending") {
      pending += 1;
      console.log(`[PENDING] ${c.id}: ${problem === null ? "passes now: make it active in wmoop.doc" : c.reason}`);
    } else if (problem === null) {
      passed += 1;
      console.log(`[PASS] ${c.id}`);
    } else {
      failed += 1;
      console.log(`[FAIL] ${c.id}: ${problem}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${pending} pending.`);
  return failed === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
