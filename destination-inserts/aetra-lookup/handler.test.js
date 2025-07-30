const nock = require('nock');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Import dependencies from buildpack
const {
  ValidationError,
  RetryError,
  EventNotSupported,
  _,
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
    _,
    fetch,
    btoa,
    Date,
    URLSearchParams,
    console,
    onPage: undefined,
    onTrack: undefined,
    onScreen: undefined,
    onIdentify: undefined,
    onGroup: undefined,
    onAlias: undefined,
    onDelete: undefined,
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
      return { onPage, onTrack, onScreen, onIdentify, onGroup, onAlias, onDelete };
    })()
  `;

  // Execute the code in the context
  const result = vm.runInContext(wrappedCode, context);
  return result;
}

// Load the handler
const handler = loadHandler();

describe('aetra event enrichment handler', () => {
  // Clean up any pending mocks after each test
  afterEach(() => {
    nock.cleanAll();
  });

  const mockSettings = {
    writeKey: 'test-write-key-123',
    token: 'test-token-xyz',
  };

  const mockEvent = {
    type: 'track',
    event: 'Product Viewed',
    userId: 'user-123',
    anonymousId: 'anon-456',
    properties: {
      productId: 'SKU123',
      price: 99.99,
    },
    context: {
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      page: {
        search: '?utm_source=google&utm_medium=cpc',
      },
    },
    timestamp: '2024-01-15T10:30:00Z',
  };

  const mockApiResponse = {
    context: {
      ip: '192.168.1.50',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    properties: {
      fbc: 'fb.1.1704067200000.FB123XYZ',
      gclid: 'CjwKCAjw...',
      gbraid: 'GB123',
      wbraid: 'WB123',
      irclickid: 'IR789',
      li_fat_id: 'LI123',
      msclkid: 'MS456',
      epik: 'dj0123456789',
      rdt_cid: 'RDT345',
      rdt_uuid: '1704067200000.anon-456',
      sccid: 'SC012',
      ttclid: 'TT567',
    },
    traits: {
      email: 'user@example.com',
      phone: '+1234567890',
      firstName: 'John',
      lastName: 'Doe',
      address: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'USA',
      },
      gender: 'male',
      birthday: '1990-01-15',
    },
  };

  describe('onTrack', () => {
    it('should enrich track event with Aetra profile data', async () => {
      // Mock Aetra API call
      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .matchHeader('authorization', `Basic ${btoa('test-token-xyz:')}`)
        .matchHeader('x-aetra-version', '2025-01-01')
        .matchHeader('content-type', 'application/json')
        .reply(200, mockApiResponse);

      const result = await handler.onTrack(mockEvent, mockSettings);

      // Verify the API call was made
      expect(scope.isDone()).toBe(true);

      // Verify event enrichment - context from API response overrides event context
      expect(result.context).toEqual({
        ip: '192.168.1.50', // From API response
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', // From API response
        page: {
          search: '?utm_source=google&utm_medium=cpc',
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
          address: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'USA',
          },
          gender: 'male',
          birthday: '1990-01-15',
        },
      });

      expect(result.properties).toEqual({
        productId: 'SKU123',
        price: 99.99,
        fbc: 'fb.1.1704067200000.FB123XYZ',
        gclid: 'CjwKCAjw...',
        gbraid: 'GB123',
        wbraid: 'WB123',
        irclickid: 'IR789',
        li_fat_id: 'LI123',
        msclkid: 'MS456',
        epik: 'dj0123456789',
        rdt_cid: 'RDT345',
        rdt_uuid: '1704067200000.anon-456',
        sccid: 'SC012',
        ttclid: 'TT567',
      });
    });

    it('should use anonymousId when userId is not present', async () => {
      const eventWithoutUserId = {
        ...mockEvent,
        userId: null,
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/anonymous_id:anon-456')
        .matchHeader('authorization', `Basic ${btoa('test-token-xyz:')}`)
        .reply(200, mockApiResponse);

      await handler.onTrack(eventWithoutUserId, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should return event unchanged when profile not found (404)', async () => {
      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(404, {
          error: 'Profile not found',
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Event should be unchanged
      expect(result).toEqual(mockEvent);
    });

    it('should return event unchanged when writeKey is missing', async () => {
      const settingsWithoutWriteKey = {
        token: 'test-token',
      };

      const result = await handler.onTrack(mockEvent, settingsWithoutWriteKey);

      // Event should be returned unchanged
      expect(result).toEqual(mockEvent);
    });

    it('should return event unchanged when token is missing', async () => {
      const settingsWithoutToken = {
        writeKey: 'test-write-key',
      };

      const result = await handler.onTrack(mockEvent, settingsWithoutToken);

      // Event should be returned unchanged
      expect(result).toEqual(mockEvent);
    });

    it('should throw ValidationError when both userId and anonymousId are missing', async () => {
      const eventWithoutIds = {
        ...mockEvent,
        userId: null,
        anonymousId: null,
      };

      await expect(
        handler.onTrack(eventWithoutIds, mockSettings),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.onTrack(eventWithoutIds, mockSettings),
      ).rejects.toThrow('User ID or Anonymous ID is required');
    });

    it('should return event unchanged on network failure', async () => {
      nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .replyWithError('Network error');

      const result = await handler.onTrack(mockEvent, mockSettings);

      // Event should be returned unchanged on network error
      expect(result).toEqual(mockEvent);
    });

    it('should throw RetryError on 500 response', async () => {
      nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(500, {
          error: 'Internal Server Error',
        });

      await expect(handler.onTrack(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 429 rate limit response', async () => {
      nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(429, {
          error: 'Too Many Requests',
        });

      await expect(handler.onTrack(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should return event unchanged on other non-2xx status codes', async () => {
      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(400, {
          error: 'Bad Request',
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Event should be returned without modification
      expect(result).toEqual(mockEvent);
    });

    it('should handle empty profile response', async () => {
      const emptyApiResponse = {
        context: {},
        properties: {},
        traits: {},
      };

      const cleanTestEvent = {
        type: 'track',
        event: 'Product Viewed',
        userId: 'user-123',
        anonymousId: 'anon-456',
        properties: {
          productId: 'SKU123',
          price: 99.99,
        },
        context: {
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
        },
        timestamp: '2024-01-15T10:30:00Z',
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, emptyApiResponse);

      const result = await handler.onTrack(cleanTestEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits).toEqual({});
      expect(result.properties).toEqual({
        productId: 'SKU123',
        price: 99.99,
      });
    });
  });

  describe('onPage', () => {
    const pageEvent = {
      type: 'page',
      name: 'Home',
      userId: 'user-123',
      anonymousId: 'anon-456',
      properties: {
        path: '/',
        title: 'Home Page',
      },
      context: {
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        page: {
          search:
            '?fbclid=NEW_FBCLID_123&gclid=NEW_GCLID_456&li_fat_id=NEW_LIFAT_789',
        },
      },
      timestamp: '2024-01-15T10:30:00Z',
    };

    it('should generate fbc from URL fbclid when fbc exists in profile', async () => {
      const profileWithFbc = {
        context: {},
        properties: {
          fbc: 'existing_fbc_value', // This exists in profile
        },
        traits: {},
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithFbc);

      const result = await handler.onPage(pageEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Should update fbc with URL fbclid since fbc exists in profile
      expect(result.properties.fbc).toMatch(/^fb\.1\.\d+\.NEW_FBCLID_123$/);
    });

    it('should extract URL parameters only when they exist in profile properties', async () => {
      const pageEventWithMultipleParams = {
        ...pageEvent,
        context: {
          ...pageEvent.context,
          page: {
            search:
              '?fbclid=URL_FBCLID&gclid=URL_GCLID&gbraid=URL_GBRAID&wbraid=URL_WBRAID&irclickid=URL_IRCLICKID&li_fat_id=URL_LIFAT&msclkid=URL_MSCLKID&epik=URL_EPIK&rdt_cid=URL_RDTCID&sccid=URL_SCCID&ttclid=URL_TTCLID',
          },
        },
      };

      const profileWithSomeParams = {
        context: {},
        properties: {
          fbc: 'existing_fbc',
          gclid: 'existing_gclid',
          msclkid: 'existing_msclkid',
          // Other params are not in profile, so URL values should not be used
        },
        traits: {},
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithSomeParams);

      const result = await handler.onPage(
        pageEventWithMultipleParams,
        mockSettings,
      );

      expect(scope.isDone()).toBe(true);
      // Should only update properties that exist in profile
      expect(result.properties.fbc).toMatch(/^fb\.1\.\d+\.URL_FBCLID$/);
      expect(result.properties.gclid).toBe('URL_GCLID');
      expect(result.properties.msclkid).toBe('URL_MSCLKID');
      // Properties not in profile should not be set from URL
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBeUndefined();
      expect(result.properties.irclickid).toBeUndefined();
    });

    it('should handle page event without search parameters', async () => {
      const pageEventNoSearch = {
        ...pageEvent,
        context: {
          ...pageEvent.context,
          page: {},
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, mockApiResponse);

      const result = await handler.onPage(pageEventNoSearch, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.fbc).toBe('fb.1.1704067200000.FB123XYZ');
    });

    it('should generate rdt_uuid when rdt_cid is in URL and profile', async () => {
      const pageEventWithRdtCid = {
        ...pageEvent,
        context: {
          ...pageEvent.context,
          page: {
            search: '?rdt_cid=TEST_RDT_CID',
          },
        },
      };

      const profileWithRdtCid = {
        context: {},
        properties: {
          rdt_cid: 'existing_rdt_cid',
        },
        traits: {},
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithRdtCid);

      const result = await handler.onPage(pageEventWithRdtCid, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.rdt_cid).toBe('TEST_RDT_CID');
      expect(result.properties.rdt_uuid).toMatch(/^\d+\.anon-456$/);
    });

    it('should handle case-insensitive URL parameters', async () => {
      const pageEventWithMixedCase = {
        ...pageEvent,
        context: {
          ...pageEvent.context,
          page: {
            search: '?GCLID=UPPER_GCLID&FbClId=MIXED_FBCLID',
          },
        },
      };

      const profileWithParams = {
        context: {},
        properties: {
          gclid: 'existing_gclid',
          fbc: 'existing_fbc',
        },
        traits: {},
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithParams);

      const result = await handler.onPage(pageEventWithMixedCase, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBe('UPPER_GCLID');
      expect(result.properties.fbc).toMatch(/^fb\.1\.\d+\.MIXED_FBCLID$/);
    });
  });

  describe('onScreen', () => {
    const screenEvent = {
      type: 'screen',
      name: 'Home Screen',
      userId: 'user-123',
      anonymousId: 'anon-456',
      properties: {
        screenClass: 'HomeViewController',
      },
      context: {
        ip: '192.168.1.100',
        userAgent: 'MobileApp/1.0',
      },
      timestamp: '2024-01-15T10:30:00Z',
    };

    it('should enrich screen event with Aetra profile data', async () => {
      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, mockApiResponse);

      const result = await handler.onScreen(screenEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits).toEqual(mockApiResponse.traits);
      expect(result.properties).toEqual({
        screenClass: 'HomeViewController',
        ...mockApiResponse.properties,
      });
    });
  });

  describe('Google Ads destination logic', () => {
    const mockSettingsWithGoogleAds = {
      ...mockSettings,
      googleAds: true,
    };

    // Clean event without interfering properties
    const cleanEvent = {
      type: 'track',
      event: 'Product Viewed',
      userId: 'user-123',
      anonymousId: 'anon-456',
      properties: {
        productId: 'SKU123',
        price: 99.99,
      },
      context: {
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      },
      timestamp: '2024-01-15T10:30:00Z',
    };

    it('should prioritize gclid and remove gbraid/wbraid when gclid exists', async () => {
      const profileWithAllGoogleIds = {
        context: {},
        properties: {
          gclid: 'CjwKCAjw_gclid_123',
          gbraid: 'GB_should_be_removed',
          wbraid: 'WB_should_be_removed',
          // No other properties from mockApiResponse
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
          firstName: 'John',
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithAllGoogleIds);

      // Create a fresh copy to avoid mutation
      const freshEvent0 = JSON.parse(JSON.stringify(cleanEvent));
      const result = await handler.onTrack(
        freshEvent0,
        mockSettingsWithGoogleAds,
      );

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBe('CjwKCAjw_gclid_123');
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBeUndefined();
      // Email and phone should remain when gclid exists
      expect(result.context.traits.email).toBe('user@example.com');
      expect(result.context.traits.phone).toBe('+1234567890');
    });

    it('should prioritize gbraid and remove wbraid/email/phone when gbraid exists but gclid does not', async () => {
      const profileWithGbraidOnly = {
        context: {},
        properties: {
          gbraid: 'GB_priority_123',
          wbraid: 'WB_should_be_removed',
          // No gclid property
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithGbraidOnly);

      // Create a fresh copy to avoid mutation
      const freshEvent = JSON.parse(JSON.stringify(cleanEvent));
      const result = await handler.onTrack(
        freshEvent,
        mockSettingsWithGoogleAds,
      );

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBe('GB_priority_123');
      expect(result.properties.wbraid).toBeUndefined();
      // Email and phone should be removed when gbraid exists
      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
      // Other traits should remain
      expect(result.context.traits.firstName).toBe('John');
      expect(result.context.traits.lastName).toBe('Doe');
    });

    it('should remove email/phone when only wbraid exists', async () => {
      const profileWithWbraidOnly = {
        context: {},
        properties: {
          wbraid: 'WB_only_123',
          // No gclid or gbraid properties
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithWbraidOnly);

      // Create a fresh copy to avoid mutation
      const freshEvent2 = JSON.parse(JSON.stringify(cleanEvent));
      const result = await handler.onTrack(
        freshEvent2,
        mockSettingsWithGoogleAds,
      );

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBe('WB_only_123');
      // Email and phone should be removed when only wbraid exists
      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
      // Other traits should remain
      expect(result.context.traits.firstName).toBe('John');
      expect(result.context.traits.lastName).toBe('Doe');
    });

    it('should not apply Google Ads logic when googleAds setting is false or undefined', async () => {
      const profileWithAllGoogleIds = {
        context: {},
        properties: {
          gclid: 'CjwKCAjw_gclid_123',
          gbraid: 'GB_should_remain',
          wbraid: 'WB_should_remain',
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithAllGoogleIds);

      // Use regular settings without googleAds flag
      const result = await handler.onTrack(cleanEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBe('CjwKCAjw_gclid_123');
      expect(result.properties.gbraid).toBe('GB_should_remain');
      expect(result.properties.wbraid).toBe('WB_should_remain');
      // Email and phone should remain when googleAds setting is false
      expect(result.context.traits.email).toBe('user@example.com');
      expect(result.context.traits.phone).toBe('+1234567890');
    });

    it('should work with page events and URL parameter extraction combined with Google Ads logic', async () => {
      const pageEventWithGclid = {
        type: 'page',
        name: 'Landing',
        userId: 'user-123',
        anonymousId: 'anon-456',
        properties: {
          path: '/landing',
        },
        context: {
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          page: {
            search: '?gclid=URL_GCLID_123&gbraid=URL_GBRAID_456',
          },
        },
        timestamp: '2024-01-15T10:30:00Z',
      };

      const profileWithGoogleAdsParams = {
        context: {},
        properties: {
          gclid: 'existing_gclid', // Exists in profile so URL will be used
          gbraid: 'existing_gbraid', // Exists in profile so URL will be used
        },
        traits: {
          email: 'user@example.com',
          phone: '+1234567890',
        },
      };

      const scope = nock('https://api.aetra.app')
        .get('/profile/test-write-key-123/user_id:user-123')
        .reply(200, profileWithGoogleAdsParams);

      const result = await handler.onPage(
        pageEventWithGclid,
        mockSettingsWithGoogleAds,
      );

      expect(scope.isDone()).toBe(true);
      // URL parameters should be extracted first
      expect(result.properties.gclid).toBe('URL_GCLID_123');
      // Then Google Ads logic should remove gbraid since gclid exists
      expect(result.properties.gbraid).toBeUndefined();
      // Email and phone should remain since gclid exists
      expect(result.context.traits.email).toBe('user@example.com');
      expect(result.context.traits.phone).toBe('+1234567890');
    });
  });

  describe('unsupported events', () => {
    it('should throw EventNotSupported for identify events', () => {
      const identifyEvent = {
        type: 'identify',
        userId: 'user-123',
        traits: {
          email: 'test@example.com',
        },
      };

      expect(() => handler.onIdentify(identifyEvent, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onIdentify(identifyEvent, mockSettings)).toThrow(
        'identify is not supported',
      );
    });

    it('should throw EventNotSupported for group events', () => {
      const groupEvent = {
        type: 'group',
        groupId: 'company-123',
        traits: {
          name: 'Acme Inc',
        },
      };

      expect(() => handler.onGroup(groupEvent, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onGroup(groupEvent, mockSettings)).toThrow(
        'group is not supported',
      );
    });

    it('should throw EventNotSupported for alias events', () => {
      const aliasEvent = {
        type: 'alias',
        userId: 'user-123',
        previousId: 'old-user-123',
      };

      expect(() => handler.onAlias(aliasEvent, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onAlias(aliasEvent, mockSettings)).toThrow(
        'alias is not supported',
      );
    });

    it('should throw EventNotSupported for delete events', () => {
      const deleteEvent = {
        type: 'delete',
        userId: 'user-123',
      };

      expect(() => handler.onDelete(deleteEvent, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onDelete(deleteEvent, mockSettings)).toThrow(
        'delete is not supported',
      );
    });
  });
});
