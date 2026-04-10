import { secretFetcher } from '../src';

describe('secretFetcher.getSecretValueValue', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should return parsed JSON when response is JSON string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: '{"username":"admin","password":"secret"}',
      }),
    });

    const result = await secretFetcher.getSecretValue<{ username: string; password: string }>('test-secret');
    expect(result).toEqual({ username: 'admin', password: 'secret' });
  });

  test('should return plain string when response is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: 'plain-secret-value',
      }),
    });

    const result = await secretFetcher.getSecretValue('test-secret');
    expect(result).toBe('plain-secret-value');
  });

  test('should throw on invalid response format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: 'response' }),
    });

    await expect(secretFetcher.getSecretValue('test-secret')).rejects.toThrow('Invalid secret response format');
  });

  test('should use extensionHttpPort from options when set', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: 'plain-secret-value',
      }),
    });

    await secretFetcher.getSecretValue('test-secret', { extensionHttpPort: 9999 });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/secretsmanager/get?secretId=test-secret',
      expect.any(Object),
    );
  });
});
