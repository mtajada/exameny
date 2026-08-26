export type JsonRecord = Record<string, unknown>;

export const buildJsonRequest = (
  url: string,
  body: JsonRecord,
  headers: HeadersInit = {},
  method = "POST",
): Request =>
  new Request(url, {
    method,
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body),
  });
