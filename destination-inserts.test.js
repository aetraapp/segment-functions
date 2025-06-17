const fs = require('fs');
const nock = require('nock');
const process = require('process');
const { processInsertFunctionPayload } = require('./buildpack/boreal');
const { EventNotSupported, InvalidEventPayload, ValidationError, DropEvent } = require('./buildpack/boreal/window');

const insertFunctions = fs.readdirSync(`${__dirname}/destination-inserts`);
const skips = [];

describe.each(insertFunctions)('%s', (func) => {
  const dir = `${__dirname}/destination-inserts/${func}`;

  let tester = test;
  if (skips.indexOf(func) > -1) {
    tester = xtest;
  }

  const events = [
    [
      'track',
      {
        type: 'track',
        event: 'Product Added',
        userId: 'test-user-23js8',
        timestamp: '2019-04-08T01:19:38.931Z',
        properties: {
          price: '19.99',
          quantity: 2,
          products: [
            {
              productId: '123',
              price: '19.99',
              quantity: '2',
            },
          ],
        },
      },
    ],
    [
      'identify',
      {
        type: 'identify',
        userId: 'test-user-23js8',
        traits: {
          name: 'Peter Gibbons',
          email: 'PETER@INITECH.COM',
          phone: '5551234567',
          firstName: 'Peter',
          lastName: 'Gibbons',
        },
      },
    ],
    [
      'page',
      {
        type: 'page',
        userId: 'test-user-23js8',
        properties: {
          path: '/products/shoes/nike',
          referrer: 'https://google.com/search?q=shoes',
        },
      },
    ],
    [
      'group',
      {
        type: 'group',
        groupId: 'company-123',
        traits: {
          name: 'Initech',
          employees: 75,
          industry: 'software development',
        },
      },
    ],
  ];

  const settings = {
    apiKey: 'abcd1234',
  };

  // Mock responses for any external API calls
  nock(/.*/).get(/.*/).reply(200, {}).post(/.*/).reply(200, {});

  tester.each(events)('%s event', async (name, event) => {
    process.chdir(dir);
    try {
      const result = await processInsertFunctionPayload({ event, settings });
      // Verify that the function returns an event
      expect(result).toBeDefined();
      expect(result.type).toBe(event.type);
    } catch (err) {
      // These are expected errors that functions might throw
      if (
        !(
          err instanceof EventNotSupported ||
          err instanceof ValidationError ||
          err instanceof InvalidEventPayload ||
          err instanceof DropEvent
        )
      ) {
        fail(err);
      }
    }
  });
});
