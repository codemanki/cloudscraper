import { URL } from 'url';
import http = require('http');
import https = require('https');
import Promise = require('bluebird');
import request = require('request');
import rp = require('request-promise');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import errors = require('./errors');

declare namespace cloudscraper {
  interface Cloudscraper extends rp.RequestPromise, BaseOptions {
    cloudflareTimeout?: number;
    realEncoding: string | null;
    // Identify this request as a Cloudscraper request
    cloudscraper: boolean;
  }

  interface Captcha {
    submit(error?: Error): void;

    url: string; // <- deprecated
    siteKey: string;
    uri: URL;
    form: {
      [key: string]: string;
      // Secret form value
      s: string;
    };
  }

  interface Response extends request.Response {
    isCloudflare?: boolean;
    isHTML?: boolean;
    isCaptcha?: boolean;

    // JS Challenge
    challenge?: string;
  }

  interface CaptchaResponse extends Response {
    captcha: Captcha;
    isCaptcha: true;
  }

  type Requester =
      rp.RequestPromiseAPI
      | request.RequestAPI<request.Request, request.CoreOptions, request.RequiredUriUrl>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type CaptchaHandler = (options: Options, response: CaptchaResponse, body?: any) => Promise<any> | void;

  interface BaseOptions {
    // The default export of either request or request-promise
    requester?: Requester;
    // Reduce Cloudflare's timeout to cloudflareMaxTimeout if it is excessive
    cloudflareMaxTimeout?: number;
    // Support only this max challenges in row. If CF returns more, throw an error
    challengesToSolve?: number;
    // Remove Cloudflare's email protection
    decodeEmails?: boolean;

    onCaptcha?: CaptchaHandler;
  }

  interface DefaultOptions extends Required<BaseOptions>, rp.RequestPromiseOptions {
    // Override the parsed timeout
    cloudflareTimeout?: number;
    agentOptions?: (http.AgentOptions | https.AgentOptions) & {
      ciphers?: string;
    };
  }

  interface CoreOptions extends BaseOptions, rp.RequestPromiseOptions {
    cloudflareTimeout?: number;
    realEncoding?: string | null;
  }

  interface CloudscraperAPI extends request.RequestAPI<Cloudscraper & request.ResponseRequest, request.CoreOptions, request.RequiredUriUrl> {
    defaultParams: DefaultOptions;
    (options: OptionsWithUrl): Promise<any>;
  }

  type OptionsWithUri = request.UriOptions & CoreOptions;
  type OptionsWithUrl = request.UrlOptions & CoreOptions;
  type Options = OptionsWithUri | OptionsWithUrl;
}

// eslint-disable-next-line no-redeclare
declare const cloudscraper: cloudscraper.CloudscraperAPI;
export = cloudscraper;
