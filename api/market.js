// 네이버 증권 시세를 서버에서 대신 받아 브라우저에 전달하는 Vercel 함수 (GET /api/market)
//
// 브라우저에서 네이버 API를 직접 부르면 CORS로 막힌다. 서버끼리의 요청에는 CORS가 없으므로
// 이 함수가 중계하고, 페이지는 같은 출처(/api/market)로 요청한다.
// 응답은 CDN에 20초간 캐시되므로, 보는 사람이 많아도 네이버로 가는 요청은 늘지 않는다.

const NAVER = {
  index: "https://m.stock.naver.com/api/index/KOSPI/basic",
  marketValue: "https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=30",
};
const LABEL = { index: "지수", marketValue: "종목" };
const TIMEOUT_MS = 8000;

async function getNaver(key) {
  let res;
  try {
    res = await fetch(NAVER[key], {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; stock-market-weather/1.0)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const why = e.name === "TimeoutError" || e.name === "AbortError" ? "시간 초과" : "연결 실패";
    throw new Error(`네이버 ${LABEL[key]} ${why}`);
  }
  if (!res.ok) throw new Error(`네이버 ${LABEL[key]} HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`네이버 ${LABEL[key]} 응답이 JSON이 아님`);
  }
}

export default {
  async fetch() {
    try {
      const [index, marketValue] = await Promise.all([getNaver("index"), getNaver("marketValue")]);
      return Response.json(
        { index, marketValue },
        { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } },
      );
    } catch (e) {
      return Response.json(
        { error: e.message },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
};
