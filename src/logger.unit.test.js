const loggerModule = require('./logger');

const { LokiLogger } = loggerModule;

const enabledConfig = {
  endpointUrl: 'https://example.com/logs',
  accountId: 'test-account',
  apiKey: 'test-key',
  source: 'unit-test',
};

describe('LokiLogger utility coverage', () => {
  let warnSpy;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('maps status codes to expected log levels', () => {
    const logger = new LokiLogger(enabledConfig);
    expect(logger.statusToLogLevel(503)).toBe('error');
    expect(logger.statusToLogLevel(404)).toBe('warn');
    expect(logger.statusToLogLevel(201)).toBe('info');
    expect(logger.statusToLogLevel(NaN)).toBe('info');
  });

  test('only warns once when logging is disabled', () => {
    const logger = new LokiLogger({});
    const warnCallsAfterConstructor = warnSpy.mock.calls.length;
    const sendSpy = jest.spyOn(logger, 'sendLogToGrafana');

    logger.log('info', 'test');
    logger.log('info', 'test');

    expect(warnSpy.mock.calls.length).toBe(warnCallsAfterConstructor + 1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('merges metadata, masks secrets, and posts to Grafana', () => {
    const logger = new LokiLogger(enabledConfig);
    logger.sendLogToGrafana = jest.fn().mockResolvedValue();

    logger.log(
      'info',
      'custom',
      { password: 'super-secret', data: { nestedPassword: 'abc123' } },
      {
        user_id: 42,
        trace_id: '',
      }
    );

    expect(logger.sendLogToGrafana).toHaveBeenCalledTimes(1);
    const payload = logger.sendLogToGrafana.mock.calls[0][0];
    const serialized = payload.streams[0].values[0][1];
    const parsed = JSON.parse(serialized);

    expect(parsed.password).toBe('*****');
    expect(parsed.data.nestedPassword).toBe('*****');
    expect(parsed.user_id).toBe(42);
    expect(parsed.trace_id).toBe('');
  });

  test('serialize handles Buffers and Errors', () => {
    const logger = new LokiLogger({});
    const bufferResult = logger.serialize(Buffer.from('hello'));
    expect(bufferResult).toBe('hello');

    const error = new Error('boom');
    const serializedError = logger.serialize(error);
    expect(serializedError).toContain('boom');
  });

  test('sanitize masks raw JSON strings with password fields', () => {
    const logger = new LokiLogger(enabledConfig);
    const sanitized = logger.sanitize('{"password":"secret","other":"value"}');
    expect(sanitized).not.toContain('secret');
    expect(sanitized).toContain('*****');
  });
});
