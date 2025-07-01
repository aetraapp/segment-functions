/**
 * Insert Function: Clean Google Events
 *
 * This function cleans up Google events by removing duplicate click IDs and PII.
 *
 * Version: 1.0.0 - Initial release
 */

async function cleanGoogleEvent(event) {
  // Google only supports a single click id - prioritize in order: gclid > gbraid > wbraid
  const googleClickIds = ['gclid', 'gbraid', 'wbraid'];
  const firstPresentId = googleClickIds.find((id) => event.properties[id]);

  if (firstPresentId) {
    // Remove all other Google click IDs
    for (const id of googleClickIds) {
      if (id !== firstPresentId) {
        event.properties[id] = undefined;
      }
    }
  }

  // Ensure we don't send PII with gbraid or wbraid
  if (event.properties?.gbraid || event.properties?.wbraid) {
    if (event.context?.traits?.email) {
      event.context.traits.email = undefined;
    }

    if (event.context?.traits?.phone) {
      event.context.traits.phone = undefined;
    }
  }

  return event;
}

/**
 * Enrich events
 */
onPage = (event, settings) => cleanGoogleEvent(event, settings);
onTrack = (event, settings) => cleanGoogleEvent(event, settings);
onScreen = (event, settings) => cleanGoogleEvent(event, settings);

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
