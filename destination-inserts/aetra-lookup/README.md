# Aetra Event Enrichment

The Aetra Event Enrichment function enhances incoming Segment events with user profile data from the Aetra Profiles API. This enables you to enrich events with previously collected user traits and attribution data without requiring client-side changes.

## Overview

This function intercepts `page`, `track`, and `screen` events and enriches them with:
- User profile traits (email, phone, name, address, demographics)
- Campaign attribution data from the user's profile
- Advertising click IDs (Facebook, Google, Microsoft, etc.)
- Technical context (IP address, user agent)

The enriched data is added to the event's context and properties before it continues through your Segment pipeline.

## Configuration

### Required Settings

- **writeKey** (required): Your Aetra Space ID
- **token** (required): Your Aetra Space Token

## Supported Events

| Event Type | Supported | Description |
|------------|-----------|-------------|
| Page | ✅ | Enriches page view events with attribution data |
| Track | ✅ | Enriches track events with attribution data |
| Screen | ✅ | Enriches screen events with attribution data |
| Identify | ❌ | Not supported (throws EventNotSupported error) |
| Group | ❌ | Not supported (throws EventNotSupported error) |
| Alias | ❌ | Not supported (throws EventNotSupported error) |
| Delete | ❌ | Not supported (throws EventNotSupported error) |

## Data Enrichment

### User Traits Added to Context

The function adds the following traits from the user's profile to `event.context.traits`:

| Trait | Description |
|-------|-------------|
| `email` | User's email address |
| `phone` | User's phone number |
| `firstName` | User's first name |
| `lastName` | User's last name |
| `address.city` | User's city |
| `address.state` | User's state/province |
| `address.postalCode` | User's postal/zip code |
| `address.country` | User's country |
| `gender` | User's gender |
| `birthday` | User's date of birth |

### Properties Added to Event

The function adds advertising click IDs to `event.properties`:

| Property | Source Trait | Description |
|----------|--------------|-------------|
| `fbc` | `lastFbc` | Facebook click ID in conversion format |
| `gclid` | `lastGclid` | Google Ads click ID |
| `gbraid` | `lastGbraid` | Google Ads iOS app campaign ID |
| `wbraid` | `lastWbraid` | Google Ads web-to-app campaign ID |

## Special Behaviors

### User Identification

The function requires either `userId` or `anonymousId` to look up the user profile:
- Prioritizes `userId` if present
- Falls back to `anonymousId` if no `userId`
- Throws `ValidationError` if neither identifier is present

### Google Click ID Handling

Google platforms only support a single click ID per conversion. The function prioritizes them in this order:
1. `gclid` (standard Google Ads)
2. `gbraid` (iOS campaigns)
3. `wbraid` (web-to-app campaigns)

Only the highest priority ID found is included in the enriched event.

### Facebook Click ID Generation

For `page` events with an `fbclid` parameter in the URL:
- If the user profile doesn't already have an `fbc` value
- The function generates one in the format: `fb.1.{timestamp}.{fbclid}`
- This enables Facebook Conversions API tracking

### Profile Not Found

If the user profile is not found (404 response), the event is returned unchanged without enrichment.

## Error Handling

| Error Type | Condition | Behavior |
|------------|-----------|----------|
| `ValidationError` | Missing userId and anonymousId | Fails immediately |
| `RetryError` | Network connection error | Retries the request |
| `RetryError` | Server error (5xx) or rate limit (429) | Retries the request |
| `EventNotSupported` | Unsupported event type | Fails immediately |

## Example

### Input Event
```javascript
{
  "type": "track",
  "event": "Product Viewed",
  "userId": "user123",
  "anonymousId": "anon456",
  "properties": {
    "productId": "SKU123",
    "price": 99.99
  },
  "context": {
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Enriched Output Event
```javascript
{
  "type": "track",
  "event": "Product Viewed",
  "userId": "user123",
  "anonymousId": "anon456",
  "properties": {
    "productId": "SKU123",
    "price": 99.99,
    "fbc": "fb.1.1704067200000.ABC123XYZ",
    "gclid": "CjwKCAjw..."
  },
  "context": {
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "traits": {
      "email": "user@example.com",
      "phone": "+1234567890",
      "firstName": "John",
      "lastName": "Doe",
      "address": {
        "city": "San Francisco",
        "state": "CA",
        "postalCode": "94105",
        "country": "USA"
      },
      "gender": "male",
      "birthday": "1990-01-15"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Use Cases

- **Conversion Tracking**: Automatically include advertising click IDs needed for platform conversion APIs
- **Event Enrichment**: Add user profile data to events without client-side modifications
- **Identity Resolution**: Ensure events have complete user information for downstream tools
- **Personalization**: Include user traits in events for real-time personalization
- **Data Consistency**: Maintain consistent user data across all events

## Performance Considerations

- The function makes one API call per event to fetch profile data
- 404 responses (profile not found) do not retry and pass events through unchanged

 