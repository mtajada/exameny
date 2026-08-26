import { assertEquals } from "std/testing/asserts.ts";

import {
  resolveBestEffortClientIp,
  resolveClientIpRateLimitKey,
  UNKNOWN_IP_RATE_LIMIT_KEY,
} from "../_shared/request-ip.ts";

Deno.test("resolveBestEffortClientIp prefers cf-connecting-ip", () => {
  const headers = new Headers({
    "cf-connecting-ip": "203.0.113.10",
    "x-real-ip": "203.0.113.11",
    "x-forwarded-for": "203.0.113.12",
  });

  assertEquals(resolveBestEffortClientIp(headers), "203.0.113.10");
});

Deno.test("resolveBestEffortClientIp prefers x-real-ip over x-forwarded-for", () => {
  const headers = new Headers({
    "x-real-ip": "198.51.100.10",
    "x-forwarded-for": "203.0.113.12",
  });

  assertEquals(resolveBestEffortClientIp(headers), "198.51.100.10");
});

Deno.test("resolveBestEffortClientIp parses first valid x-forwarded-for entry", () => {
  const headers = new Headers({
    "x-forwarded-for": " 198.51.100.10, 203.0.113.12",
  });

  assertEquals(resolveBestEffortClientIp(headers), "198.51.100.10");
});

Deno.test("resolveBestEffortClientIp parses forwarded for= value with IPv4 port", () => {
  const headers = new Headers({
    forwarded: "for=203.0.113.195:4711;proto=https",
  });

  assertEquals(resolveBestEffortClientIp(headers), "203.0.113.195");
});

Deno.test("resolveBestEffortClientIp parses forwarded for= value with bracketed IPv6 port", () => {
  const headers = new Headers({
    forwarded: 'for="[2001:db8:cafe::17]:4711";proto=https',
  });

  assertEquals(resolveBestEffortClientIp(headers), "2001:db8:cafe::17");
});

Deno.test("resolveBestEffortClientIp returns null for invalid values", () => {
  const headers = new Headers({
    "x-real-ip": "not-an-ip",
  });

  assertEquals(resolveBestEffortClientIp(headers), null);
});

Deno.test("resolveBestEffortClientIp returns null for overlong headers", () => {
  const headers = new Headers({
    "x-real-ip": "1".repeat(300),
  });

  assertEquals(resolveBestEffortClientIp(headers), null);
});

Deno.test("resolveClientIpRateLimitKey returns the parsed IP when available", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.10, 203.0.113.12",
  });

  assertEquals(resolveClientIpRateLimitKey(headers), "198.51.100.10");
});

Deno.test("resolveClientIpRateLimitKey falls back to unknown when no valid IP is present", () => {
  const headers = new Headers({
    "x-real-ip": "not-an-ip",
  });

  assertEquals(resolveClientIpRateLimitKey(headers), UNKNOWN_IP_RATE_LIMIT_KEY);
});
