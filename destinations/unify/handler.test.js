const nock = require('nock');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Import dependencies from buildpack
const {
  ValidationError,
  RetryError,
  _,
  fetch,
  URLSearchParams,
} = require('../../buildpack/boreal/window');

// Simulate the buildpack's module loading behavior
function loadHandler() {
  // Create a context with the globals
  const context = vm.createContext({
    ValidationError,
    RetryError,
    _,
    fetch,
    URLSearchParams,
    Date,
    onPage: undefined,
  });

  // Read the handler code
  const handlerCode = fs.readFileSync(
    path.join(__dirname, 'handler.js'),
    'utf8',
  );

  // Wrap the code to capture exports (similar to buildpack)
  const wrappedCode = `
    (function() {
      ${handlerCode}
      return { onPage };
    })()
  `;

  // Execute the code in the context
  const result = vm.runInContext(wrappedCode, context);
  return result;
}

// Load the handler
const handler = loadHandler();

describe('unify handler', () => {
  // Clean up any pending mocks after each test
  afterEach(() => {
    nock.cleanAll();
  });

  describe('onPage', () => {
    const mockEvent = {
      userId: 'user-123',
      anonymousId: 'anon-456',
      context: {
        campaign: {
          name: 'Summer Sale',
          source: 'facebook',
          medium: 'social',
          term: 'discount',
          content: 'banner-ad',
        },
        page: {
          search: 'utm_source=google&utm_medium=cpc&utm_campaign=summer-sale',
        },
        ip: '127.0.0.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    const mockSettings = {
      writeKey: 'test-write-key-123',
    };

    it('should make an identify call when campaign data is present', async () => {
      // Mock the API call
      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.writeKey).toBe('test-write-key-123');
          expect(body.userId).toBe('user-123');
          expect(body.anonymousId).toBe('anon-456');
          expect(body.traits).toEqual({
            lastCampaignName: 'Summer Sale',
            lastCampaignSource: 'facebook',
            lastCampaignMedium: 'social',
            lastCampaignTerm: 'discount',
            lastCampaignContent: 'banner-ad',
            lastIp: '127.0.0.1',
            lastUserAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          });
          return true;
        })
        .reply(200, {
          success: true,
        });

      await handler.onPage(mockEvent, mockSettings);

      // Verify the request was made
      expect(scope.isDone()).toBe(true);
    });

    it('should process Facebook click ID from search parameters', async () => {
      const eventWithFbclid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?fbclid=ABC123XYZ&utm_source=facebook',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastFbclid).toBe('ABC123XYZ');
          expect(body.traits.lastFbc).toMatch(/^fb\.1\.\d+\.ABC123XYZ$/);
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithFbclid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Google Ads click IDs from search parameters', async () => {
      const eventWithGoogleIds = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?gclid=GOOGLE123&gbraid=GB123&wbraid=WB123',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastGclid).toBe('GOOGLE123');
          expect(body.traits.lastGbraid).toBe('GB123');
          expect(body.traits.lastWbraid).toBe('WB123');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithGoogleIds, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Microsoft Ads click ID from search parameters', async () => {
      const eventWithMsclkid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?msclkid=MS123456&utm_source=bing',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastMsclkid).toBe('MS123456');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithMsclkid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Impact click ID from search parameters', async () => {
      const eventWithIrclickid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?irclickid=IMPACT789',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastIrclickid).toBe('IMPACT789');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithIrclickid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process LinkedIn Ads fat ID from search parameters', async () => {
      const eventWithLiFatId = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?li_fat_id=LINKEDIN123',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastLiFatId).toBe('LINKEDIN123');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithLiFatId, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Pinterest Ads click ID from search parameters', async () => {
      const eventWithEpik = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?epik=PINTEREST456',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastEpik).toBe('PINTEREST456');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithEpik, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process TikTok Ads click ID from search parameters', async () => {
      const eventWithTtclid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?ttclid=TIKTOK789',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastTtclid).toBe('TIKTOK789');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithTtclid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Snapchat Ads click ID from search parameters', async () => {
      const eventWithSccid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?sccid=SNAP456',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastSccid).toBe('SNAP456');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithSccid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process Reddit Ads click ID and generate UUID from search parameters', async () => {
      const eventWithRdtCid = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?rdt_cid=REDDIT123',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastRdtCid).toBe('REDDIT123');
          expect(body.traits.lastRdtUuid).toMatch(/^\d+\.anon-456$/);
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithRdtCid, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should process multiple advertising click IDs from search parameters', async () => {
      const eventWithMultipleIds = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search:
              '?fbclid=FB123&gclid=GOOGLE456&msclkid=MS789&li_fat_id=LI123&epik=PINT456&ttclid=TT789&utm_source=multi',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastFbclid).toBe('FB123');
          expect(body.traits.lastFbc).toMatch(/^fb\.1\.\d+\.FB123$/);
          expect(body.traits.lastGclid).toBe('GOOGLE456');
          expect(body.traits.lastGbraid).toBe('');
          expect(body.traits.lastWbraid).toBe('');
          expect(body.traits.lastMsclkid).toBe('MS789');
          expect(body.traits.lastLiFatId).toBe('LI123');
          expect(body.traits.lastEpik).toBe('PINT456');
          expect(body.traits.lastTtclid).toBe('TT789');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithMultipleIds, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should normalize query parameter keys to lowercase', async () => {
      const eventWithMixedCaseParams = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?FBCLID=FB_UPPER&GcLiD=GOOGLE_MIXED&utm_source=test',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits.lastFbclid).toBe('FB_UPPER');
          expect(body.traits.lastGclid).toBe('GOOGLE_MIXED');
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithMixedCaseParams, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should not make an API call when campaign data is empty', async () => {
      const eventWithoutCampaign = {
        ...mockEvent,
        context: {
          campaign: {},
          page: {},
        },
      };

      // No mock needed as no request should be made
      await handler.onPage(eventWithoutCampaign, mockSettings);

      // Verify no pending mocks
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('should not make an API call when campaign is not present', async () => {
      const eventWithoutCampaign = {
        ...mockEvent,
        context: {},
      };

      await handler.onPage(eventWithoutCampaign, mockSettings);

      // Verify no pending mocks
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('should throw ValidationError when writeKey is missing', async () => {
      const settingsWithoutKey = {};

      await expect(
        handler.onPage(mockEvent, settingsWithoutKey),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.onPage(mockEvent, settingsWithoutKey),
      ).rejects.toThrow('Write key is required');
    });

    it('should throw ValidationError when timestamp is missing', async () => {
      const eventWithoutTimestamp = {
        ...mockEvent,
        timestamp: undefined,
      };

      await expect(
        handler.onPage(eventWithoutTimestamp, mockSettings),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.onPage(eventWithoutTimestamp, mockSettings),
      ).rejects.toThrow('Timestamp is missing');
    });

    it('should handle userId being null', async () => {
      const eventWithoutUserId = {
        ...mockEvent,
        userId: null,
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.userId).toBe(null);
          expect(body.anonymousId).toBe('anon-456');
          return true;
        })
        .reply(200, {
          success: true,
        });

      await handler.onPage(eventWithoutUserId, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle anonymousId being null', async () => {
      const eventWithoutAnonymousId = {
        ...mockEvent,
        anonymousId: null,
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.userId).toBe('user-123');
          expect(body.anonymousId).toBe(null);
          return true;
        })
        .reply(200, {
          success: true,
        });

      await handler.onPage(eventWithoutAnonymousId, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should throw RetryError on network failure', async () => {
      nock('https://api.segment.io')
        .post('/v1/identify')
        .replyWithError('Network error');

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 500 response', async () => {
      nock('https://api.segment.io').post('/v1/identify').reply(500, {
        error: 'Internal Server Error',
      });

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 503 response', async () => {
      nock('https://api.segment.io').post('/v1/identify').reply(503, {
        error: 'Service Unavailable',
      });

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 429 rate limit response', async () => {
      nock('https://api.segment.io').post('/v1/identify').reply(429, {
        error: 'Too Many Requests',
      });

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError with correct message on network failure', async () => {
      nock('https://api.segment.io')
        .post('/v1/identify')
        .replyWithError('Network error');

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        'Network error',
      );
    });

    it('should throw RetryError with correct message on 500 response', async () => {
      nock('https://api.segment.io').post('/v1/identify').reply(500, {
        error: 'Internal Server Error',
      });

      await expect(handler.onPage(mockEvent, mockSettings)).rejects.toThrow(
        'Failed with 500',
      );
    });

    it('should not throw on 4xx errors (except 429)', async () => {
      nock('https://api.segment.io').post('/v1/identify').reply(400, {
        error: 'Bad Request',
      });

      // Should not throw
      await handler.onPage(mockEvent, mockSettings);
    });

    it('should flatten nested campaign object correctly', async () => {
      const eventWithCampaign = {
        ...mockEvent,
        context: {
          campaign: {
            name: 'Test Campaign',
            source: 'google',
            medium: 'cpc',
            content: 'text-ad',
            term: 'keywords',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits).toEqual({
            lastCampaignName: 'Test Campaign',
            lastCampaignSource: 'google',
            lastCampaignMedium: 'cpc',
            lastCampaignContent: 'text-ad',
            lastCampaignTerm: 'keywords',
          });
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithCampaign, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should include empty string values in traits', async () => {
      const eventWithEmptyValues = {
        ...mockEvent,
        context: {
          campaign: {
            name: 'Test Campaign',
            source: '',
            medium: 'cpc',
            content: '',
            term: '',
          },
        },
      };

      const scope = nock('https://api.segment.io')
        .post('/v1/identify', (body) => {
          expect(body.traits).toEqual({
            lastCampaignName: 'Test Campaign',
            lastCampaignSource: '',
            lastCampaignMedium: 'cpc',
            lastCampaignContent: '',
            lastCampaignTerm: '',
          });
          return true;
        })
        .reply(200, { success: true });

      await handler.onPage(eventWithEmptyValues, mockSettings);
      expect(scope.isDone()).toBe(true);
    });
  });
});
