import test from "node:test";
import assert from "node:assert/strict";
import { validateScriptSettings, scriptRuleIssues } from "../server/script-rules.mjs";
test("script rules enforce phrases and sentence length without matching partial words", () => {
  const settings = { banned: ["AI", "delve", "a+b"], required: ["clear story"], maxSentenceWords: 8 };
  assert.deepEqual(scriptRuleIssues("A clear story about a railway. Facts come first.", settings), []);
  const issues = scriptRuleIssues("AI can delve into a+b. One two three four five six seven eight nine.", settings);
  assert.equal(issues.length, 5);
  assert.ok(issues.some(i => /maximum 8/.test(i)));
  assert.throws(() => validateScriptSettings({ banned: ["glow"], required: ["no glow"] }), /contains a banned/);
  assert.throws(() => validateScriptSettings({ maxSentenceWords: 0.5 }), /3–100/);
});
