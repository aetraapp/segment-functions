# Enrich with Company Data Insert Function

This insert function enriches user data with company information based on the user's email domain.

## Overview

When a user is identified with an email address, this function will:
1. Extract the domain from the email
2. Look up company information based on the domain
3. Add company details to the user's traits

## Features

- Enriches `identify` events with company data
- Adds the following traits when available:
  - `company` - Company name
  - `industry` - Industry category
  - `companySize` - Employee count range
  - `companyFounded` - Year founded

## Usage

1. Deploy this insert function to your Segment workspace
2. Connect it to a destination
3. Any identify calls with email addresses will be automatically enriched

## Example

**Input:**
```json
{
  "type": "identify",
  "userId": "user123",
  "traits": {
    "email": "john@segment.com",
    "name": "John Doe"
  }
}
```

**Output:**
```json
{
  "type": "identify",
  "userId": "user123",
  "traits": {
    "email": "john@segment.com",
    "name": "John Doe",
    "company": "Segment",
    "industry": "Customer Data Platform",
    "companySize": "500-1000",
    "companyFounded": 2011
  }
}
```

## Settings

This function doesn't require any settings. In a production environment, you might want to add:
- `apiKey` - API key for a company enrichment service
- `apiEndpoint` - Endpoint URL for the enrichment API

## Notes

- The example uses a mock database. In production, replace this with an actual API call to a service like Clearbit or similar
- Non-identify events are passed through unchanged
- If no company data is found for a domain, the event is passed through unchanged 