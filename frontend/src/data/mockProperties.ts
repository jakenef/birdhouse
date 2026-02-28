import type { ApiProperty } from "../types/property";

export const MOCK_PROPERTIES: ApiProperty[] = [
  {
    id: "mock-1",
    property_name: "6150 Hahn Run Suite 008, Park City, UT 84605",
    address_full: "6150 Hahn Run Suite 008, Park City, UT 84605",
    purchase_price: 424106,
    effective_date: "2026-03-04",
    settlement_deadline: "2026-04-30",
    status: "Under Contract",
    next_deadline: "2026-03-12",
  },
  {
    id: "mock-2",
    property_name: "123 Main St, Park City, UT 84060",
    address_full: "123 Main St, Park City, UT 84060",
    purchase_price: 515000,
    effective_date: "2026-03-09",
    settlement_deadline: "2026-05-02",
    status: "Listed",
    next_deadline: null,
  },
];
