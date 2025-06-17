/**
 * Insert Function: PII Filter
 *
 * This function filters out or masks personally identifiable information (PII)
 * before sending data to downstream destinations.
 *
 * @param {Object} event - The incoming Segment event
 * @param {Object} settings - Custom settings for this function
 * @return {Object} The filtered event
 */

// PII fields to filter
const PII_FIELDS = ['ssn', 'socialSecurityNumber', 'creditCard', 'creditCardNumber', 'driverLicense'];

// Fields to mask (show partial data)
const MASK_FIELDS = ['phone', 'phoneNumber', 'email'];

/**
 * Recursively filter PII from an object
 */
function filterPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const filtered = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      // Remove PII fields entirely
      if (PII_FIELDS.includes(key.toLowerCase())) {
        continue;
      }

      // Mask certain fields
      if (MASK_FIELDS.includes(key.toLowerCase())) {
        filtered[key] = maskValue(obj[key], key.toLowerCase());
      } else if (typeof obj[key] === 'object') {
        // Recursively filter nested objects
        filtered[key] = filterPII(obj[key]);
      } else {
        filtered[key] = obj[key];
      }
    }
  }

  return filtered;
}

/**
 * Mask sensitive values
 */
function maskValue(value, fieldType) {
  if (!value || typeof value !== 'string') return value;

  switch (fieldType) {
    case 'email': {
      // Show only first 2 chars and domain
      const [localPart, domain] = value.split('@');
      if (localPart && domain) {
        const masked = `${localPart.substring(0, 2)}***`;
        return `${masked}@${domain}`;
      }
      return '***@***.***';
    }

    case 'phone':
    case 'phonenumber': {
      // Show only last 4 digits
      const digits = value.replace(/\D/g, '');
      if (digits.length >= 4) {
        return `***-***-${digits.slice(-4)}`;
      }
      return '***-***-****';
    }

    default:
      return '***';
  }
}

/**
 * Check if event contains high-risk PII
 */
function containsHighRiskPII(obj) {
  if (!obj || typeof obj !== 'object') return false;

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      if (PII_FIELDS.includes(key.toLowerCase())) {
        return true;
      }
      if (typeof obj[key] === 'object' && containsHighRiskPII(obj[key])) {
        return true;
      }
    }
  }

  return false;
}

// Handler functions for different event types
async function onIdentify(event, settings) {
  // Check for high-risk PII
  if (containsHighRiskPII(event.traits)) {
    throw new ValidationError('Event contains high-risk PII that cannot be sent to this destination');
  }

  // Filter PII from traits
  event.traits = filterPII(event.traits);

  return event;
}

async function onTrack(event, settings) {
  // Check for high-risk PII
  if (containsHighRiskPII(event.properties)) {
    throw new ValidationError('Event contains high-risk PII that cannot be sent to this destination');
  }

  // Filter PII from properties
  event.properties = filterPII(event.properties);

  // Also check context
  if (event.context) {
    event.context = filterPII(event.context);
  }

  return event;
}

async function onPage(event, settings) {
  // Filter PII from properties
  event.properties = filterPII(event.properties);

  return event;
}

async function onScreen(event, settings) {
  // Filter PII from properties
  event.properties = filterPII(event.properties);

  return event;
}

async function onGroup(event, settings) {
  // Filter PII from traits
  event.traits = filterPII(event.traits);

  return event;
}

async function onAlias(event, settings) {
  // Alias events typically don't contain PII, pass through
  return event;
}
