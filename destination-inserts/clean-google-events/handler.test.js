const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Import dependencies from buildpack
const { EventNotSupported } = require('../../buildpack/boreal/window');

// Simulate the buildpack's module loading behavior
function loadHandler() {
  // Create a context with the globals
  const context = vm.createContext({
    EventNotSupported,
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

describe('clean Google events handler', () => {
  const mockSettings = {};

  describe('Google click ID prioritization', () => {
    it('should keep gclid and remove gbraid/wbraid when all three are present', async () => {
      const event = {
        properties: {
          gclid: 'gclid_123',
          gbraid: 'gbraid_456',
          wbraid: 'wbraid_789',
          other_prop: 'keep_this',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBe('gclid_123');
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBeUndefined();
      expect(result.properties.other_prop).toBe('keep_this');
      // Email/phone should remain since gclid is present
      expect(result.context.traits.email).toBe('user@example.com');
      expect(result.context.traits.phone).toBe('+1234567890');
    });

    it('should keep gbraid and remove wbraid when gclid is not present', async () => {
      const event = {
        properties: {
          gbraid: 'gbraid_456',
          wbraid: 'wbraid_789',
          other_prop: 'keep_this',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBe('gbraid_456');
      expect(result.properties.wbraid).toBeUndefined();
      expect(result.properties.other_prop).toBe('keep_this');
      // Email/phone should be removed since gbraid is present
      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
    });

    it('should keep wbraid when gclid and gbraid are not present', async () => {
      const event = {
        properties: {
          wbraid: 'wbraid_789',
          other_prop: 'keep_this',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBe('wbraid_789');
      expect(result.properties.other_prop).toBe('keep_this');
      // Email/phone should be removed since wbraid is present
      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
    });

    it('should not modify properties when no Google click IDs are present', async () => {
      const event = {
        properties: {
          other_prop: 'keep_this',
          another_prop: 'keep_this_too',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.properties.wbraid).toBeUndefined();
      expect(result.properties.other_prop).toBe('keep_this');
      expect(result.properties.another_prop).toBe('keep_this_too');
      // Email/phone should remain since no gbraid/wbraid
      expect(result.context.traits.email).toBe('user@example.com');
      expect(result.context.traits.phone).toBe('+1234567890');
    });
  });

  describe('PII removal with gbraid/wbraid', () => {
    it('should remove email and phone when gbraid is present', async () => {
      const event = {
        properties: {
          gbraid: 'gbraid_456',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
      expect(result.context.traits.firstName).toBe('John');
      expect(result.context.traits.lastName).toBe('Doe');
    });

    it('should remove email and phone when wbraid is present', async () => {
      const event = {
        properties: {
          wbraid: 'wbraid_789',
        },
        context: {
          traits: {
            email: 'user@example.com',
            phone: '+1234567890',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.phone).toBeUndefined();
      expect(result.context.traits.firstName).toBe('John');
      expect(result.context.traits.lastName).toBe('Doe');
    });

    it('should handle missing context.traits gracefully', async () => {
      const event = {
        properties: {
          gbraid: 'gbraid_456',
        },
        context: {},
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gbraid).toBe('gbraid_456');
      // Should not throw an error
      expect(result.context).toBeDefined();
    });

    it('should handle missing context gracefully', async () => {
      const event = {
        properties: {
          gbraid: 'gbraid_456',
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gbraid).toBe('gbraid_456');
      // Should not throw an error
    });

    it('should only remove email if phone is not present', async () => {
      const event = {
        properties: {
          gbraid: 'gbraid_456',
        },
        context: {
          traits: {
            email: 'user@example.com',
            firstName: 'John',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.context.traits.email).toBeUndefined();
      expect(result.context.traits.firstName).toBe('John');
    });

    it('should only remove phone if email is not present', async () => {
      const event = {
        properties: {
          wbraid: 'wbraid_789',
        },
        context: {
          traits: {
            phone: '+1234567890',
            firstName: 'John',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.context.traits.phone).toBeUndefined();
      expect(result.context.traits.firstName).toBe('John');
    });
  });

  describe('supported event types', () => {
    const testEvent = {
      properties: {
        gclid: 'gclid_123',
        gbraid: 'gbraid_456',
      },
      context: {
        traits: {
          email: 'user@example.com',
        },
      },
    };

    it('should handle onPage events', async () => {
      const result = await handler.onPage(testEvent, mockSettings);

      expect(result.properties.gclid).toBe('gclid_123');
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.context.traits.email).toBe('user@example.com');
    });

    it('should handle onTrack events', async () => {
      const result = await handler.onTrack(testEvent, mockSettings);

      expect(result.properties.gclid).toBe('gclid_123');
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.context.traits.email).toBe('user@example.com');
    });

    it('should handle onScreen events', async () => {
      const result = await handler.onScreen(testEvent, mockSettings);

      expect(result.properties.gclid).toBe('gclid_123');
      expect(result.properties.gbraid).toBeUndefined();
      expect(result.context.traits.email).toBe('user@example.com');
    });
  });

  describe('unsupported event types', () => {
    it('should throw EventNotSupported for onIdentify', () => {
      expect(() => handler.onIdentify({}, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onIdentify({}, mockSettings)).toThrow(
        'identify is not supported',
      );
    });

    it('should throw EventNotSupported for onGroup', () => {
      expect(() => handler.onGroup({}, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onGroup({}, mockSettings)).toThrow(
        'group is not supported',
      );
    });

    it('should throw EventNotSupported for onAlias', () => {
      expect(() => handler.onAlias({}, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onAlias({}, mockSettings)).toThrow(
        'alias is not supported',
      );
    });

    it('should throw EventNotSupported for onDelete', () => {
      expect(() => handler.onDelete({}, mockSettings)).toThrow(
        EventNotSupported,
      );
      expect(() => handler.onDelete({}, mockSettings)).toThrow(
        'delete is not supported',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle events with empty properties', async () => {
      const event = {
        properties: {},
        context: {
          traits: {
            email: 'user@example.com',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties).toEqual({});
      expect(result.context.traits.email).toBe('user@example.com');
    });

    it('should handle events with null properties', async () => {
      const event = {
        properties: {
          gclid: null,
          gbraid: 'gbraid_456',
        },
        context: {
          traits: {
            email: 'user@example.com',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBe('gbraid_456');
      expect(result.context.traits.email).toBeUndefined();
    });

    it('should handle events with undefined properties', async () => {
      const event = {
        properties: {
          gclid: undefined,
          gbraid: 'gbraid_456',
        },
        context: {
          traits: {
            email: 'user@example.com',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBe('gbraid_456');
      expect(result.context.traits.email).toBeUndefined();
    });

    it('should handle events with empty string properties', async () => {
      const event = {
        properties: {
          gclid: '',
          gbraid: 'gbraid_456',
        },
        context: {
          traits: {
            email: 'user@example.com',
          },
        },
      };

      const result = await handler.onTrack(event, mockSettings);

      expect(result.properties.gclid).toBeUndefined();
      expect(result.properties.gbraid).toBe('gbraid_456');
      expect(result.context.traits.email).toBeUndefined();
    });
  });
});
