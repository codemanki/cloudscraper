import { EventEmitter } from 'events';
import { URL } from 'url';
// `npm i --save caseless` although it's available if `request` is installed
import caseless from 'caseless';

export default function (options) {
  return new Request(options);
};

// All of the properties that are defined in this class are required.
class Request extends EventEmitter {
  constructor (options) {
    super();
    const self = this;

    self.uri = typeof options.uri === 'string'
      ? new URL(options.uri) : options.uri;

    // Use options.headers instead of `this.headers` if serializing
    self.headers = caseless(options.headers);

    // Cloudscraper will only call `request.callback` for the very last request
    self.callback = options.callback;

    // The actual request should be performed at this point.
    // Pseudo error event
    let error = null;
    if (error) {
      self.emit('error', new Error('Request error'));
    }

    // Pseudo response arguments
    const body = Buffer.from('Response content', 'utf-8');
    const status = 200;
    const headers = {
      // Response headers
    };

    // Create a response object that `request` normally provides
    const response = new Response(headers, status, body);
    response.request = self;

    // Advanced, update the cookie jar, use `tough-cookie` if needed
    if (response.caseless.has('set-cookie')) {
      options.jar.setCookie(
        response.caseless['set-cookie'],
        self.uri.href,
        { ignoreError: true }
      );
    }

    // Emit the complete event
    setImmediate(() => self.emit('complete', response, response.body));
  }

  getHeader (name) {
    return this.headers.get(name);
  }

  setHeader (name, value) {
    this.headers.set(name, value);
  }
}

// All of the properties that are defined in this class are required.
class Response {
  constructor (headers, statusCode, body) {
    this.headers = headers;
    this.caseless = caseless(headers);
    this.statusCode = statusCode;
    this.body = body;
  }
}
