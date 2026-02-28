import { PropertyCardDto, StoredPropertyRecord } from "../types/property";

export function toPropertyCardDto(record: StoredPropertyRecord): PropertyCardDto {
  const contract = record.parsed_contract;
  const streetView = record.street_view;

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
    street_view: {
      status: streetView?.status || "unavailable",
      image_url:
        streetView?.status === "available"
          ? `/api/properties/${record.id}/street-view`
          : null,
      last_checked_at_iso: streetView?.last_checked_at_iso || null,
      source_address: streetView?.source_address || null,
      resolved_address: streetView?.resolved_address || null,
      latitude: streetView?.latitude ?? null,
      longitude: streetView?.longitude ?? null,
      target_latitude: streetView?.target_latitude ?? null,
      target_longitude: streetView?.target_longitude ?? null,
      heading: streetView?.heading ?? null,
      pano_id: streetView?.pano_id || null,
    },
  };
}
