/**
 * Unify Event Enrichment
 * @param  {SegmentTrackEvent | SegmentIdentifyEvent | SegmentGroupEvent | SegmentPageEvent | SegmentScreenEvent} event
 * @param  {FunctionSettings} settings
 */
async function enrich(event, { spaceId, spaceToken }) {
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
    'lastCampaignFbclid',
    'lastCampaignFbc',
    'lastCampaignGclid',
    'lastCampaignGbraid',
    'lastCampaignWbraid',
    'lastCampaignMsclkid',
    'lastCampaignIrclickid',
    'lastCampaignSccid',
    'lastCampaignRdtCid',
    'lastCampaignRdtUuid',
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
      city: profile.address?.city,
      state: profile.address?.state,
      postalCode: profile.address?.postalCode,
      country: profile.address?.country,
    },
    gender: profile.gender,
    birthday: profile.birthday,
  };

  const properties = {
    fbc: profile.lastCampaignFbc,
    gclid: profile.lastCampaignGclid,
    gbraid: profile.lastCampaignGbraid,
    wbraid: profile.lastCampaignWbraid,
  };

  const context = {
    ip: ip || profile.lastIp,
    userAgent: userAgent || profile.lastUserAgent,
  };

  // Google only supports a single click id - prioritize in order: gclid > gbraid > wbraid
  const googleClickIds = ['gclid', 'gbraid', 'wbraid'];
  const firstPresentId = googleClickIds.find((id) => properties[id]);

  if (firstPresentId) {
    // Remove all other Google click IDs
    for (const id of googleClickIds) {
      if (id !== firstPresentId) {
        properties[id] = undefined;
      }
    }
  }

  // Handle page views where fbclid is present, but not yet in the users profile
  if (type === 'page' && search) {
    const now = new Date(timestamp).getTime();
    const params = new URLSearchParams(search);
    const fbclid = params.get('fbclid');

    if (!properties.fbc && fbclid) {
      properties.fbc = `fb.1.${now}.${params.get('fbclid')}`;
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

  //   console.log({ context, traits, properties });
  //   console.log(event);

  return event;
}

/**
 * Enrich events
 */
onPage = (event, settings) => enrich(event, settings);
onTrack = (event, settings) => enrich(event, settings);
onScreen = (event, settings) => enrich(event, settings);

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
