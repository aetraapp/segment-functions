/**
 * Insert Function: Unify Enrichment
 *
 * This function enriches events with data from the Unify profile API.
 *
 * Version: 1.0.0 - Initial release
 * Version: 1.0.1 - Add Google Ads destination bug workaround
 * Version: 1.0.2 - Remove 'Campaign' from traits
 */

/**
 * Unify Event Enrichment
 * @param  {SegmentTrackEvent | SegmentIdentifyEvent | SegmentGroupEvent | SegmentPageEvent | SegmentScreenEvent} event
 * @param  {FunctionSettings} settings
 */
async function lookup(event, { spaceId, spaceToken, googleAds }) {
  if (!spaceId || !spaceToken) {
    throw new ValidationError('Space ID and Space Token are required');
  }

  const {
    userId,
    anonymousId,
    type,
    context: { ip, userAgent, page: { search } = {} } = {},
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

  const unifyTraits = [
    'lastCampaignName',
    'lastCampaignSource',
    'lastCampaignMedium',
    'lastCampaignContent',
    'lastCampaignTerm',
    'lastFbclid', // Facebook Ads
    'lastFbc', // Facebook Ads
    'lastGclid', // Google Ads
    'lastGbraid', // Google Ads
    'lastWbraid', // Google Ads
    'lastIrclickid', // Impact
    'lastLiFatId', // LinkedIn Ads
    'lastMsclkid', // Microsoft Ads
    'lastEpik', // Pinterest Ads
    'lastRdtCid', // Reddit Ads
    'lastRdtUuid', // Reddit Ads
    'lastSccid', // Snapchat Ads
    'lastTtclid', // TikTok Ads
    'lastIp',
    'lastUserAgent',
    'email',
    'phone',
    'firstName',
    'lastName',
    'address',
    'gender',
    'birthday',
  ].join(',');
  const endpoint = `https://profiles.segment.com/v1/spaces/${spaceId}/collections/users/profiles/${lookupId}/traits?limit=100&include=${unifyTraits}`;

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`${spaceToken}:`)}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    // Retry on connection error
    throw new RetryError(error.message);
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

  const { traits: profile } = await response.json();

  const traits = {
    email: profile.email,
    phone: profile.phone,
    firstName: profile.firstName,
    lastName: profile.lastName,
    address: {
      street: profile.address?.street,
      city: profile.address?.city,
      state: profile.address?.state,
      postalCode: profile.address?.postalCode,
      country: profile.address?.country,
    },
    gender: profile.gender,
    birthday: profile.birthday,
  };

  const properties = {
    fbc: profile.lastFbc, // Facebook Ads
    gclid: profile.lastGclid, // Google Ads
    gbraid: profile.lastGbraid, // Google Ads
    wbraid: profile.lastWbraid, // Google Ads
    irclickid: profile.lastIrclickid, // Impact
    li_fat_id: profile.lastLiFatId, // LinkedIn Ads
    msclkid: profile.lastMsclkid, // Microsoft Ads
    epik: profile.lastEpik, // Pinterest Ads
    rdt_cid: profile.lastRdtCid, // Reddit Ads
    rdt_uuid: profile.lastRdtUuid, // Reddit Ads
    sccid: profile.lastSccid, // Snapchat Ads
    ttclid: profile.lastTtclid, // TikTok Ads
  };

  const context = {
    ip: ip || profile.lastIp,
    userAgent: userAgent || profile.lastUserAgent,
  };

  // Due to profile API latency, the click ID might not exist in the profile yet.
  // If this is a page event with a search parameter containing a click ID, use it.
  if (type === 'page' && search) {
    const now = new Date(timestamp).getTime();
    const params = new URLSearchParams(search);

    // Facebook Ads
    const fbclid = params.get('fbclid');
    if (!properties.fbc && fbclid) {
      properties.fbc = `fb.1.${now}.${params.get('fbclid')}`;
    }

    // Google Ads
    const gclid = params.get('gclid');
    if (!properties.gclid && gclid) {
      properties.gclid = params.get('gclid');
    }

    const gbraid = params.get('gbraid');
    if (!properties.gbraid && gbraid) {
      properties.gbraid = params.get('gbraid');
    }

    const wbraid = params.get('wbraid');
    if (!properties.wbraid && wbraid) {
      properties.wbraid = params.get('wbraid');
    }

    // Impact
    const irclickid = params.get('irclickid');
    if (!properties.irclickid && irclickid) {
      properties.irclickid = params.get('irclickid');
    }

    // LinkedIn Ads
    const li_fat_id = params.get('li_fat_id');
    if (!properties.li_fat_id && li_fat_id) {
      properties.li_fat_id = params.get('li_fat_id');
    }

    // Microsoft Ads
    const msclkid = params.get('msclkid');
    if (!properties.msclkid && msclkid) {
      properties.msclkid = params.get('msclkid');
    }

    // Pinterest Ads
    const epik = params.get('epik');
    if (!properties.epik && epik) {
      properties.epik = params.get('epik');
    }

    // Reddit Ads
    const rdt_cid = params.get('rdt_cid');
    if (!properties.rdt_cid && rdt_cid) {
      properties.rdt_cid = params.get('rdt_cid');
      properties.rdt_uuid = `${now}.${anonymousId}`;
    }

    // Snapchat Ads
    const sccid = params.get('sccid');
    if (!properties.sccid && sccid) {
      properties.sccid = params.get('sccid');
    }

    // TikTok Ads
    const ttclid = params.get('ttclid');
    if (!properties.ttclid && ttclid) {
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

  event.context = {
    ...event.context,
    ...context,
  };
  event.context.traits = traits;
  event.properties = {
    ...event.properties,
    ...properties,
  };

  // console.log({ context, traits, properties });
  // console.log(event);

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
