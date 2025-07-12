const nock = require('nock');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Import dependencies from buildpack (simulate)
const {
  ValidationError,
  RetryError,
  EventNotSupported,
  fetch,
  btoa,
} = require('../../buildpack/boreal/window');

// Simulate the buildpack's module loading behavior
function loadHandler() {
  // Create a context with the globals
  const context = vm.createContext({
    ValidationError,
    RetryError,
    EventNotSupported,
    fetch,
    btoa,
    Date,
    console,
    onTrack: undefined,
    onIdentify: undefined,
    onGroup: undefined,
    onPage: undefined,
    onScreen: undefined,
    onAlias: undefined,
    onDelete: undefined,
  });

  // Read the handler code
  const handlerCode = fs.readFileSync(
    path.join(__dirname, 'handler.js'),
    'utf8',
  );

  // Wrap the code to capture exports
  const wrappedCode = `
    (function() {
      ${handlerCode}
      return { onTrack, onIdentify, onGroup, onPage, onScreen, onAlias, onDelete };
    })()
  `;

  // Execute the code in the context
  const result = vm.runInContext(wrappedCode, context);
  return result;
}

// Load the handler
const handler = loadHandler();

describe('Aetra Enrichment Handler', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const settings = {
    writeKey: 'testWriteKey',
    token: 'testToken',
  };

  const sampleEvent = {
    type: 'track',
    event: 'Test Event',
    userId: 'user123',
  };

  const enrichedEvent = { ...sampleEvent, enriched: true };

  it('should enrich track event successfully', async () => {
    const scope = nock('https://api.aetra.com')
      .post(`/profile/${settings.writeKey}/enrich`)
      .matchHeader('authorization', `Basic ${btoa(`${settings.token}:`)}`)
      .matchHeader('x-aetra-version', '2025-01-01')
      .matchHeader('content-type', 'application/json')
      .reply(200, enrichedEvent);

    const result = await handler.onTrack(sampleEvent, settings);
    expect(result).toEqual(enrichedEvent);
    expect(scope.isDone()).toBe(true);
  });

  it('should return original event on network error', async () => {
    const scope = nock('https://api.aetra.com')
      .post(`/profile/${settings.writeKey}/enrich`)
      .replyWithError('Network error');

    const result = await handler.onTrack(sampleEvent, settings);
    expect(result).toEqual(sampleEvent);
    expect(scope.isDone()).toBe(true);
  });

  it('should throw RetryError on server error (500)', async () => {
    const scope = nock('https://api.aetra.com')
      .post(`/profile/${settings.writeKey}/enrich`)
      .reply(500, { error: 'Internal Server Error' });

    await expect(handler.onTrack(sampleEvent, settings)).rejects.toThrow(
      RetryError,
    );
    expect(scope.isDone()).toBe(true);
  });

  it('should throw RetryError on rate limit (429)', async () => {
    const scope = nock('https://api.aetra.com')
      .post(`/profile/${settings.writeKey}/enrich`)
      .reply(429, { error: 'Too Many Requests' });

    await expect(handler.onTrack(sampleEvent, settings)).rejects.toThrow(
      RetryError,
    );
    expect(scope.isDone()).toBe(true);
  });

  it('should enrich identify event', async () => {
    const identifyEvent = { ...sampleEvent, type: 'identify' };
    const scope = nock('https://api.aetra.com')
      .post(`/profile/${settings.writeKey}/enrich`)
      .reply(200, enrichedEvent);

    const result = await handler.onIdentify(identifyEvent, settings);
    expect(result).toEqual(enrichedEvent);
    expect(scope.isDone()).toBe(true);
  });

  // Similar tests for group, page, screen...

  it('should throw EventNotSupported for alias', () => {
    expect(() => handler.onAlias(sampleEvent, settings)).toThrow(
      EventNotSupported,
    );
  });

  it('should throw EventNotSupported for delete', () => {
    expect(() => handler.onDelete(sampleEvent, settings)).toThrow(
      EventNotSupported,
    );
  });

  // Add validation tests (requires adding validation to handler)
  it('should return original event when writeKey is missing', async () => {
    const invalidSettings = { token: 'testToken' };
    const result = await handler.onTrack(sampleEvent, invalidSettings);
    expect(result).toEqual(sampleEvent);
  });

  it('should return original event when token is missing', async () => {
    const invalidSettings = { writeKey: 'testWriteKey' };
    const result = await handler.onTrack(sampleEvent, invalidSettings);
    expect(result).toEqual(sampleEvent);
  });
});
