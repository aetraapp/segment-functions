# Event Transformer Insert Function

This insert function transforms events to match specific destination requirements by standardizing field names, computing derived values, and formatting data.

## Overview

This function provides various transformations including:
1. Standardizing data formats (phone numbers, emails, timestamps)
2. Computing derived values (e.g., price in cents, full names)
3. Enriching events with additional metadata
4. Converting e-commerce events to a standard format

## Features

### Identify Events
- Lowercases and trims email addresses
- Standardizes phone numbers to `+1-XXX-XXX-XXXX` format for US numbers
- Computes `fullName` from `firstName` and `lastName`
- Formats timestamps to ISO 8601

### Track Events
- Transforms e-commerce events with standardized product data
- Converts prices to cents (integer values)
- Calculates order totals if missing
- Ensures consistent event name capitalization
- Transforms generic button clicks to meaningful events

### Page Events
- Extracts page category from URL path
- Extracts referrer domain from referrer URL

### Screen Events
- Adds platform information from device context

### Group Events
- Standardizes company size into ranges
- Formats industry names with proper capitalization

## Example Transformations

### E-commerce Event
**Input:**
```json
{
  "type": "track",
  "event": "product added",
  "properties": {
    "products": [{
      "productId": "123",
      "price": "$19.99",
      "quantity": "2"
    }]
  }
}
```

**Output:**
```json
{
  "type": "track",
  "event": "Product Added",
  "properties": {
    "products": [{
      "productId": "123",
      "product_id": "123",
      "price": "$19.99",
      "price_cents": 1999,
      "quantity": 2
    }],
    "total": 39.98,
    "total_cents": 3998,
    "currency": "USD",
    "processed_at": "2024-01-10T12:00:00.000Z"
  }
}
```

### Identify Event
**Input:**
```json
{
  "type": "identify",
  "traits": {
    "email": "JOHN.DOE@EXAMPLE.COM ",
    "phone": "555-123-4567",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Output:**
```json
{
  "type": "identify",
  "traits": {
    "email": "john.doe@example.com",
    "phone": "+1-555-123-4567",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe"
  }
}
```

## Customization

You can extend this function by:
1. Adding more e-commerce event types to the `ecommerceEvents` array
2. Modifying the price conversion logic for different currencies
3. Adding more button text patterns for event transformation
4. Adjusting company size ranges
5. Adding more standardization rules

## Settings

This function doesn't require any settings. You might want to add:
- `defaultCurrency` - Default currency for e-commerce events
- `phoneCountryCode` - Default country code for phone numbers
- `priceUnit` - Whether prices should be in cents or dollars 