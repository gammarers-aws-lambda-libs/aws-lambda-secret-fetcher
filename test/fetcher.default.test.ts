import { FetchRetrierHttpError } from 'fetch-retrier';
import { StrictEnvResolver, StrictEnvValidationError } from 'strict-env-resolver';
import { secretFetcher } from '../src';

describe('secretFetcher.getSecretValueValue', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;
  const extensionHttpPortEnv = 'PARAMETERS_SECRETS_EXTENSION_HTTP_PORT';
  const awsSessionTokenEnv = 'AWS_SESSION_TOKEN';

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    delete process.env[extensionHttpPortEnv];
    process.env[awsSessionTokenEnv] = 'test-session-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env[extensionHttpPortEnv];
    delete process.env[awsSessionTokenEnv];
    jest.restoreAllMocks();
  });

  const okSecretResponse = () => ({
    ok: true,
    json: async () => ({
      ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
      Name: 'test-secret',
      SecretString: 'plain-secret-value',
    }),
  });

  test('should return parsed JSON when response is JSON object string', async () => {
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

  test('should return parsed JSON when response is JSON array string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: '["alpha","beta","gamma"]',
      }),
    });

    const result = await secretFetcher.getSecretValue<string[]>('test-secret');
    expect(result).toEqual(['alpha', 'beta', 'gamma']);
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

  test('should return original string when value looks like JSON but fails to parse', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: '{not-valid-json',
      }),
    });

    const result = await secretFetcher.getSecretValue('test-secret');
    expect(result).toBe('{not-valid-json');
  });

  test('should return parsed value when JSON parses to a primitive', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        SecretString: '12345',
      }),
    });

    const result = await secretFetcher.getSecretValue<number>('test-secret');
    expect(result).toBe(12345);
  });

  test('should accept a valid response that includes VersionId', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
        Name: 'test-secret',
        VersionId: 'abc-version',
        SecretString: 'with-version-id',
      }),
    });

    const result = await secretFetcher.getSecretValue('test-secret');
    expect(result).toBe('with-version-id');
  });

  test('should throw on invalid response format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: 'response' }),
    });

    await expect(secretFetcher.getSecretValue('test-secret')).rejects.toThrow('Invalid secret response format');
  });

  test('should throw when response body is null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
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

  describe('AWS_SESSION_TOKEN validation', () => {
    test('should throw when AWS_SESSION_TOKEN is unset', async () => {
      delete process.env[awsSessionTokenEnv];

      await expect(secretFetcher.getSecretValue('test-secret')).rejects.toThrow(
        'AWS_SESSION_TOKEN is not set. This library only works inside an AWS Lambda execution environment',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw when AWS_SESSION_TOKEN is blank', async () => {
      process.env[awsSessionTokenEnv] = '   ';

      await expect(secretFetcher.getSecretValue('test-secret')).rejects.toThrow(
        'AWS_SESSION_TOKEN is not set. This library only works inside an AWS Lambda execution environment',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should rethrow StrictEnvValidationError when AWS_SESSION_TOKEN is not a missing error', async () => {
      const validationError = new StrictEnvValidationError([
        {
          key: 'AWS_SESSION_TOKEN',
          message: 'Env AWS_SESSION_TOKEN: must be one of [expected]',
          kind: 'invalid_enum',
          raw: 'unexpected',
        },
      ]);
      const originalResolve = StrictEnvResolver.resolve;
      jest.spyOn(StrictEnvResolver, 'resolve').mockImplementation((key, spec?, options?) => {
        if (key === 'AWS_SESSION_TOKEN') {
          throw validationError;
        }
        return originalResolve.call(StrictEnvResolver, key, spec, options);
      });

      await expect(secretFetcher.getSecretValue('test-secret')).rejects.toBe(validationError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should rethrow when StrictEnvResolver fails with a non-validation error', async () => {
      const otherError = new Error('unexpected resolver failure');
      const originalResolve = StrictEnvResolver.resolve;
      jest.spyOn(StrictEnvResolver, 'resolve').mockImplementation((key, spec?, options?) => {
        if (key === 'AWS_SESSION_TOKEN') {
          throw otherError;
        }
        return originalResolve.call(StrictEnvResolver, key, spec, options);
      });

      await expect(secretFetcher.getSecretValue('test-secret')).rejects.toBe(otherError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('extension HTTP port resolution', () => {
    const okFetch = () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
          Name: 'test-secret',
          SecretString: 'plain-secret-value',
        }),
      });
    };

    test('should use PARAMETERS_SECRETS_EXTENSION_HTTP_PORT when extensionHttpPort is omitted', async () => {
      process.env[extensionHttpPortEnv] = '8080';
      okFetch();

      await secretFetcher.getSecretValue('test-secret');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/secretsmanager/get?secretId=test-secret',
        expect.any(Object),
      );
    });

    test('should default to port 2773 when extensionHttpPort and env are unset', async () => {
      okFetch();

      await secretFetcher.getSecretValue('test-secret');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:2773/secretsmanager/get?secretId=test-secret',
        expect.any(Object),
      );
    });

    test('should prefer extensionHttpPort option over PARAMETERS_SECRETS_EXTENSION_HTTP_PORT', async () => {
      process.env[extensionHttpPortEnv] = '8080';
      okFetch();

      await secretFetcher.getSecretValue('test-secret', { extensionHttpPort: 9999 });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9999/secretsmanager/get?secretId=test-secret',
        expect.any(Object),
      );
    });

    test('should throw when extension HTTP port is not numeric', async () => {
      await expect(
        secretFetcher.getSecretValue('test-secret', { extensionHttpPort: 'not-a-port' }),
      ).rejects.toThrow('Invalid extension HTTP port: must be a number');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should throw when extension HTTP port is out of range', async () => {
      await expect(
        secretFetcher.getSecretValue('test-secret', { extensionHttpPort: 70000 }),
      ).rejects.toThrow('Invalid extension HTTP port: must be between 1 and 65535');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('retry when the extension returns transient HTTP errors', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should retry on 503 and succeed when the next response is OK', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        })
        .mockResolvedValueOnce(okSecretResponse());

      const pending = secretFetcher.getSecretValue('test-secret', { retries: 2, baseBackoffMs: 10 });
      await jest.runAllTimersAsync();
      await expect(pending).resolves.toBe('plain-secret-value');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should retry on 408 via defaultShouldRetry and succeed when the next response is OK', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          text: async () => 'Request Timeout',
        })
        .mockResolvedValueOnce(okSecretResponse());

      const pending = secretFetcher.getSecretValue('test-secret', { retries: 2, baseBackoffMs: 10 });
      await jest.runAllTimersAsync();
      await expect(pending).resolves.toBe('plain-secret-value');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should retry on 400 when the body indicates the extension is not ready to serve traffic', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Extension not ready to serve traffic',
        })
        .mockResolvedValueOnce(okSecretResponse());

      const pending = secretFetcher.getSecretValue('test-secret', { retries: 2, baseBackoffMs: 10 });
      await jest.runAllTimersAsync();
      await expect(pending).resolves.toBe('plain-secret-value');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  test('should not retry on 404 and reject with FetchRetrierHttpError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const err = await secretFetcher.getSecretValue('test-secret', { retries: 2 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchRetrierHttpError);
    expect(err).toMatchObject({ status: 404 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('errors from fetch-retrier', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should reject with FetchRetrierNetworkError after network failures are exhausted', async () => {
      const networkError = new TypeError('fetch failed');
      mockFetch.mockRejectedValue(networkError);

      const pending = secretFetcher.getSecretValue('test-secret', {
        retries: 2,
        baseBackoffMs: 10,
      });
      const assertion = expect(pending).rejects.toMatchObject({
        name: 'FetchRetrierNetworkError',
        cause: networkError,
      });
      await jest.runAllTimersAsync();
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
