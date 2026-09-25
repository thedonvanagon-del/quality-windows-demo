// CloudFront Function (viewer-request) for nosyneighborscoffeeco.com.
//
// Two jobs:
//   1. Redirect www.<domain> to the bare apex so the site has one canonical URL.
//   2. Rewrite directory-style paths onto the objects that actually exist in S3.
//      A private S3 bucket behind Origin Access Control serves objects only --
//      it has no directory-index behaviour -- so "/menu/" would 404 without this.
//
// Runtime: cloudfront-js-2.0. Entry point must be named `handler`.

function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var uri = request.uri;

  var host = headers.host && headers.host.value ? headers.host.value : '';

  if (host.indexOf('www.') === 0) {
    var apex = host.substring(4);
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        'location': { value: 'https://' + apex + uri + buildQueryString(request.querystring) },
        'cache-control': { value: 'max-age=3600' }
      }
    };
  }

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') <= uri.lastIndexOf('/')) {
    // The last path segment carries no file extension, so treat it as a directory.
    request.uri = uri + '/index.html';
  }

  return request;
}

function buildQueryString(querystring) {
  if (!querystring) {
    return '';
  }

  var parts = [];

  for (var key in querystring) {
    var entry = querystring[key];

    if (entry.multiValue) {
      for (var i = 0; i < entry.multiValue.length; i++) {
        parts.push(encodePair(key, entry.multiValue[i].value));
      }
    } else {
      parts.push(encodePair(key, entry.value));
    }
  }

  return parts.length ? '?' + parts.join('&') : '';
}

function encodePair(key, value) {
  if (value === undefined || value === null || value === '') {
    return encodeURIComponent(key);
  }
  return encodeURIComponent(key) + '=' + encodeURIComponent(value);
}
