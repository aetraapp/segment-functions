/**
 * Aetra Event Enrichment
 *
 * This function sends the event to the Aetra API for enrichment and returns the enriched event.
 * If the writeKey or token is missing, it returns the original event.
 * If the API call fails due to network issues, it returns the original event.
 * If the API returns a server error or rate limit, it throws a RetryError for Segment to retry.
 *
 * @param {SegmentTrackEvent | SegmentIdentifyEvent | SegmentGroupEvent | SegmentPageEvent | SegmentScreenEvent} event - The Segment event to enrich
 * @param {FunctionSettings} settings - The function settings containing writeKey and token
 * @returns {Promise<object>} The enriched event
 */
async function enrich(event, { writeKey, token }) {
  if (!writeKey || !token) {
    return event;
  }
  let response;

  try {
    // Make a POST request to the Aetra enrichment API with the event data
    response = await fetch(`https://api.aetra.com/profile/${writeKey}/enrich`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${token}:`)}`,
        'X-Aetra-Version': '2025-01-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
  } catch (_error) {
    // In case of network errors, return the event as is without enrichment
    return event;
  }

  // Check for server errors or rate limiting and throw RetryError if encountered
  if (response.status >= 500 || response.status === 429) {
    throw new RetryError(`Failed with ${response.status}`);
  }

  // Parse and return the enriched event from the API response
  event = await response.json();

  return event;
}

/**
 * Enrich events
 * @param {SegmentTrackEvent | SegmentIdentifyEvent | SegmentGroupEvent | SegmentPageEvent | SegmentScreenEvent} event
 * @param {FunctionSettings} settings
 */
onTrack = (event, settings) => enrich(event, settings);
onIdentify = (event, settings) => enrich(event, settings);
onGroup = (event, settings) => enrich(event, settings);
onPage = (event, settings) => enrich(event, settings);
onScreen = (event, settings) => enrich(event, settings);

onAlias = () => {
  throw new EventNotSupported('alias is not supported');
};

onDelete = () => {
  throw new EventNotSupported('delete is not supported');
};
