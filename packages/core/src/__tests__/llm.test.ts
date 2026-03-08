import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  diagnoseFailure,
  fixConfig,
  createLLMClient,
  type LLMConfig,
  type LLMFixResult,
} from '../llm.js'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockOpenAIResponse = (content: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content } }],
  }),
})

const mockAnthropicResponse = (content: string) => ({
  ok: true,
  json: async () => ({
    content: [{ type: 'text', text: content }],
  }),
})

describe('createLLMClient', () => {
  it('throws if no API key provided', () => {
    expect(() => createLLMClient({ provider: 'openai', apiKey: '' }))
      .toThrow('API key required')
  })

  it('creates openai client with valid config', () => {
    const client = createLLMClient({ provider: 'openai', apiKey: 'sk-test' })
    expect(client).toBeDefined()
    expect(typeof client.diagnose).toBe('function')
    expect(typeof client.fix).toBe('function')
  })

  it('creates anthropic client with valid config', () => {
    const client = createLLMClient({ provider: 'anthropic', apiKey: 'ant-test' })
    expect(client).toBeDefined()
  })
})

describe('diagnoseFailure', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns diagnosis from OpenAI', async () => {
    mockFetch.mockResolvedValue(mockOpenAIResponse(
      'The config is missing the required "agents" field. This causes startup failure.'
    ))

    const result = await diagnoseFailure(
      '{ "version": "1.0" }',
      'Error: agents field is undefined',
      { provider: 'openai', apiKey: 'sk-test' }
    )

    expect(result.diagnosis).toContain('agents')
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][0]).toContain('openai')
  })

  it('returns diagnosis from Anthropic', async () => {
    mockFetch.mockResolvedValue(mockAnthropicResponse(
      'Invalid JSON syntax at line 3: unexpected token.'
    ))

    const result = await diagnoseFailure(
      '{ invalid json }',
      'SyntaxError: Unexpected token',
      { provider: 'anthropic', apiKey: 'ant-test' }
    )

    expect(result.diagnosis).toContain('JSON')
    expect(mockFetch.mock.calls[0][0]).toContain('anthropic')
  })

  it('includes error log in prompt sent to LLM', async () => {
    mockFetch.mockResolvedValue(mockOpenAIResponse('Config has wrong schema version.'))

    await diagnoseFailure(
      '{ "version": "0.1" }',
      'VersionMismatchError: expected 1.x',
      { provider: 'openai', apiKey: 'sk-test' }
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const prompt = JSON.stringify(body)
    expect(prompt).toContain('VersionMismatchError')
  })

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    await expect(
      diagnoseFailure('{}', 'error', { provider: 'openai', apiKey: 'bad-key' })
    ).rejects.toThrow()
  })
})

describe('fixConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns fixed config as parsed object', async () => {
    const fixedConfig = { version: '1.0', agents: {}, plugins: {} }
    mockFetch.mockResolvedValue(mockOpenAIResponse(
      `Here is the fixed config:\n\`\`\`json\n${JSON.stringify(fixedConfig)}\n\`\`\``
    ))

    const result = await fixConfig(
      '{ "version": "1.0" }',
      'Missing agents and plugins fields',
      { provider: 'openai', apiKey: 'sk-test' }
    )

    expect(result.fixedConfig).toMatchObject(fixedConfig)
    expect(result.diagnosis).toBeDefined()
  })

  it('returns null fixedConfig if LLM cannot fix', async () => {
    mockFetch.mockResolvedValue(mockOpenAIResponse(
      'I cannot determine the correct fix for this config. The error is too ambiguous.'
    ))

    const result = await fixConfig(
      '{ broken }',
      'Unknown error',
      { provider: 'openai', apiKey: 'sk-test' }
    )

    // fixedConfig should be null if no valid JSON block found
    expect(result.fixedConfig).toBeNull()
    expect(result.diagnosis).toBeDefined()
  })

  it('dry-run mode returns diff without applying', async () => {
    const fixedConfig = { version: '2.0', agents: {} }
    mockFetch.mockResolvedValue(mockOpenAIResponse(
      `\`\`\`json\n${JSON.stringify(fixedConfig)}\n\`\`\``
    ))

    const result = await fixConfig(
      '{ "version": "1.0" }',
      'version needs upgrade',
      { provider: 'openai', apiKey: 'sk-test' },
      { dryRun: true }
    )

    expect(result.fixedConfig).toMatchObject(fixedConfig)
    expect(result.diffPatch).toBeDefined()
    expect(result.diffPatch).toContain('1.0')
  })
})
