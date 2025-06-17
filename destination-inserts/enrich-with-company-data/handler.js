/**
 * Insert Function: Enrich with Company Data
 *
 * This function enriches identify events with additional company information
 * based on the user's email domain.
 *
 * @param {Object} event - The incoming Segment event
 * @param {Object} settings - Custom settings for this function
 * @return {Object} The enriched event to pass to the destination
 */

// Mock company database - in production, this would be an API call
const companyDatabase = {
  'segment.com': {
    company: 'Segment',
    industry: 'Customer Data Platform',
    size: '500-1000',
    founded: 2011,
  },
  'google.com': {
    company: 'Google',
    industry: 'Technology',
    size: '10000+',
    founded: 1998,
  },
};

async function onIdentify(event, settings) {
  // Extract email from traits
  const email = event.traits?.email;

  if (email) {
    // Extract domain from email
    const domain = email.split('@')[1];

    // Look up company data
    const companyData = companyDatabase[domain];

    if (companyData) {
      // Enrich the event with company data
      event.traits = {
        ...event.traits,
        company: companyData.company,
        industry: companyData.industry,
        companySize: companyData.size,
        companyFounded: companyData.founded,
      };
    }
  }

  // Return the enriched event
  return event;
}

async function onTrack(event, settings) {
  // Pass through track events unchanged
  return event;
}

async function onPage(event, settings) {
  // Pass through page events unchanged
  return event;
}

async function onScreen(event, settings) {
  // Pass through screen events unchanged
  return event;
}

async function onGroup(event, settings) {
  // Pass through group events unchanged
  return event;
}

async function onAlias(event, settings) {
  // Pass through alias events unchanged
  return event;
}
