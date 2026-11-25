import { z } from 'zod';
import { HTTP_METHODS } from '../constants.js';

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug 只能包含小写字母、数字和连字符，且以字母或数字开头');

export const httpMethodSchema = z.enum(HTTP_METHODS);

// RFC 7230 token — anything else would make Node reject the response with
// ERR_INVALID_HTTP_TOKEN at reply time (a delayed 500 for a config error)
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Node's own checkInvalidHeaderChar — \v, \f, DEL, NUL, Chinese, … all
// throw ERR_INVALID_CHAR at reply.send; reject them at write time instead
const INVALID_HEADER_CHAR = /[^\t\x20-\x7e\x80-\xff]/;

export const headersSchema = z.record(
  z.string().min(1).max(256).regex(HTTP_TOKEN, '无效的 HTTP 头名称'),
  z
    .string()
    .max(4096)
    .refine(
      (v) => !INVALID_HEADER_CHAR.test(v),
      'HTTP 头值含非法字符（仅支持 ASCII/latin1 可见字符与制表符，非 ASCII 请先 encodeURIComponent）'
    )
);

export const variablesSchema = z.record(
  z.string().max(256),
  z.string().max(8192)
);
