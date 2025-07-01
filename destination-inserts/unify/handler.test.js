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

describe('unify event enrichment handler', () => {
  // Clean up any pending mocks after each test
  afterEach(() => {
    nock.cleanAll();
  });

  const mockSettings = {
    spaceId: 'test-space-123',
    spaceToken: 'test-token-xyz',
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

  const mockProfileTraits = {
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
    lastCampaignName: 'Summer Sale',
    lastCampaignSource: 'facebook',
    lastCampaignMedium: 'social',
    lastCampaignContent: 'banner',
    lastCampaignTerm: 'discount',
    lastCampaignFbclid: 'FB123XYZ',
    lastCampaignFbc: 'fb.1.1704067200000.FB123XYZ',
    lastCampaignGclid: 'CjwKCAjw...',
    lastCampaignGbraid: 'GB123',
    lastCampaignWbraid: 'WB123',
    lastCampaignMsclkid: 'MS456',
    lastCampaignIrclickid: 'IR789',
    lastCampaignLiFatId: 'LI123',
    lastCampaignEpik: 'dj0123456789',
    lastCampaignRdtCid: 'RDT345',
    lastCampaignRdtUuid: '1704067200000.anon-456',
    lastCampaignSccid: 'SC012',
    lastCampaignTtclid: 'TT567',
    lastIp: '192.168.1.50',
    lastUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  };

  describe('onTrack', () => {
    it('should enrich track event with user profile data including all ad tracking parameters', async () => {
      // Mock Profiles API call
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query({
          limit: 100,
          include:
            'lastCampaignName,lastCampaignSource,lastCampaignMedium,lastCampaignContent,lastCampaignTerm,lastCampaignFbclid,lastCampaignFbc,lastCampaignGclid,lastCampaignGbraid,lastCampaignWbraid,lastCampaignIrclickid,lastCampaignLiFatId,lastCampaignMsclkid,lastCampaignEpik,lastCampaignRdtCid,lastCampaignRdtUuid,lastCampaignSccid,lastCampaignTtclid,lastIp,lastUserAgent,email,phone,firstName,lastName,address,gender,birthday',
        })
        .matchHeader('authorization', `Basic ${btoa('test-token-xyz:')}`)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      // Verify the API call was made
      expect(scope.isDone()).toBe(true);

      // Verify event enrichment with updated address structure
      expect(result.context.traits).toEqual({
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
      });

      // Verify all ad tracking parameters are included
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

      expect(result.context.ip).toBe('192.168.1.100');
      expect(result.context.userAgent).toBe(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      );
    });

    it('should use anonymousId when userId is not present', async () => {
      const eventWithoutUserId = {
        ...mockEvent,
        userId: null,
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/anonymous_id:anon-456/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      await handler.onTrack(eventWithoutUserId, mockSettings);
      expect(scope.isDone()).toBe(true);
    });

    it('should return event unchanged when profile not found', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(404, {
          error: 'Profile not found',
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Event should be unchanged
      expect(result).toEqual(mockEvent);
    });

    it('should use lastIp when current IP is not present', async () => {
      const eventWithoutIp = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          ip: undefined,
        },
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onTrack(eventWithoutIp, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.ip).toBe('192.168.1.50'); // Should use lastIp from profile
    });

    it('should use lastUserAgent when current userAgent is not present', async () => {
      const eventWithoutUserAgent = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          userAgent: undefined,
        },
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onTrack(eventWithoutUserAgent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.userAgent).toBe(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ); // Should use lastUserAgent
    });

    it('should include all ad tracking parameters from profile', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: {
            ...mockProfileTraits,
            lastCampaignGclid: 'GCLID123',
            lastCampaignGbraid: 'GBRAID456',
            lastCampaignWbraid: 'WBRAID789',
            lastCampaignLiFatId: 'LIFAT123',
            lastCampaignEpik: 'EPIK456',
            lastCampaignTtclid: 'TTCLID789',
          },
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.gclid).toBe('GCLID123');
      expect(result.properties.gbraid).toBe('GBRAID456');
      expect(result.properties.wbraid).toBe('WBRAID789');
      expect(result.properties.li_fat_id).toBe('LIFAT123');
      expect(result.properties.epik).toBe('EPIK456');
      expect(result.properties.ttclid).toBe('TTCLID789');
    });

    it('should throw ValidationError when spaceId is missing', async () => {
      const settingsWithoutSpaceId = {
        spaceToken: 'test-token',
      };

      await expect(
        handler.onTrack(mockEvent, settingsWithoutSpaceId),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.onTrack(mockEvent, settingsWithoutSpaceId),
      ).rejects.toThrow('Space ID and Space Token are required');
    });

    it('should throw ValidationError when spaceToken is missing', async () => {
      const settingsWithoutToken = {
        spaceId: 'test-space',
      };

      await expect(
        handler.onTrack(mockEvent, settingsWithoutToken),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.onTrack(mockEvent, settingsWithoutToken),
      ).rejects.toThrow('Space ID and Space Token are required');
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

    it('should throw RetryError on network failure', async () => {
      nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .replyWithError('Network error');

      await expect(handler.onTrack(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 500 response', async () => {
      nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(500, {
          error: 'Internal Server Error',
        });

      await expect(handler.onTrack(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should throw RetryError on 429 rate limit response', async () => {
      nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(429, {
          error: 'Too Many Requests',
        });

      await expect(handler.onTrack(mockEvent, mockSettings)).rejects.toThrow(
        RetryError,
      );
    });

    it('should handle empty profile traits with updated address structure', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: {},
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits).toEqual({
        email: undefined,
        phone: undefined,
        firstName: undefined,
        lastName: undefined,
        address: {
          street: undefined,
          city: undefined,
          state: undefined,
          postalCode: undefined,
          country: undefined,
        },
        gender: undefined,
        birthday: undefined,
      });

      // Verify all ad tracking parameters are undefined when not in profile
      expect(result.properties).toEqual({
        productId: 'SKU123',
        price: 99.99,
        fbc: undefined,
        gclid: undefined,
        gbraid: undefined,
        wbraid: undefined,
        irclickid: undefined,
        li_fat_id: undefined,
        msclkid: undefined,
        epik: undefined,
        rdt_cid: undefined,
        rdt_uuid: undefined,
        sccid: undefined,
        ttclid: undefined,
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

    it('should generate fbc when fbclid is present and fbc is not in profile', async () => {
      const profileWithoutFbc = {
        ...mockProfileTraits,
        lastCampaignFbc: undefined,
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: profileWithoutFbc,
        });

      const result = await handler.onPage(pageEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.fbc).toMatch(/^fb\.1\.\d+\.NEW_FBCLID_123$/);
    });

    it('should extract all URL parameters for page events when not in profile', async () => {
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

      const profileWithoutParams = {
        ...mockProfileTraits,
        lastCampaignFbc: undefined,
        lastCampaignGclid: undefined,
        lastCampaignGbraid: undefined,
        lastCampaignWbraid: undefined,
        lastCampaignIrclickid: undefined,
        lastCampaignLiFatId: undefined,
        lastCampaignMsclkid: undefined,
        lastCampaignEpik: undefined,
        lastCampaignRdtCid: undefined,
        lastCampaignSccid: undefined,
        lastCampaignTtclid: undefined,
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: profileWithoutParams,
        });

      const result = await handler.onPage(
        pageEventWithMultipleParams,
        mockSettings,
      );

      expect(scope.isDone()).toBe(true);
      expect(result.properties.fbc).toMatch(/^fb\.1\.\d+\.URL_FBCLID$/);
      expect(result.properties.gclid).toBe('URL_GCLID');
      expect(result.properties.gbraid).toBe('URL_GBRAID');
      expect(result.properties.wbraid).toBe('URL_WBRAID');
      expect(result.properties.irclickid).toBe('URL_IRCLICKID');
      expect(result.properties.li_fat_id).toBe('URL_LIFAT');
      expect(result.properties.msclkid).toBe('URL_MSCLKID');
      expect(result.properties.epik).toBe('URL_EPIK');
      expect(result.properties.rdt_cid).toBe('URL_RDTCID');
      expect(result.properties.rdt_uuid).toMatch(/^\d+\.anon-456$/);
      expect(result.properties.sccid).toBe('URL_SCCID');
      expect(result.properties.ttclid).toBe('URL_TTCLID');
    });

    it('should not override existing profile parameters with URL parameters', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onPage(pageEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Should use existing values from profile, not URL
      expect(result.properties.fbc).toBe('fb.1.1704067200000.FB123XYZ');
      expect(result.properties.gclid).toBe('CjwKCAjw...');
      expect(result.properties.li_fat_id).toBe('LI123');
    });

    it('should handle page event without search parameters', async () => {
      const pageEventNoSearch = {
        ...pageEvent,
        context: {
          ...pageEvent.context,
          page: {},
        },
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onPage(pageEventNoSearch, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.fbc).toBe('fb.1.1704067200000.FB123XYZ');
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

    it('should enrich screen event with user profile data', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: mockProfileTraits,
        });

      const result = await handler.onScreen(screenEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits).toEqual({
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
      });
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

  describe('edge cases', () => {
    it('should handle empty profile traits', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: {},
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits).toEqual({
        email: undefined,
        phone: undefined,
        firstName: undefined,
        lastName: undefined,
        address: {
          street: undefined,
          city: undefined,
          state: undefined,
          postalCode: undefined,
          country: undefined,
        },
        gender: undefined,
        birthday: undefined,
      });
    });

    it('should handle partial address data', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: {
            address: {
              city: 'San Francisco',
              // street, state, postalCode, country are missing
            },
          },
        });

      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.context.traits.address).toEqual({
        street: undefined,
        city: 'San Francisco',
        state: undefined,
        postalCode: undefined,
        country: undefined,
      });
    });

    it('should handle 4xx errors other than 404', async () => {
      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(400, {
          error: 'Bad Request',
        });

      // Should not throw, but should log error
      const result = await handler.onTrack(mockEvent, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Event should be returned without modification
      expect(result).toEqual(mockEvent);
    });

    it('should handle Reddit ads rdt_cid parameter and generate rdt_uuid', async () => {
      const pageEventWithRdtCid = {
        type: 'page',
        name: 'Home',
        userId: 'user-123',
        anonymousId: 'anon-456',
        properties: {
          path: '/',
        },
        context: {
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          page: {
            search: '?rdt_cid=TEST_RDT_CID',
          },
        },
        timestamp: '2024-01-15T10:30:00Z',
      };

      const profileWithoutRdt = {
        ...mockProfileTraits,
        lastCampaignRdtCid: undefined,
        lastCampaignRdtUuid: undefined,
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: profileWithoutRdt,
        });

      const result = await handler.onPage(pageEventWithRdtCid, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.rdt_cid).toBe('TEST_RDT_CID');
      expect(result.properties.rdt_uuid).toMatch(/^\d+\.anon-456$/);
    });

    it('should handle all new ad platform parameters from URL', async () => {
      const pageEventWithAllParams = {
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
            search:
              '?irclickid=IMPACT123&li_fat_id=LINKEDIN456&msclkid=MICROSOFT789&epik=PINTEREST012&sccid=SNAPCHAT345&ttclid=TIKTOK678',
          },
        },
        timestamp: '2024-01-15T10:30:00Z',
      };

      const emptyProfile = {
        email: undefined,
        phone: undefined,
        firstName: undefined,
        lastName: undefined,
        address: {},
        gender: undefined,
        birthday: undefined,
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: emptyProfile,
        });

      const result = await handler.onPage(pageEventWithAllParams, mockSettings);

      expect(scope.isDone()).toBe(true);
      expect(result.properties.irclickid).toBe('IMPACT123');
      expect(result.properties.li_fat_id).toBe('LINKEDIN456');
      expect(result.properties.msclkid).toBe('MICROSOFT789');
      expect(result.properties.epik).toBe('PINTEREST012');
      expect(result.properties.sccid).toBe('SNAPCHAT345');
      expect(result.properties.ttclid).toBe('TIKTOK678');
    });

    it('should not extract URL parameters for non-page events', async () => {
      const trackEventWithParams = {
        ...mockEvent,
        context: {
          ...mockEvent.context,
          page: {
            search: '?gclid=SHOULD_NOT_BE_USED&li_fat_id=ALSO_IGNORED',
          },
        },
      };

      const scope = nock('https://profiles.segment.com')
        .get(
          '/v1/spaces/test-space-123/collections/users/profiles/user_id:user-123/traits',
        )
        .query(true)
        .reply(200, {
          traits: {
            lastCampaignGclid: 'PROFILE_GCLID',
            lastCampaignLiFatId: 'PROFILE_LIFAT',
          },
        });

      const result = await handler.onTrack(trackEventWithParams, mockSettings);

      expect(scope.isDone()).toBe(true);
      // Should only use values from profile, not URL params for track events
      expect(result.properties.gclid).toBe('PROFILE_GCLID');
      expect(result.properties.li_fat_id).toBe('PROFILE_LIFAT');
    });
  });
});
