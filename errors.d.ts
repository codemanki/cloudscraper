/* eslint-disable @typescript-eslint/no-explicit-any */
import * as rp from 'request-promise/errors';
import cloudscraper = require('.');
import http = require('http');

export interface RequestError extends rp.RequestError {
  options: cloudscraper.Options;
  errorType: 0;
}

export interface RequestErrorConstructor extends Error {
  new(cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  (cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  prototype: RequestError;
}

export const RequestError: RequestErrorConstructor;

export interface CaptchaError extends rp.RequestError {
  options: cloudscraper.Options;
  errorType: 1;
}

export interface CaptchaErrorConstructor extends Error {
  new(cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  (cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  prototype: CaptchaError;
}

export const CaptchaError: CaptchaErrorConstructor;

export interface CloudflareError extends rp.RequestError {
  options: cloudscraper.Options;
  errorType: 2 | 4;
}

export interface CloudflareErrorConstructor extends Error {
  new(cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  (cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  prototype: CloudflareError;
}

export const CloudflareError: CloudflareErrorConstructor;

export interface ParserError extends rp.RequestError {
  options: cloudscraper.Options;
  errorType: 3;
}

export interface ParserErrorConstructor extends Error {
  new(cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  (cause: any, options: cloudscraper.Options, response: http.IncomingMessage): RequestError;

  prototype: ParserError;
}

export const ParserError: ParserErrorConstructor;

export interface StatusCodeError extends rp.RequestError {
  options: cloudscraper.Options;
  statusCode: number;
  errorType: 5;
}

export interface StatusCodeErrorConstructor extends Error {
  new(statusCode: number, body: any, options: cloudscraper.Options, response: http.IncomingMessage): StatusCodeError;

  (statusCode: number, body: any, options: cloudscraper.Options, response: http.IncomingMessage): StatusCodeError;

  prototype: StatusCodeError;
}

export const StatusCodeError: StatusCodeErrorConstructor;

export interface TransformError extends rp.RequestError {
  options: cloudscraper.Options;
  errorType: 6;
}

export interface TransformErrorConstructor extends Error {
  new(cause: any, options: cloudscraper.Options, response: http.IncomingMessage): TransformError;

  (cause: any, options: cloudscraper.Options, response: http.IncomingMessage): TransformError;

  prototype: TransformError;
}

export const TransformError: TransformErrorConstructor;
