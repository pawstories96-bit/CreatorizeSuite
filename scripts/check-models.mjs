import { cliPath } from "../server/agents.mjs";
import { codexModels, claudeModels } from "../server/model-catalog.mjs";
for (const [provider, query] of [
  ["codex", codexModels],
  ["claude", claudeModels],
]) {
  try {
    console.log(
      provider,
      JSON.stringify(await query(cliPath(provider), process.cwd()), null, 2),
    );
  } catch (e) {
    console.error(provider, e.message);
    process.exitCode = 1;
  }
}
