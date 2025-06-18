# Unify Destination

The Unify destination captures campaign attribution data and advertising click IDs from page events and sends them as user traits via Segment's Identify API. This helps unify marketing attribution data with user profiles for better tracking and analysis.

## Overview

This destination listens to `page` events and extracts:
- Campaign parameters (name, source, medium, content, term)
- Advertising platform click IDs (Facebook, Google, Microsoft, etc.)
- User context data (IP address, user agent)

When any of this data is present, it sends an `identify` call to update the user's traits with the latest attribution information.

## Configuration

### Required Settings

- **writeKey** (required): Your Segment Write Key for sending identify calls to

## Supported Events

This destination only processes **Page** events. All other event types are ignored.

## Data Captured

### Campaign Parameters

The destination captures standard UTM campaign parameters from the event context:
- `campaign.name` → `lastCampaignName`
- `campaign.source` → `lastCampaignSource`
- `campaign.medium` → `lastCampaignMedium`
- `campaign.content` → `lastCampaignContent`
- `campaign.term` → `lastCampaignTerm`

### Advertising Click IDs

The destination extracts various advertising platform click IDs from the page URL search parameters:

| Platform | Parameter | Trait Name | Additional Data |
|----------|-----------|------------|-----------------|
| Facebook | `fbclid` | `lastFbclid` | Also generates `lastFbc` in format `fb.1.{timestamp}.{fbclid}` |
| Google Ads | `gclid` | `lastGclid` | - |
| Google Ads | `gbraid` | `lastGbraid` | iOS App campaigns |
| Google Ads | `wbraid` | `lastWbraid` | Web to App campaigns |
| Microsoft Ads | `msclkid` | `lastMsclkid` | - |
| Impact | `irclickid` | `lastIrclickid` | - |
| Snapchat | `sccid` | `lastSccid` | - |
| Reddit | `rdt_cid` | `lastRdtCid` | Also generates `lastRdtUuid` in format `{timestamp}.{anonymousId}` |

### Context Data

Additional context data captured:
- `ip` → `lastIp`
- `userAgent` → `lastUserAgent`

## Behavior

1. **Conditional Processing**: The destination only makes an API call if at least one of the following is present:
   - Campaign data (any field)
   - Search parameters in the page URL
   
2. **Case Normalization**: Query parameter keys are normalized to lowercase before processing (e.g., `FBCLID` and `fbclid` are treated the same).

3. **Data Structure**: All traits are prefixed with `last` (in camelCase) to indicate they represent the most recent attribution data.

4. **Error Handling**:
   - Throws `ValidationError` if writeKey is missing
   - Throws `ValidationError` if timestamp is missing from the event
   - Throws `RetryError` for network failures or server errors (5xx, 429)
   - Does not retry on client errors (4xx except 429)

## Example

When a user visits a page with the URL:
```
https://example.com/landing?utm_source=facebook&utm_medium=social&utm_campaign=summer-sale&fbclid=ABC123XYZ
```

The destination will send an identify call with traits:
```json
{
  "lastCampaignName": "",
  "lastCampaignSource": "facebook",
  "lastCampaignMedium": "social",
  "lastCampaignContent": "",
  "lastCampaignTerm": "",
  "lastFbclid": "ABC123XYZ",
  "lastFbc": "fb.1.1704067200000.ABC123XYZ",
  "lastIp": "192.168.1.1",
  "lastUserAgent": "Mozilla/5.0..."
}
```

## Use Cases

- **Attribution Tracking**: Maintain the latest campaign attribution data on user profiles
- **Ad Platform Integration**: Capture click IDs needed for conversion tracking and optimization
- **Marketing Analytics**: Analyze user journeys and campaign effectiveness
- **Personalization**: Use attribution data to personalize user experiences

## Notes

- Empty string values are preserved in traits (not filtered out)
- The destination uses the event's timestamp for generating time-based values
- Both userId and anonymousId can be null - at least one identifier should be present for the identify call to be useful
