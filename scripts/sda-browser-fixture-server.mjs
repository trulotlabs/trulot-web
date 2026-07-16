import http from "node:http";

const port = Number.parseInt(process.env.TRULOT_SDA_FIXTURE_PORT ?? "55439", 10);

const parcels = new Map([
  ["1111111111", { address: "111 Positive Ave", lat: 32.71, lng: -117.11, rpc: { tpa: true, sda: true, ctcac: false } }],
  ["2222222222", { address: "222 Negative Ave", lat: 32.72, lng: -117.12, rpc: { tpa: false, sda: false, ctcac: true } }],
  ["3333333333", { address: "333 Prior Negative Ave", lat: 32.73, lng: -117.13, rpc: { tpa: false, sda: false, ctcac: false } }],
  ["4444444444", { address: "444 Missing Coordinates Ave", lat: null, lng: null, rpc: null }],
]);

function send(response, body, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-range": Array.isArray(body) ? `0-${Math.max(0, body.length - 1)}/${body.length}` : "0-0/1",
  });
  response.end(JSON.stringify(body));
}

function parcelRow(apn, fixture) {
  return {
    apn_norm: apn,
    address: fixture.address,
    city: "San Diego",
    state: "CA",
    situs_zip: "92101",
    situs_community: "Phase 1A QA",
    lat: fixture.lat,
    lng: fixture.lng,
    zone_name: "RS-1-7",
    lot_area_sqft: 5000,
    total_lvg_area: 1200,
    nucleus_use_cd: "111",
    year_effective: "1999",
    generated_at: "2026-07-15T12:00:00Z",
    nearby_project_count: 0,
    nearby_completed_count: 0,
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/rest/v1/parcel_page_api_v2") {
    const apnFilter = url.searchParams.get("apn_norm") ?? "";
    if (apnFilter.startsWith("eq.")) {
      const apn = apnFilter.slice(3);
      const fixture = parcels.get(apn);
      return fixture ? send(response, parcelRow(apn, fixture)) : send(response, null);
    }
    return send(response, []);
  }

  if (request.method === "GET" && [
    "/rest/v1/trulot_permit_parcel_link_v1",
    "/rest/v1/parcel_permit_terminal_v2",
  ].includes(url.pathname)) {
    return send(response, []);
  }

  if (request.method === "POST" && url.pathname === "/rest/v1/rpc/check_parcel_overlays") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const fixture = [...parcels.values()].find((item) => item.lat === payload.p_lat && item.lng === payload.p_lng);
      send(response, fixture?.rpc ?? { tpa: false, sda: false, ctcac: false });
    });
    return;
  }

  send(response, { message: `Unhandled fixture request: ${request.method} ${url.pathname}` }, 404);
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ result: "SDA browser fixture server ready", port }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
