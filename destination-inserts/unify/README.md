# Unify Event Enrichment

The Unify Event Enrichment function enhances incoming Segment events with user profile data from Segment's Profiles API. This enables you to enrich events with previously collected user traits and attribution data without requiring client-side changes.

## Overview

This function intercepts `page`, `track`, and `screen` events and enriches them with:
- User profile traits (email, phone, name, address, demographics)
- Campaign attribution data from the user's profile
- Advertising click IDs from 9 major platforms (Facebook, Google, LinkedIn, Microsoft, Pinterest, Reddit, Snapchat, TikTok, Impact)
- Technical context (IP address, user agent)

The enriched data is added to the event's context and properties before it continues through your Segment pipeline.

## Configuration

### Required Settings

- **spaceId** (required): Your Segment Space ID
- **spaceToken** (required): Your Segment Space Token for authenticating with the Profiles API

### Optional Settings

- **googleAds** (optional): Set to `true` to enable Google Ads destination compatibility mode. This applies special handling to work around known issues in the Segment Google Ads destination.

## Supported Events

| Event Type | Supported | Description |
|------------|-----------|-------------|
| Page | ✅ | Enriches page view events with user profile data and extracts click IDs from URL parameters |
| Track | ✅ | Enriches track events with user profile data |
| Screen | ✅ | Enriches screen events with user profile data |
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
| `address.street` | User's street address |
| `address.city` | User's city |
| `address.state` | User's state/province |
| `address.postalCode` | User's postal/zip code |
| `address.country` | User's country |
| `gender` | User's gender |
| `birthday` | User's date of birth |

### Properties Added to Event

The function adds advertising click IDs to `event.properties`:

| Property | Source Trait | Platform | Description |
|----------|--------------|----------|-------------|
| `fbc` | `lastCampaignFbc` | Facebook | Facebook click ID in conversion format |
| `gclid` | `lastCampaignGclid` | Google Ads | Google Ads click ID |
| `gbraid` | `lastCampaignGbraid` | Google Ads | Google Ads iOS app campaign ID |
| `wbraid` | `lastCampaignWbraid` | Google Ads | Google Ads web-to-app campaign ID |
| `irclickid` | `lastCampaignIrclickid` | Impact | Impact affiliate tracking ID |
| `li_fat_id` | `lastCampaignLiFatId` | LinkedIn Ads | LinkedIn first-party ad tracking ID |
| `msclkid` | `lastCampaignMsclkid` | Microsoft Ads | Microsoft Advertising click ID |
| `epik` | `lastCampaignEpik` | Pinterest Ads | Pinterest advertising ID |
| `rdt_cid` | `lastCampaignRdtCid` | Reddit Ads | Reddit conversion ID |
| `rdt_uuid` | `lastCampaignRdtUuid` | Reddit Ads | Reddit universal user ID |
| `sccid` | `lastCampaignSccid` | Snapchat Ads | Snapchat click ID |
| `ttclid` | `lastCampaignTtclid` | TikTok Ads | TikTok click ID |

### Context Enrichment

The function updates `event.context` with:
- `ip`: Uses current IP if available, otherwise falls back to `lastIp` from profile
- `userAgent`: Uses current user agent if available, otherwise falls back to `lastUserAgent` from profile

## Special Behaviors

### User Identification

The function requires either `userId` or `anonymousId` to look up the user profile:
- Prioritizes `userId` if present
- Falls back to `anonymousId` if no `userId`
- Throws `ValidationError` if neither identifier is present

### URL Parameter Extraction for Page Events

For `page` events, the function extracts click IDs from URL parameters when they're not already present in the user profile. This handles cases where profile data hasn't been updated yet due to API latency.

Supported URL parameters:
- `fbclid` → generates `fbc` property
- `gclid`, `gbraid`, `wbraid` → Google Ads properties
- `irclickid` → Impact property
- `li_fat_id` → LinkedIn Ads property
- `msclkid` → Microsoft Ads property
- `epik` → Pinterest Ads property
- `rdt_cid` → Reddit Ads property (also generates `rdt_uuid`)
- `sccid` → Snapchat Ads property
- `ttclid` → TikTok Ads property

### Facebook Click ID Generation

For `page` events with an `fbclid` parameter in the URL:
- If the user profile doesn't already have an `fbc` value
- The function generates one in the format: `fb.1.{timestamp}.{fbclid}`
- This enables Facebook Conversions API tracking

### Reddit Ads Special Handling

When `rdt_cid` is found in URL parameters for page events:
- The function automatically generates a `rdt_uuid` in the format: `{timestamp}.{anonymousId}`
- This provides the universal user ID required by Reddit's conversion tracking

### Google Ads Destination Compatibility

When the `googleAds` setting is enabled, the function applies special handling to work around known issues in the Segment Google Ads destination:

1. **Click ID Prioritization**: Only one Google click ID is included per event:
   - Priority order: `gclid` > `gbraid` > `wbraid`
   - Lower priority IDs are removed when higher priority ones exist

2. **Email/Phone Removal**: To comply with Google's Enhanced Conversions requirements:
   - When `gbraid` is present (and `gclid` is not), email and phone are removed
   - When only `wbraid` is present, email and phone are removed
   - When no Google click IDs exist, email and phone are removed

This ensures proper attribution while meeting Google's data requirements for iOS and web-to-app campaigns.

### Profile Not Found

If the user profile is not found (404 response), the event is returned unchanged without enrichment.

## Error Handling

| Error Type | Condition | Behavior |
|------------|-----------|----------|
| `ValidationError` | Missing spaceId or spaceToken | Fails immediately |
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
    "gclid": "CjwKCAjw...",
    "li_fat_id": "LI123",
    "msclkid": "MS456",
    "ttclid": "TT567"
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
        "street": "123 Main St",
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

- **Conversion Tracking**: Automatically include advertising click IDs needed for platform conversion APIs across 9 major platforms
- **Event Enrichment**: Add user profile data to events without client-side modifications
- **Identity Resolution**: Ensure events have complete user information for downstream tools
- **Personalization**: Include user traits in events for real-time personalization
- **Data Consistency**: Maintain consistent user data across all events
- **Cross-Platform Attribution**: Support attribution tracking for Facebook, Google, LinkedIn, Microsoft, Pinterest, Reddit, Snapchat, TikTok, and Impact campaigns

## Performance Considerations

- The function makes one API call per event to fetch profile data
- Profile lookups add latency to event processing
- Consider implementing caching if processing high volumes of events
- 404 responses (profile not found) do not retry and pass events through unchanged
- URL parameter extraction only occurs for page events and has minimal performance impact

## Debugging

The function includes console.log statements that output:
- Enriched context, traits, and properties objects
- The complete enriched event

These logs can help troubleshoot enrichment issues in your Segment function logs.

## Version History

- **1.0.0**: Initial release with Facebook and Google Ads support
- **1.0.1**: Added support for 8 additional advertising platforms, URL parameter extraction, Google Ads destination compatibility mode, and enhanced address structure 