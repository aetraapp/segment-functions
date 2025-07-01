# Clean Google Events

A destination insert function that cleans up Google events by handling click ID conflicts and removing PII when required.

## Overview

This function addresses Google's requirement that **GCLID, GBRAID and WBRAID cannot be used at the same time** for Google Ads Enhanced Conversions, as referenced in [PR #2940](https://github.com/segmentio/action-destinations/pull/2940). When multiple Google click IDs are present on an event, this function prioritizes them and removes duplicates to ensure compliance with Google's API requirements.

## Features

### 1. Google Click ID Prioritization
- **Priority Order**: `gclid` > `gbraid` > `wbraid`
- Keeps the highest priority click ID present
- Removes all other Google click IDs from the event
- Preserves other event properties unchanged

### 2. PII Removal for Privacy-Safe Click IDs
- Removes `email` and `phone` from `context.traits` when `gbraid` or `wbraid` are present
- Ensures compliance with Google's privacy requirements for these click ID types
- Leaves other user traits intact

## Usage

This function can be used as a destination insert to clean events before they're sent to Google Ads or other Google advertising platforms.

### Supported Event Types
- `track` events
- `page` events  
- `screen` events

### Unsupported Event Types
- `identify` - throws `EventNotSupported`
- `group` - throws `EventNotSupported`
- `alias` - throws `EventNotSupported`
- `delete` - throws `EventNotSupported`

## Examples

### Input Event with Multiple Click IDs
```javascript
{
  "properties": {
    "gclid": "gclid_123",
    "gbraid": "gbraid_456", 
    "wbraid": "wbraid_789",
    "product_id": "SKU123"
  },
  "context": {
    "traits": {
      "email": "user@example.com",
      "phone": "+1234567890"
    }
  }
}
```

### Output Event (gclid prioritized)
```javascript
{
  "properties": {
    "gclid": "gclid_123",
    // gbraid and wbraid removed
    "product_id": "SKU123"
  },
  "context": {
    "traits": {
      // email and phone preserved since gclid is used
      "email": "user@example.com", 
      "phone": "+1234567890"
    }
  }
}
```

### Input Event with gbraid Only
```javascript
{
  "properties": {
    "gbraid": "gbraid_456",
    "product_id": "SKU123"
  },
  "context": {
    "traits": {
      "email": "user@example.com",
      "phone": "+1234567890"
    }
  }
}
```

### Output Event (PII removed for gbraid)
```javascript
{
  "properties": {
    "gbraid": "gbraid_456",
    "product_id": "SKU123"
  },
  "context": {
    "traits": {
      // email and phone removed for privacy compliance
    }
  }
}
```

## Click ID Priority Logic

The function implements the following priority hierarchy based on Google's requirements:

1. **gclid** (Google Click Identifier) - Highest priority
   - Traditional Google Ads click tracking
   - Allows PII (email/phone) to be sent
   
2. **gbraid** (Google Bridge Identifier) - Medium priority  
   - Privacy-safe click tracking for iOS 14.5+
   - Requires PII removal (email/phone)
   
3. **wbraid** (Web Bridge Identifier) - Lowest priority
   - Privacy-safe click tracking for web
   - Requires PII removal (email/phone)

## Implementation Details

### Click ID Detection
- Uses JavaScript's `find()` method to detect the first "truthy" click ID
- Null, undefined, and empty string values are treated as not present
- Only processes events that have at least one valid Google click ID

### PII Removal Rules
- Removes `context.traits.email` when gbraid or wbraid is present
- Removes `context.traits.phone` when gbraid or wbraid is present  
- Gracefully handles missing context or traits objects
- Preserves all other user traits

## Testing

The function includes comprehensive test coverage with 21 test cases covering:
- Click ID prioritization scenarios
- PII removal logic
- Edge cases (null, undefined, empty values)
- Error handling for unsupported event types
- Graceful handling of missing data

Run tests with:
```bash
pnpm run test destination-inserts/clean-google-events/handler.test.js
```

## References

- [Google Enhanced Conversions Validation PR #2940](https://github.com/segmentio/action-destinations/pull/2940) - Source of Google's requirements that GCLID, GBRAID and WBRAID cannot be used simultaneously
- [Google Ads Enhanced Conversions Documentation](https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions)

## Version History

- **1.0.0** - Initial release with click ID prioritization and PII removal 