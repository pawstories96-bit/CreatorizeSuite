import test from "node:test";
import assert from "node:assert/strict";
import { channelURL, duplicateTopic } from "../server/channel-catalog.mjs";
import { autoChapters, validateMetadata, descriptionWithCredits } from "../server/metadata.mjs";
test("public channel URLs are constrained and the duplicate guard catches reordered topics", () => {
  assert.equal(channelURL("https://youtube.com/@thegruss-i8w/videos?view=0"), "https://www.youtube.com/@thegruss-i8w");
  assert.throws(() => channelURL("https://youtube.com/watch?v=abcdefghijk"));
  assert.throws(() => channelURL("https://youtube.com.evil.invalid/@name"));
  assert.throws(() => channelURL("https://credentials@youtube.com/@name"));
  assert.equal(duplicateTopic("Bridge collapse Baltimore investigation", ["Investigation: Baltimore bridge collapse"]), true);
  assert.equal(duplicateTopic("How lithium batteries store energy", ["Investigation: Baltimore bridge collapse"]), false);
});
test("long publishing descriptions reserve room for complete source credits", () => {
  const ledger = [{ name: "Terrain", author: "Source authors", license: "CC-BY", source: "https://source.test/attribution" }];
  const result = descriptionWithCredits("A".repeat(5000), ledger);
  assert.equal(result.length, 5000); assert.ok(result.endsWith(ledger[0].source));
  assert.throws(() => descriptionWithCredits("", [{ ...ledger[0], author: "X".repeat(5000) }]), /credits exceed/);
});
test("chapter timestamps derive from real shots and replace fabricated generated timestamps", () => {
  const p = { durationSec: 62, shots: [0, 8, 16, 24, 32, 40, 48, 56].map((start, i) => ({ start, end: start + 8, title: `Chapter ${i}` })) };
  assert.deepEqual(autoChapters(p).map(c => c.start), [0, 16, 32, 48]);
  const data = validateMetadata({ titles: ["A real title"], description: "An original description\nChapters\n0:00 Fake introduction\n9:00 Fabricated", tags: ["history"] }, p);
  assert.match(data.description, /0:16 Chapter 2/); assert.doesNotMatch(data.description, /Fake|Fabricated/);
  assert.equal(autoChapters({ durationSec: 12, shots: [{ start: 0, title: "Short" }] }).length, 0);
});
