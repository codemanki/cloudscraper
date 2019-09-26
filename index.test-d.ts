/* eslint-disable @typescript-eslint/no-explicit-any */
import { expectType } from 'tsd';
import { URL } from 'url';
import {
  Options, Cloudscraper, CaptchaHandler, CoreOptions, DefaultOptions,
  CaptchaResponse, Captcha
} from './index';
import Promise = require('bluebird');
import request = require('request');
import rp = require('request-promise');
import cloudscraper = require('./index');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import errors = require('./errors');

const noop = (): void => {};

expectType<Options>({ uri: '' });
expectType<Options>({ url: '' });

expectType<Options>({ uri: '', requester: request });
expectType<Options>({ uri: '', requester: rp });

expectType<Cloudscraper>(cloudscraper({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.get({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.post({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.put({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.delete({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.del({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.head({ uri: '' }));
expectType<Cloudscraper>(cloudscraper.patch({ uri: '' }));

expectType<Cloudscraper>(cloudscraper(''));
expectType<Cloudscraper>(cloudscraper.get(''));
expectType<Cloudscraper>(cloudscraper.post(''));
expectType<Cloudscraper>(cloudscraper.put(''));
expectType<Cloudscraper>(cloudscraper.delete(''));
expectType<Cloudscraper>(cloudscraper.del(''));
expectType<Cloudscraper>(cloudscraper.head(''));
expectType<Cloudscraper>(cloudscraper.patch(''));

// eslint-disable-next-line promise/always-return
expectType<Promise<any>>(cloudscraper.get({ uri: '' }).then(noop));
expectType<Promise<any>>(cloudscraper.get({ uri: '' }).catch(noop));
expectType<Promise<any>>(cloudscraper.get({ uri: '' }).finally(noop));
expectType<Promise<any>>(cloudscraper.get({ uri: '' }).promise());
expectType<void>(cloudscraper.get({ uri: '' }).cancel());

expectType<CaptchaHandler>((options: Options, response: CaptchaResponse) => {
  expectType<Options>(options);
  expectType<CaptchaResponse>(response);

  const { captcha, isCaptcha } = response;

  expectType<Captcha>(captcha);
  expectType<true>(isCaptcha);

  expectType<Captcha>({
    url: '', // <- deprecated
    uri: new URL(''),
    siteKey: '',
    submit: captcha.submit,
    form: { s: '' }
  });

  captcha.submit();
});

expectType<DefaultOptions>(cloudscraper.defaultParams);
expectType<DefaultOptions>({
  requester: request,
  cloudflareMaxTimeout: 0,
  challengesToSolve: 0,
  decodeEmails: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCaptcha: (options: Options, response: CaptchaResponse) => {}
});

expectType<CoreOptions>({
  requester: request,
  cloudflareMaxTimeout: 0,
  challengesToSolve: 0,
  decodeEmails: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCaptcha: (options: Options, response: CaptchaResponse) => {},
  realEncoding: 'utf-8'
});
