import { describe, it, expect } from "vitest";
import { buildOrdersCsv, escapeCsvCell, CSV_HEADERS, type CsvOrderRow } from "../src/csv";

const row: CsvOrderRow = {
  name: "#10491",
  orderedAt: new Date("2026-09-19T05:30:00Z"),
  customerName: "John, Mathew",
  email: "john@example.com",
  phone: "+919999999999",
  totalPrice: "2499.00",
  financialStatus: "PENDING",
  fulfillmentStatus: "UNFULFILLED",
  codStatus: "PENDING",
  tags: ["Priority"],
  assignedStaff: { name: 'Anjali "AJ"' },
};

describe("escapeCsvCell", () => {
  it("escapes commas and quotes", () => {
    expect(escapeCsvCell("John, Mathew")).toBe('"John, Mathew"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("passes plain values through", () => {
    expect(escapeCsvCell("#10491")).toBe("#10491");
  });
});

describe("buildOrdersCsv", () => {
  it("writes headers and one line per order", () => {
    const csv = buildOrdersCsv([row, { ...row, name: "#10492" }]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADERS.join(","));
    expect(lines).toHaveLength(3);
  });
  it("escapes values containing commas and quotes", () => {
    const csv = buildOrdersCsv([row]);
    expect(csv).toContain('"John, Mathew"');
    expect(csv).toContain('"Anjali ""AJ"""');
  });
});
