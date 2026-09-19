import test from "node:test";
import assert from "node:assert/strict";
import { subscribeSnapshot } from "../src/hinge/subscription.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("subscription registers first and a newer event wins over an in-flight snapshot", async () => {
  const initial = deferred();
  const seen = [];
  let event;
  let removed = 0;
  const sub = subscribeSnapshot(
    async (fn) => {
      event = fn;
      return () => removed++;
    },
    () => initial.promise,
    (v) => seen.push(v),
    assert.fail,
  );
  await Promise.resolve();
  event({ angle: 90 });
  initial.resolve({ angle: 30 });
  await sub.ready;
  assert.deepEqual(seen, [{ angle: 90 }]);
  sub.stop();
  sub.stop();
  assert.equal(removed, 1);
});
test("unmount while registering removes the late listener and does not fetch", async () => {
  const pending = deferred();
  let removed = 0;
  let fetched = false;
  const sub = subscribeSnapshot(
    () => pending.promise,
    async () => {
      fetched = true;
    },
    assert.fail,
    assert.fail,
  );
  sub.stop();
  pending.resolve(() => removed++);
  await sub.ready;
  assert.equal(removed, 1);
  assert.equal(fetched, false);
});
test("unmount during snapshot ignores its resolution; transport failures are reported", async () => {
  const pending = deferred();
  let failures = 0;
  const sub = subscribeSnapshot(
    async () => () => {},
    () => pending.promise,
    assert.fail,
    assert.fail,
  );
  await Promise.resolve();
  sub.stop();
  pending.resolve(90);
  await sub.ready;
  await subscribeSnapshot(
    async () => {
      throw Error("bridge");
    },
    assert.fail,
    assert.fail,
    () => failures++,
  ).ready;
  assert.equal(failures, 1);
});
