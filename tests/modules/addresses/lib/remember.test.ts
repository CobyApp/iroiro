import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberAddress } from "@/modules/addresses/lib/remember";

const findFirst = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const count = vi.fn();
const create = vi.fn();
const del = vi.fn();

const tx = {
  accountAddress: { findFirst, updateMany, update, count, create, delete: del },
} as never;

const ADDR = {
  recipientName: "홍길동",
  recipientPhone: "010-1111-2222",
  zipcode: "12345",
  baseAddress: "서울시 어딘가",
  detailAddress: "101호",
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(null);
  updateMany.mockResolvedValue({ count: 0 });
  update.mockResolvedValue({});
  count.mockResolvedValue(0);
  create.mockResolvedValue({});
  del.mockResolvedValue({});
});

describe("rememberAddress", () => {
  it("동일 배송지가 있으면 새로 만들지 않고 기본으로 승격한다", async () => {
    findFirst.mockResolvedValue({ id: 5n });
    await rememberAddress(tx, "acc", ADDR);
    // 기존 기본 해제 후 그 배송지를 기본으로.
    expect(updateMany).toHaveBeenCalledWith({
      where: { accountId: "acc", isDefault: true },
      data: { isDefault: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 5n },
      data: expect.objectContaining({ isDefault: true }),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("새 배송지는 기존 기본을 해제하고 기본으로 저장한다", async () => {
    await rememberAddress(tx, "acc", ADDR);
    expect(updateMany).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "acc",
        baseAddress: "서울시 어딘가",
        detailAddress: "101호",
        isDefault: true,
      }),
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("주소록이 가득 차면 가장 오래된 것을 지우고 저장한다", async () => {
    count.mockResolvedValue(20);
    findFirst
      .mockResolvedValueOnce(null) // 동일 배송지 조회
      .mockResolvedValueOnce({ id: 9n }); // 가장 오래된 것
    await rememberAddress(tx, "acc", ADDR);
    expect(del).toHaveBeenCalledWith({ where: { id: 9n } });
    expect(create).toHaveBeenCalled();
  });

  it("빈 상세주소는 null 로 정규화한다", async () => {
    await rememberAddress(tx, "acc", { ...ADDR, detailAddress: "   " });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ detailAddress: null }),
    });
  });
});
