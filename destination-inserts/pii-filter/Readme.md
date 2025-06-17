# PII Filter Insert Function

This insert function filters out or masks personally identifiable information (PII) before sending data to downstream destinations.

## Overview

This function helps ensure data compliance by:
1. Removing high-risk PII fields completely (SSN, credit cards, etc.)
2. Masking medium-risk PII fields (email, phone numbers)
3. Throwing validation errors when high-risk PII is detected

## Features

### High-Risk PII (Removed Completely)
- `ssn` / `socialSecurityNumber`
- `creditCard` / `creditCardNumber`
- `driverLicense`

### Medium-Risk PII (Masked)
- `email` - Shows first 2 characters + domain (e.g., `jo***@example.com`)
- `phone` / `phoneNumber` - Shows last 4 digits (e.g., `***-***-1234`)

## Usage

1. Deploy this insert function to your Segment workspace
2. Connect it to destinations that shouldn't receive PII
3. The function will automatically filter/mask PII from all events

## Example

**Input:**
```json
{
  "type": "track",
  "event": "User Registered",
  "properties": {
    "email": "john.doe@example.com",
    "phone": "555-123-4567",
    "ssn": "123-45-6789",
    "plan": "premium"
  }
}
```

**Output:**
```json
{
  "type": "track",
  "event": "User Registered",
  "properties": {
    "email": "jo***@example.com",
    "phone": "***-***-4567",
    "plan": "premium"
  }
}
```

Note: The `ssn` field is completely removed.

## Error Handling

If an event contains high-risk PII fields, the function will throw a `ValidationError` and the event will not be sent to the destination.

## Customization

You can customize this function by:
1. Adding more fields to `PII_FIELDS` array for complete removal
2. Adding more fields to `MASK_FIELDS` array for masking
3. Modifying the `maskValue` function to change masking patterns

## Settings

This function doesn't require any settings. You might want to add:
- `strictMode` - Boolean to control whether to throw errors or just filter
- `allowedDomains` - Array of email domains that don't need masking 