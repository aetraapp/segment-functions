/**
 * Handle page event
 * @param  {SegmentPageEvent} event
 * @param  {FunctionSettings} settings
 */
onPage = async (event, settings) => sendConversion(event, settings);

/**
 * Handle page event
 * @param  {SegmentPageEvent} event
 * @param  {FunctionSettings} settings
 */
onTrack = async (event, settings) => sendConversion(event, settings);

/**
 * Handle track event
 * @param  {SegmentTrackEvent} event
 * @param  {FunctionSettings} settings
 */
sendConversion = async (
  event,
  {
    clientId,
    developerToken,
    refreshToken,
    customerAccountId,
    customerId,
    conversionMapping,
  },
) => {
  const eventName = event.event || event.name;

  if (!eventName) {
    throw new Error('Unnamed page events are not supported');
  }

  const hashedEmailAddress = hash(event.context?.traits?.email ?? '');
  const hashedPhoneNumber = hash(event.context?.traits?.phone ?? '');
  const microsoftClickId = event.context?.traits?.lastCampaignMsclkid ?? '';

  let conversionName;
  let conversionValue = 0;

  // Map event names
  switch (eventName) {
    case 'Order Completed':
      conversionName = 'Purchase';
      conversionValue = event.properties.total;
      break;
    default:
      conversionName = conversionMapping[eventName];
    //throw new EventNotSupported(`${event.event} is not supported`);
  }

  // Get an access token from cache or refresh it
  const ttl = 60 * 60 * 1000; // 60 minutes
  const accessToken = await cache.load('accessToken', ttl, async () => {
    const { access_token } = await getAccessToken(clientId, refreshToken);
    return access_token;
  });

  let response;
  try {
    response = await executeSOAPRequest(
      developerToken,
      accessToken,
      customerAccountId,
      customerId,
      conversionName,
      event.receivedAt,
      conversionValue,
      hashedEmailAddress,
      hashedPhoneNumber,
      microsoftClickId,
    );
  } catch (error) {
    throw new RetryError(error.message);
  }

  console.log(JSON.stringify(response));
};

const hash = (value) => {
  const hash = crypto.createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
};

const getAccessToken = async (clientId, refreshToken) => {
  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://ads.microsoft.com/msads.manage offline_access',
  });

  return await sendTokenRequest(tokenUrl, body);
};

const sendTokenRequest = async (url, body) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new RetryError('Errors getting tokens:', error);
  }
};

const executeSOAPRequest = async (
  developerToken,
  accessToken,
  customerAccountId,
  customerId,
  conversionName,
  conversionTime,
  conversionValue,
  hashedEmailAddress,
  hashedPhoneNumber,
  microsoftClickId,
) => {
  const body = `
  <s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Header xmlns="https://bingads.microsoft.com/CampaignManagement/v13">
      <Action mustUnderstand="1">ApplyOfflineConversions</Action>
      <AuthenticationToken i:nil="false">${accessToken}</AuthenticationToken>
      <CustomerAccountId i:nil="false">${customerAccountId}</CustomerAccountId>
      <CustomerId i:nil="false">${customerId}</CustomerId>
      <DeveloperToken i:nil="false">${developerToken}</DeveloperToken>
    </s:Header>
    <s:Body>
      <ApplyOfflineConversionsRequest xmlns="https://bingads.microsoft.com/CampaignManagement/v13">
        <OfflineConversions i:nil="false">
          <OfflineConversion>
            <ConversionCurrencyCode i:nil="false">USD</ConversionCurrencyCode>
            <ConversionName i:nil="false">${conversionName}</ConversionName>
            <ConversionTime>${conversionTime}</ConversionTime>
            <ConversionValue i:nil="false">${conversionValue}</ConversionValue>
            <HashedEmailAddress i:nil="false">${hashedEmailAddress}</HashedEmailAddress>
            <HashedPhoneNumber i:nil="false">${hashedPhoneNumber}</HashedPhoneNumber>
            <MicrosoftClickId i:nil="false">${microsoftClickId}</MicrosoftClickId>
          </OfflineConversion>
        </OfflineConversions>
      </ApplyOfflineConversionsRequest>
    </s:Body>
  </s:Envelope>`;

  const headers = {
    'Content-Type': 'text/xml',
    SOAPAction: 'ApplyOfflineConversions',
  };

  const uri =
    'https://campaign.api.bingads.microsoft.com/Api/Advertiser/CampaignManagement/V13/CampaignManagementService.svc?singleWsdl';

  try {
    const response = await fetch(uri, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xml = await response.text();
    const json = await xml2js.parseStringPromise(xml, {
      explicitArray: false,
      normalize: true,
      tagNameProcessors: [
        xml2js.processors.stripPrefix,
        xml2js.processors.firstCharLowerCase,
      ],
    });

    const apiError =
      json.envelope.body.fault?.detail?.adApiFaultDetail?.errors?.adApiError;
    if (apiError) {
      console.log(apiError.message);
      throw new RetryError(apiError.message);
    }

    const serializationError = json.envelope.body.fault?.faultstring;
    if (serializationError) {
      console.log(serializationError);
      throw new RetryError(serializationError._);
    }

    const batchError =
      json.envelope.body.applyOfflineConversionsResponse?.partialErrors
        ?.batchError;
    if (batchError && Array.isArray(batchError)) {
      console.log(batchError.map((error) => error.message).join(' '));
      throw new Error(
        'Multiple errors found:' +
          batchError.map((error) => error.message).join(' '),
      );
    }

    if (batchError) {
      console.log(batchError.message);
      throw new Error(batchError.message);
    }

    return json;
  } catch (error) {
    console.log(error.message);
    throw new Error('Error executing SOAP request: ' + error.message);
  }
};

/**
 * Handle identify event
 * @param  {SegmentIdentifyEvent} event
 * @param  {FunctionSettings} settings
 */
onIdentify = async (event, settings) => {
  // Learn more at https://segment.com/docs/connections/spec/identify/
  throw new EventNotSupported('identify is not supported');
};

/**
 * Handle group event
 * @param  {SegmentGroupEvent} event
 * @param  {FunctionSettings} settings
 */
onGroup = async (event, settings) => {
  // Learn more at https://segment.com/docs/connections/spec/group/
  throw new EventNotSupported('group is not supported');
};

/**
 * Handle screen event
 * @param  {SegmentScreenEvent} event
 * @param  {FunctionSettings} settings
 */
onScreen = async (event, settings) => {
  // Learn more at https://segment.com/docs/connections/spec/screen/
  throw new EventNotSupported('screen is not supported');
};

/**
 * Handle alias event
 * @param  {SegmentAliasEvent} event
 * @param  {FunctionSettings} settings
 */
onAlias = async (event, settings) => {
  // Learn more at https://segment.com/docs/connections/spec/alias/
  throw new EventNotSupported('alias is not supported');
};

/**
 * Handle delete event
 * @param  {SegmentDeleteEvent} event
 * @param  {FunctionSettings} settings
 */
onDelete = async (event, settings) => {
  // Learn more at https://segment.com/docs/partners/spec/#delete
  throw new EventNotSupported('delete is not supported');
};
