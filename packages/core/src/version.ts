export async function detectOpenClawVersion(_configPath: string): Promise<string> {
  // TODO: ALA-410 — try openclaw.json field, then CLI, then package.json, then 'unknown'
  return 'unknown';
}

export async function detectConfigPath(): Promise<string | null> {
  // TODO: ALA-410 — auto-detect ~/.openclaw/openclaw.json etc.
  return null;
}
