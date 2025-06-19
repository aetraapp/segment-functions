/**
 * Handle page event
 * @param  {SegmentPageEvent} event
 * @param  {FunctionSettings} settings
 */

async function onPage(event, { writeKey }) {
  if (!writeKey) {
    throw new ValidationError('Write key is required');
  }

  const {
    userId,
    anonymousId,
    context: {
      campaign: {
        name = '',
        source = '',
        medium = '',
        content = '',
        term = '',
      } = {},
      page: { search = undefined } = {},
      ip = undefined,
      userAgent = undefined,
    } = {},
    timestamp = undefined,
  } = event;

  if (!timestamp) {
    throw new ValidationError('Timestamp is missing');
  }

  if (search || name || source || medium || content || term) {
    // Convert timestamp to milliseconds
    const now = new Date(timestamp).getTime();
    const traits = {};

    // Process search parameters if available
    if (search) {
      // Convert all query parameter keys to lowercase
      const params = new URLSearchParams(
        search.replace(/[?&]([^=&]+)=/g, (match) => match.toLowerCase()),
      );

      // Facebook Ads
      const fbclid = params.get('fbclid');
      if (fbclid) {
        traits.fbclid = fbclid;
        traits.fbc = `fb.1.${now}.${fbclid}`;
      }

      // Google Ads
      const gclid = params.get('gclid');
      const gbraid = params.get('gbraid');
      const wbraid = params.get('wbraid');
      if (gclid || gbraid || wbraid) {
        traits.gclid = gclid || '';
        traits.gbraid = gbraid || '';
        traits.wbraid = wbraid || '';
      }

      // Microsoft Ads
      const msclkid = params.get('msclkid');
      if (msclkid) {
        traits.msclkid = msclkid;
      }

      // Impact
      const irclickid = params.get('irclickid');
      // Impact
      if (irclickid) {
        traits.irclickid = irclickid;
      }

      // Snapchat Ads
      const sccid = params.get('sccid');
      if (sccid) {
        traits.sccid = sccid;
      }

      // Reddit Ads
      const rdt_cid = params.get('rdt_cid');
      if (rdt_cid) {
        traits.rdt_cid = rdt_cid;
        traits.rdt_uuid = `${now}.${anonymousId}`;
      }
    }

    // Process campaign parameters if available
    if (name || source || medium || content || term) {
      traits.campaign = {
        name,
        source,
        medium,
        content,
        term,
      };
    }

    let response;

    try {
      response = await fetch('https://api.segment.io/v1/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writeKey,
          userId: userId || null,
          anonymousId: anonymousId || null,
          traits: flatten({
            last: {
              ...traits,
              ip,
              userAgent,
            },
          }),
        }),
      });
    } catch (error) {
      // Retry on connection error
      throw new RetryError(error.message);
    }

    if (response.status >= 500 || response.status === 429) {
      // Retry on 5xx (server errors) and 429s (rate limits)
      throw new RetryError(`Failed with ${response.status}`);
    }
  }
}

/**
 * Flatten an object and return keys in camelCase
 * @param {Object} input - The object to flatten
 * @param {string} prefix - The prefix to add to keys
 * @returns {Object} The flattened object with camelCase keys
 */
function flatten(input, prefix = '') {
  const result = {};
  function recur(obj, prefix = '') {
    Object.entries(obj).forEach(([key, value]) => {
      if (_.isObject(value)) {
        recur(value, `${prefix}${key}_`);
      } else if (value !== null && value !== undefined) {
        result[_.camelCase(`${prefix}${key}`)] = value;
      }
    });
  }
  recur(input, prefix);
  return result;
}
