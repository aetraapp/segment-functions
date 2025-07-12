# Aetra Enrichment Insert Function

## Overview

This Insert Function enriches Segment events with profile data from the Aetra API. It is designed to enhance events by fetching additional information based on the event data.

**Version:** 1.0.0 - Initial release

## Setup

To use this function in Segment:

1. Create a new Insert Function in your Segment workspace.
2. Copy and paste the code from `handler.js` into the function editor.
3. Configure the following settings:
   - `writeKey`: Your Aetra Space write key (required).
   - `token`: Your Aetra Space API token for authentication (required).

## How It Works

The function defines an `enrich` method that:
- Sends a POST request to `https://api.aetra.com/profile/{writeKey}/enrich` with the event data.
- Uses Basic Authentication with the provided `token`.
- Specifies the API version via the `X-Aetra-Version` header (set to '2025-01-01').

If the request succeeds, the enriched event from the API response is returned.

## Supported Events

This function supports enrichment for the following Segment event types:
- Track
- Identify
- Group
- Page
- Screen

Alias and Delete events are not supported and will throw an `EventNotSupported` error.

## Error Handling

- **Network Errors:** If there's a network issue during the API call, the original event is returned unchanged.
- **Server Errors (5xx) or Rate Limits (429):** A `RetryError` is thrown, allowing Segment to retry the event.
- **Other Errors:** The function will propagate other errors as they occur.

## Testing

To test the function:
1. Use Segment's function testing tools with sample events.
2. Ensure your `writeKey` and `token` are correctly configured.
3. Verify that enriched data appears in the output events.


## Settings

- `writeKey` (string) 
- `token` (string) 


For more details, refer to the comments in `handler.js`.
