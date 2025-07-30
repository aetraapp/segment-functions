/**
 * Insert Function: Aetra Lookup
 *
 * This function enriches events with data from the Aetra profile API.
 *
 * Version: 1.0.0 - Initial release
 * Version: 1.0.1 - Fix error when profile objects are undefined
 */

/**
 * Profile Lookup
 * @param  {SegmentTrackEvent | SegmentIdentifyEvent | SegmentGroupEvent | SegmentPageEvent | SegmentScreenEvent} event
 * @param  {FunctionSettings} settings
 */
async function lookup(event, { writeKey, token, googleAds }) {
  if (!writeKey || !token) {
    return event;
  }

  const {
    userId,
    anonymousId,
    type,
    context: { page: { search } = {} } = {},
    timestamp,
  } = event;

  let lookupId;
  let response;

  if (userId) {
    lookupId = `user_id:${userId}`;
  } else if (anonymousId) {
    lookupId = `anonymous_id:${anonymousId}`;
  } else {
    throw new ValidationError('User ID or Anonymous ID is required');
  }

  try {
    // Make a GET request to the Aetra profile API
    response = await fetch(
      `https://api.aetra.app/profile/${writeKey}/${lookupId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${token}:`)}`,
          'X-Aetra-Version': '2025-01-01',
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (_error) {
    // In case of network errors, return the event as is without enrichment
    return event;
  }

  // Profile not found return the event as-is
  if (response.status === 404) {
    return event;
  }

  // Retry on errors
  if (response.status >= 500 || response.status === 429) {
    throw new RetryError(`Failed with ${response.status}`);
  }

  // For other non-2xx status codes, return the event unchanged
  if (!response.ok) {
    return event;
  }

  const { context = {}, properties = {}, traits = {} } = await response.json();

  // If this is a page event with a search parameter containing a click ID, use it.
  if (type === 'page' && search) {
    // Lowercase all keys in query string
    const lowerCaseSearch = search.replace(/[?&]([^=&]+)=/g, (match) =>
      match.toLowerCase(),
    );

    const now = new Date(timestamp).getTime();
    const params = new URLSearchParams(lowerCaseSearch);

    // Facebook Ads
    const fbclid = params.get('fbclid');
    if (properties.fbc && fbclid) {
      properties.fbc = `fb.1.${now}.${params.get('fbclid')}`;
    }

    // Google Ads
    const gclid = params.get('gclid');
    if (properties.gclid && gclid) {
      properties.gclid = params.get('gclid');
    }

    const gbraid = params.get('gbraid');
    if (properties.gbraid && gbraid) {
      properties.gbraid = params.get('gbraid');
    }

    const wbraid = params.get('wbraid');
    if (properties.wbraid && wbraid) {
      properties.wbraid = params.get('wbraid');
    }

    // Impact
    const irclickid = params.get('irclickid');
    if (properties.irclickid && irclickid) {
      properties.irclickid = params.get('irclickid');
    }

    // LinkedIn Ads
    const li_fat_id = params.get('li_fat_id');
    if (properties.li_fat_id && li_fat_id) {
      properties.li_fat_id = params.get('li_fat_id');
    }

    // Microsoft Ads
    const msclkid = params.get('msclkid');
    if (properties.msclkid && msclkid) {
      properties.msclkid = params.get('msclkid');
    }

    // Pinterest Ads
    const epik = params.get('epik');
    if (properties.epik && epik) {
      properties.epik = params.get('epik');
    }

    // Reddit Ads
    const rdt_cid = params.get('rdt_cid');
    if (properties.rdt_cid && rdt_cid) {
      properties.rdt_cid = params.get('rdt_cid');
      properties.rdt_uuid = `${now}.${anonymousId}`;
    }

    // Snapchat Ads
    const sccid = params.get('sccid');
    if (properties.sccid && sccid) {
      properties.sccid = params.get('sccid');
    }

    // TikTok Ads
    const ttclid = params.get('ttclid');
    if (properties.ttclid && ttclid) {
      properties.ttclid = params.get('ttclid');
    }
  }

  // If this is the Google Ads destination, work around a bug in the Segment
  // destination. Prefer properties in order gclid, gbraid, and wbraid. Remove
  // email and phone when gbraid or wbraid exist.
  // https://github.com/segmentio/action-destinations/pull/2940
  if (googleAds) {
    if (properties.gclid) {
      properties.gbraid = undefined;
      properties.wbraid = undefined;
    } else if (properties.gbraid) {
      properties.wbraid = undefined;
      traits.email = undefined;
      traits.phone = undefined;
    } else {
      traits.email = undefined;
      traits.phone = undefined;
    }
  }

  // Merge the profile into the event
  event.context = {
    ...event.context,
    ...context,
  };
  event.context.traits = {
    ...event.context.traits,
    ...traits,
  };
  event.properties = {
    ...event.properties,
    ...properties,
  };

  return event;
}

/**
 * Enrich events
 */
onPage = (event, settings) => lookup(event, settings);
onTrack = (event, settings) => lookup(event, settings);
onScreen = (event, settings) => lookup(event, settings);

onIdentify = () => {
  throw new EventNotSupported('identify is not supported');
};

onGroup = () => {
  throw new EventNotSupported('group is not supported');
};

onAlias = () => {
  throw new EventNotSupported('alias is not supported');
};

onDelete = () => {
  throw new EventNotSupported('delete is not supported');
};
