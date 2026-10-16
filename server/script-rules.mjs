import { textOnly } from "./core.mjs";
export const writingModes = {
  balanced: "Balance clear explanation, source quality and narrative pace.",
  deep: "Research deeply using independent primary sources. Verify each date, number and factual claim against at least two independent sources; omit unsupported claims. Record disagreements and limitations.",
  fast: "Keep research and wording concise. Prefer a small set of well-supported claims. Omit uncertain details instead of speculating.",
  conversational:
    "Use natural spoken language, concrete examples, varied sentence length and a direct conversational voice. Avoid corporate phrasing and exaggerated claims.",
};
export function validateScriptSettings(input = {}) {
  const mode = input.mode || "balanced";
  if (!writingModes[mode]) throw Error("Choose a supported writing mode");
  const list = (value) => {
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some((v) => typeof v !== "string" || v.length > 160)
    )
      throw Error("Use up to 100 short script phrases");
    return [...new Set(value.map((v) => v.trim()).filter(Boolean))];
  };
  const maxSentenceWords = Number(input.maxSentenceWords || 30);
  if (
    !Number.isInteger(maxSentenceWords) ||
    maxSentenceWords < 3 ||
    maxSentenceWords > 100
  )
    throw Error("Maximum sentence length must be 3–100 words");
  const banned = list(input.banned || []),
    required = list(input.required || []);
  if (
    required.some((r) =>
      banned.some((b) => r.toLowerCase().includes(b.toLowerCase())),
    )
  )
    throw Error("A required phrase contains a banned phrase");
  return { mode, banned, required, maxSentenceWords };
}
export function scriptRuleIssues(script, settings = {}, language = "en") {
  const rules = validateScriptSettings(settings),
    text = textOnly(script),
    lowered = text.toLocaleLowerCase(),
    issues = [];
  for (const phrase of rules.banned) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(
        text,
      )
    )
      issues.push(`Banned phrase: ${phrase}`);
  }
  for (const phrase of rules.required)
    if (!lowered.includes(phrase.toLocaleLowerCase()))
      issues.push(`Missing required phrase: ${phrase}`);
  let sentences;
  try {
    sentences = [
      ...new Intl.Segmenter(language, { granularity: "sentence" }).segment(
        text,
      ),
    ].map((s) => s.segment);
  } catch {
    sentences = text.split(/[.!?。！？]+/);
  }
  for (const sentence of sentences) {
    const count = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (count > rules.maxSentenceWords)
      issues.push(
        `Sentence has ${count} words (maximum ${rules.maxSentenceWords}): ${sentence.trim().slice(0, 100)}`,
      );
  }
  return issues;
}
export function scriptDirection(p) {
  const rules = validateScriptSettings(p.scriptSettings);
  return `Writing mode: ${writingModes[rules.mode]}\nOpen with a concrete hook in the first fifteen seconds. Structure around a central question answered near the end, with meaningful re-hooks about every nine seconds; do not add empty suspense or unsupported claims.\nEnforced script rules: ${JSON.stringify(rules)}\n${p.scriptingSkill ? `User-supplied scripting methodology (${p.scriptingSkill.name}):\n${p.scriptingSkill.text}` : ""}`;
}
