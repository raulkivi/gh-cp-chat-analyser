import { describe, expect, it } from "vitest";
import request from "supertest";
import { sessionSchema } from "@gh-cp-chat-analyser/domain";
import { createApp } from "./app.js";
import { listLearnScenarios } from "./data-sources/learn-scenarios/loader.js";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const app = createApp();

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/learn/scenarios", () => {
  it("returns every bundled learn scenario as valid Sessions", async () => {
    const app = createApp();

    const response = await request(app).get("/api/learn/scenarios");

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(listLearnScenarios().length);
    for (const scenario of response.body) {
      expect(() => sessionSchema.parse(scenario)).not.toThrow();
      expect(scenario.mode).toBe("learn");
    }
  });
});

describe("GET /api/learn/scenarios/:id", () => {
  it("returns the full Session for a known scenario id", async () => {
    const app = createApp();
    const [expected] = listLearnScenarios();

    const response = await request(app).get(`/api/learn/scenarios/${expected.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
  });

  it("returns 404 for an unknown scenario id", async () => {
    const app = createApp();

    const response = await request(app).get("/api/learn/scenarios/does-not-exist");

    expect(response.status).toBe(404);
  });
});
