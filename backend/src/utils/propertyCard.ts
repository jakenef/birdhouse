import { PropertyCardDto, StoredPropertyRecord } from "../types/property";

export function toPropertyCardDto(record: StoredPropertyRecord): PropertyCardDto {
  const contract = record.parsed_contract;

  return {
    id: record.id,
    property_name: record.property_name,
    doc_hash: contract.metadata.doc_hash,
    address_full: contract.property.address_full,
    city: contract.property.city,
    state: contract.property.state,
    zip: contract.property.zip,
    purchase_price: contract.money.purchase_price,
    buyers: contract.parties.buyers,
    sellers: contract.parties.sellers,
    effective_date: contract.key_dates.effective_date,
    settlement_deadline: contract.key_dates.settlement_deadline,
    created_at_iso: record.created_at_iso,
    updated_at_iso: record.updated_at_iso,
  };
}
