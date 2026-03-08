import { createPatch } from 'diff'

const SYSTEM_PROMPT = `You are an expert at diagnosing and fixing OpenClaw configuration files.
OpenClaw is an AI assistant platform that uses JSON config files.
When given a broken config and error message, analyze what went wrong
and provide a fixed version if possible.
If you provide a fix, wrap it in a \`\`\`json code block.
Be concise and technical.`

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
} as const

export interface LLMConfig {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model?: string
}

export interface LLMFixResult {
  diagnosis: string
  fixedConfig: unknown | null
  diffPatch?: string
}

export interface LLMClient {
  diagnose(brokenConfig: string, errorLog: string): Promise<string>
  fix(brokenConfig: string, errorLog: string): Promise<LLMFixResult>
}

export interface FixOptions {
  dryRun?: boolean
}

function buildUserPrompt(
  action: 'diagnose' | 'fix',
  brokenConfig: string,
  errorLog: string,
): string {
  const instruction =
    action === 'diagnose'
      ? 'Diagnose the failure in plain technical language.'
      : 'Diagnose the failure and provide a corrected config if possible.'

  return `${instruction}

Broken config:
\`\`\`json
${brokenConfig}
\`\`\`

Error log:
\`\`\`
${errorLog}
\`\`\``
}

function extractOpenAIContent(payload: unknown): string {
  const content = (payload as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content

  return typeof content === 'string' ? content.trim() : ''
}

function extractAnthropicContent(payload: unknown): string {
  const chunks = (payload as { content?: Array<{ type?: string; text?: string }> })?.content ?? []
  const text = chunks
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text ?? '')
    .join('\n')

  return text.trim()
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    return JSON.stringify(payload)
  } catch {
    return ''
  }
}

function extractJsonBlock(content: string): unknown | null {
  const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/i)
  if (!jsonMatch) {
    return null
  }

  try {
    return JSON.parse(jsonMatch[1])
  } catch {
    return null
  }
}

function stringifyConfig(value: unknown): string {
  if (typeof value === 'string') {
    return value.endsWith('\n') ? value : `${value}\n`
  }

  return `${JSON.stringify(value, null, 2)}\n`
}

async function requestOpenAI(prompt: string, config: LLMConfig): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_MODELS.openai,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const body = await parseErrorBody(response)
    throw new Error(`OpenAI request failed: ${response.status}${body ? ` ${body}` : ''}`)
  }

  const payload = await response.json()
  return extractOpenAIContent(payload)
}

async function requestAnthropic(prompt: string, config: LLMConfig): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_MODELS.anthropic,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const body = await parseErrorBody(response)
    throw new Error(`Anthropic request failed: ${response.status}${body ? ` ${body}` : ''}`)
  }

  const payload = await response.json()
  return extractAnthropicContent(payload)
}

async function callProvider(prompt: string, config: LLMConfig): Promise<string> {
  if (config.provider === 'openai') {
    return requestOpenAI(prompt, config)
  }

  return requestAnthropic(prompt, config)
}

export function createLLMClient(config: LLMConfig): LLMClient {
  if (!config.apiKey?.trim()) {
    throw new Error('API key required')
  }

  return {
    async diagnose(brokenConfig: string, errorLog: string): Promise<string> {
      const prompt = buildUserPrompt('diagnose', brokenConfig, errorLog)
      return callProvider(prompt, config)
    },
    async fix(brokenConfig: string, errorLog: string): Promise<LLMFixResult> {
      const prompt = buildUserPrompt('fix', brokenConfig, errorLog)
      const diagnosis = await callProvider(prompt, config)
      const fixedConfig = extractJsonBlock(diagnosis)

      return {
        diagnosis,
        fixedConfig,
      }
    },
  }
}

export async function diagnoseFailure(
  brokenConfig: string,
  errorLog: string,
  llmConfig: LLMConfig,
): Promise<LLMFixResult> {
  const client = createLLMClient(llmConfig)
  const diagnosis = await client.diagnose(brokenConfig, errorLog)

  return {
    diagnosis,
    fixedConfig: null,
  }
}

export async function fixConfig(
  brokenConfig: string,
  errorLog: string,
  llmConfig: LLMConfig,
  options: FixOptions = {},
): Promise<LLMFixResult> {
  const client = createLLMClient(llmConfig)
  const result = await client.fix(brokenConfig, errorLog)

  if (result.fixedConfig === null) {
    return result
  }

  const patch = createPatch(
    'openclaw.json',
    stringifyConfig(brokenConfig),
    stringifyConfig(result.fixedConfig),
  )

  if (options.dryRun) {
    return {
      ...result,
      diffPatch: patch,
    }
  }

  return {
    ...result,
    diffPatch: patch,
  }
}
