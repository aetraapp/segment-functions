/**
 * Insert Function: Event Transformer
 *
 * This function transforms events to match specific destination requirements,
 * such as standardizing field names, computing derived values, and formatting data.
 *
 * @param {Object} event - The incoming Segment event
 * @param {Object} settings - Custom settings for this function
 * @return {Object} The transformed event
 */

/**
 * Convert price string to cents (integer)
 */
function priceToCents(price) {
  if (typeof price === 'number') {
    return Math.round(price * 100);
  }
  if (typeof price === 'string') {
    const numericPrice = Number.parseFloat(price.replace(/[^0-9.-]/g, ''));
    return Math.round(numericPrice * 100);
  }
  return 0;
}

/**
 * Format timestamp to ISO 8601
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return new Date().toISOString();

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

/**
 * Standardize phone number format
 */
function standardizePhone(phone) {
  if (!phone) return null;

  // Remove all non-digits
  const digits = phone.toString().replace(/\D/g, '');

  // Format as US phone number if 10 digits
  if (digits.length === 10) {
    return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Return cleaned digits for other formats
  return digits;
}

/**
 * Transform e-commerce events
 */
function transformEcommerceEvent(event) {
  if (!event.properties) return event;

  const transformed = { ...event };

  // Standardize product data
  if (event.properties.products && Array.isArray(event.properties.products)) {
    transformed.properties.products = event.properties.products.map(
      (product) => ({
        ...product,
        product_id: product.product_id || product.productId || product.id,
        sku: product.sku || product.SKU,
        price_cents: priceToCents(product.price),
        quantity: Number.parseInt(product.quantity) || 1,
      }),
    );
  }

  // Calculate total if not present
  if (!transformed.properties.total && transformed.properties.products) {
    transformed.properties.total = transformed.properties.products.reduce(
      (sum, product) => sum + (product.price_cents * product.quantity) / 100,
      0,
    );
  }

  // Convert total to cents
  if (transformed.properties.total) {
    transformed.properties.total_cents = priceToCents(
      transformed.properties.total,
    );
  }

  // Standardize currency
  transformed.properties.currency = (
    transformed.properties.currency || 'USD'
  ).toUpperCase();

  return transformed;
}

async function onIdentify(event, settings) {
  // Standardize user traits
  if (event.traits) {
    // Ensure email is lowercase
    if (event.traits.email) {
      event.traits.email = event.traits.email.toLowerCase().trim();
    }

    // Standardize phone
    if (event.traits.phone) {
      event.traits.phone = standardizePhone(event.traits.phone);
    }

    // Add computed traits
    if (event.traits.firstName && event.traits.lastName) {
      event.traits.fullName =
        `${event.traits.firstName} ${event.traits.lastName}`.trim();
    }

    // Standardize created_at timestamp
    if (event.traits.createdAt) {
      event.traits.createdAt = formatTimestamp(event.traits.createdAt);
    }
  }

  return event;
}

async function onTrack(event, settings) {
  // Transform e-commerce events
  const ecommerceEvents = [
    'Product Added',
    'Product Removed',
    'Order Completed',
    'Cart Viewed',
  ];
  if (ecommerceEvents.includes(event.event)) {
    event = transformEcommerceEvent(event);
  }

  // Add event metadata
  if (!event.properties) {
    event.properties = {};
  }

  // Add processing timestamp
  event.properties.processed_at = new Date().toISOString();

  // Ensure event name follows naming convention
  event.event = event.event
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Transform custom events
  if (event.event === 'Button Clicked' && event.properties.button_text) {
    // Convert button click to more meaningful event name
    const buttonText = event.properties.button_text.toLowerCase();
    if (buttonText.includes('buy') || buttonText.includes('purchase')) {
      event.event = 'Purchase Intent Shown';
    } else if (
      buttonText.includes('signup') ||
      buttonText.includes('register')
    ) {
      event.event = 'Signup Intent Shown';
    }
  }

  return event;
}

async function onPage(event, settings) {
  // Standardize page properties
  if (event.properties) {
    // Add page category based on path
    if (event.properties.path && !event.properties.category) {
      const pathParts = event.properties.path.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        event.properties.category = pathParts[0];
      }
    }

    // Add referrer domain
    if (event.properties.referrer) {
      try {
        const url = new URL(event.properties.referrer);
        event.properties.referrer_domain = url.hostname;
      } catch (e) {
        // Invalid URL, ignore
      }
    }
  }

  return event;
}

async function onScreen(event, settings) {
  // Mobile screen events - add platform info
  if (event.context?.device) {
    if (!event.properties) {
      event.properties = {};
    }
    event.properties.platform = event.context.device.type || 'mobile';
  }

  return event;
}

async function onGroup(event, settings) {
  // Standardize company traits
  if (event.traits) {
    // Ensure consistent company size format
    if (event.traits.employees) {
      const employees = Number.parseInt(event.traits.employees);
      if (!Number.isNaN(employees)) {
        if (employees < 10) event.traits.company_size = '1-10';
        else if (employees < 50) event.traits.company_size = '11-50';
        else if (employees < 200) event.traits.company_size = '51-200';
        else if (employees < 1000) event.traits.company_size = '201-1000';
        else event.traits.company_size = '1000+';
      }
    }

    // Standardize industry names
    if (event.traits.industry) {
      event.traits.industry = event.traits.industry
        .split(' ')
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(' ');
    }
  }

  return event;
}

async function onAlias(event, settings) {
  // Pass through alias events unchanged
  return event;
}
