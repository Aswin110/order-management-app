import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  staff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  orderOpsMeta: { upsert: vi.fn(), updateMany: vi.fn() },
  orderAssignment: { create: vi.fn() },
  orderNote: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof mocks) => unknown) => fn(mocks)),
}));

vi.mock("../app/db.server", () => ({ default: mocks, prisma: mocks }));

import { assignOrder, createStaff } from "../app/services/staff.server";
import { addOrderNote, deleteOrderNote } from "../app/services/notes.server";

describe("staff assignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns an order to an active staff member of the same shop", async () => {
    mocks.staff.findFirst.mockResolvedValue({ id: "staff-1" });
    mocks.orderAssignment.create.mockResolvedValue({});
    mocks.orderOpsMeta.upsert.mockResolvedValue({});

    await assignOrder({ shopId: "shop-1", shopifyOrderId: "gid://shopify/Order/1", staffId: "staff-1" });

    expect(mocks.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "staff-1", shopId: "shop-1", active: true } }),
    );
    expect(mocks.orderAssignment.create).toHaveBeenCalled();
    expect(mocks.orderOpsMeta.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ assignedStaffId: "staff-1" }),
        update: { assignedStaffId: "staff-1" },
      }),
    );
  });

  it("refuses staff from another shop (shop isolation)", async () => {
    mocks.staff.findFirst.mockResolvedValue(null);
    await expect(
      assignOrder({ shopId: "shop-2", shopifyOrderId: "gid://shopify/Order/1", staffId: "staff-1" }),
    ).rejects.toThrow("Staff member not found");
  });

  it("requires a name for new staff", async () => {
    await expect(createStaff({ shopId: "s", name: "  " })).rejects.toThrow("name is required");
  });
});

describe("internal notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a note and the overlay preview in one transaction", async () => {
    mocks.orderNote.create.mockResolvedValue({ id: "note-1" });
    mocks.orderOpsMeta.upsert.mockResolvedValue({});
    await addOrderNote({
      shopId: "shop-1",
      shopifyOrderId: "gid://shopify/Order/1",
      content: "Call customer before shipping",
    });
    expect(mocks.$transaction).toHaveBeenCalled();
    expect(mocks.orderOpsMeta.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          latestNote: "Call customer before shipping",
          notesCount: 1,
        }),
        update: expect.objectContaining({
          latestNote: "Call customer before shipping",
          notesCount: { increment: 1 },
        }),
      }),
    );
  });

  it("rejects empty notes", async () => {
    await expect(
      addOrderNote({ shopId: "s", shopifyOrderId: "o", content: "   " }),
    ).rejects.toThrow("cannot be empty");
  });

  it("deletes a note and recomputes the overlay preview", async () => {
    mocks.orderNote.findFirst
      .mockResolvedValueOnce({ id: "note-1", shopifyOrderId: "gid://shopify/Order/1" })
      .mockResolvedValueOnce({ content: "next note" });
    mocks.orderNote.delete.mockResolvedValue({});
    mocks.orderNote.count.mockResolvedValue(1);
    mocks.orderOpsMeta.updateMany.mockResolvedValue({ count: 1 });
    await deleteOrderNote("shop-1", "note-1");
    expect(mocks.orderOpsMeta.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { latestNote: "next note", notesCount: 1 },
      }),
    );
  });
});
