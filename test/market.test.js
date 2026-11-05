// api/market.js 동작 확인 (네이버 요청은 가짜 fetch로 대체)
// 실행: npm test
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import market from "../api/market.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// 코드가 실제로 읽는 필드만 담은 예시 응답 (실제 네이버 응답에는 필드가 더 많다)
const INDEX = {
  stockName: "코스피", closePrice: "2,512.34", fluctuationsRatio: "-1.23",
  compareToPreviousPrice: { code: "5" }, marketStatus: "OPEN", localTradedAt: "2026-11-05T10:15:00+09:00",
};
const MARKET_VALUE = {
  stocks: [{ stockName: "삼성전자", closePrice: "61,200", fluctuationsRatio: "0.82", compareToPreviousPrice: { code: "2" } }],
};

function mockNaver(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return handler(String(url));
  };
  return calls;
}

const call = () => market.fetch(new Request("http://localhost/api/market"));

test("네이버 지수·종목 응답을 묶어 200으로 돌려주고 CDN 캐시를 건다", async () => {
  const calls = mockNaver(url =>
    Response.json(url.includes("/index/") ? INDEX : MARKET_VALUE));

  const res = await call();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /s-maxage=20/);
  assert.deepEqual(await res.json(), { index: INDEX, marketValue: MARKET_VALUE });

  assert.equal(calls.length, 2);
  assert.ok(calls.some(c => c.url.endsWith("/api/index/KOSPI/basic")));
  assert.ok(calls.some(c => c.url.includes("/api/stocks/marketValue/KOSPI")));
  assert.ok(calls.every(c => c.opts.signal), "모든 요청에 시간 제한이 있어야 한다");
});

test("네이버가 오류 상태를 주면 502와 원인을 돌려주고 캐시하지 않는다", async () => {
  mockNaver(url => url.includes("/index/")
    ? new Response("Forbidden", { status: 403 })
    : Response.json(MARKET_VALUE));

  const res = await call();
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "네이버 지수 HTTP 403" });
});

test("네이버가 시간 안에 응답하지 않으면 '시간 초과'로 알린다", async () => {
  mockNaver(() => { throw new DOMException("timed out", "TimeoutError"); });
  const res = await call();
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /시간 초과/);
});

test("네이버가 JSON 대신 HTML을 주면 그 사실을 알린다", async () => {
  mockNaver(() => new Response("<html>점검 중</html>", { status: 200 }));
  const res = await call();
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /JSON이 아님/);
});
