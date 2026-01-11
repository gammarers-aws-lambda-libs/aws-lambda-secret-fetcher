import { getSecretValue } from '../src';

describe('getSecretValue', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns parsed JSON when response is JSON string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: '{"username":"admin","password":"secret"}',
      }),
    });

    const result = await getSecretValue<{ username: string; password: string }>('test-secret');
    expect(result).toEqual({ username: 'admin', password: 'secret' });
  });

  test('returns plain string when response is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: 'plain-secret-value',
      }),
    });

    const result = await getSecretValue('test-secret');
    expect(result).toBe('plain-secret-value');
  });

  test('throws on invalid response format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: 'response' }),
    });

    await expect(getSecretValue('test-secret')).rejects.toThrow('Invalid secret response format');
  });
});
