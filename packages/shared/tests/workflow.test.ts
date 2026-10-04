import { describe, it, expect } from "vitest";
import {
  slugify,
  workflowTag,
  readWorkflow,
  plainTags,
  workflowLabel,
  workflowTagChange,
} from "../src/workflow";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("In production")).toBe("in-production");
    expect(slugify("  Ready / Packed!  ")).toBe("ready-packed");
  });
  it("keeps letters of any script", () => {
    expect(slugify("रवि कुमार")).toBe("रवि-कुमार");
  });
  it("keeps the tag within Shopify's 40 character limit", () => {
    const tag = workflowTag("assignee", "A very long staff member name that goes on and on");
    expect(tag.length).toBeLessThanOrEqual(40);
    expect(tag.endsWith("-")).toBe(false);
  });
});

describe("readWorkflow", () => {
  it("reads stage, assignee and COD status from tags, ignoring case", () => {
    expect(
      readWorkflow(["Priority", "Stage:In-Production", "assigned:ravi-kumar", "cod:confirmed"]),
    ).toEqual({ stage: "in-production", assignee: "ravi-kumar", cod: "confirmed" });
  });
  it("returns nulls when no workflow tags are present", () => {
    expect(readWorkflow(["Priority"])).toEqual({ stage: null, assignee: null, cod: null });
  });
});

describe("plainTags", () => {
  it("hides workflow tags from the ordinary tag list", () => {
    expect(plainTags(["Priority", "stage:packed", "cod:declined"])).toEqual(["Priority"]);
  });
});

describe("workflowLabel", () => {
  it("shows the configured label for a slug", () => {
    expect(workflowLabel("in-production", ["To make", "In production"])).toBe("In production");
  });
  it("falls back to the slug when the label was removed from settings", () => {
    expect(workflowLabel("quality-check", ["To make"])).toBe("quality check");
    expect(workflowLabel(null, ["To make"])).toBeNull();
  });
});

describe("workflowTagChange", () => {
  it("replaces the current stage with the new one", () => {
    expect(
      workflowTagChange(["Priority", "stage:to-make"], "stage", "In production"),
    ).toEqual({ add: ["stage:in-production"], remove: ["stage:to-make"] });
  });
  it("leaves other groups and plain tags alone", () => {
    const change = workflowTagChange(
      ["Priority", "stage:to-make", "assigned:ravi-kumar"],
      "assignee",
      "Meera",
    );
    expect(change).toEqual({ add: ["assigned:meera"], remove: ["assigned:ravi-kumar"] });
  });
  it("does nothing when the value is already set", () => {
    expect(workflowTagChange(["Stage:Packed"], "stage", "Packed")).toEqual({ add: [], remove: [] });
  });
  it("clears the group when the value is null", () => {
    expect(workflowTagChange(["cod:confirmed", "Priority"], "cod", null)).toEqual({
      add: [],
      remove: ["cod:confirmed"],
    });
  });
});
