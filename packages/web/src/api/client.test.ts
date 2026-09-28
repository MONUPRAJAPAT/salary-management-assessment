import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, api, toQueryString } from './client';

const stubResponse = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );

afterEach(() => vi.unstubAllGlobals());

const schema = z.object({ id: z.number(), name: z.string() });

describe('the API client', () => {
  it('returns the parsed body on success', async () => {
    stubResponse(200, { id: 1, name: 'Priya' });
    await expect(api.get('/employees/1', schema)).resolves.toEqual({ id: 1, name: 'Priya' });
  });

  it('turns a structured error response into an ApiError carrying its code', async () => {
    stubResponse(409, { error: { code: 'conflict', message: 'That email is already in use.' } });

    await expect(api.get('/employees', schema)).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'That email is already in use.',
    });
  });

  it('still fails usefully when the error body is not the shape we expect', async () => {
    stubResponse(502, '<html>gateway</html>');
    await expect(api.get('/employees', schema)).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a success response that does not match the contract', async () => {
    // The server promised a number and sent a string. Failing here, loudly, beats
    // failing three components deep as "undefined is not an object".
    stubResponse(200, { id: 'one', name: 'Priya' });
    await expect(api.get('/employees/1', schema)).rejects.toMatchObject({
      code: 'contract_mismatch',
    });
  });
});

describe('toQueryString', () => {
  it('joins array filters with commas', () => {
    expect(toQueryString({ country: ['IN', 'JP'] })).toBe('?country=IN%2CJP');
  });

  it('drops empty values so URLs stay readable', () => {
    expect(toQueryString({ search: '', country: [], page: 1 })).toBe('?page=1');
  });

  it('returns an empty string when there is nothing to send', () => {
    expect(toQueryString({ search: undefined })).toBe('');
  });
});
