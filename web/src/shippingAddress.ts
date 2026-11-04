import type { ShippingAddress } from "./types";

export const EMPTY_ADDRESS: ShippingAddress = { name: "", line1: "", line2: "", city: "", state: "", postal_code: "", phone: "" };

export const STATE_GROUPS: { label: string; states: [string, string][] }[] = [
  {
    label: "Territories",
    states: [
      ["GU", "Guam"],
      ["MP", "Northern Marianas"],
      ["PR", "Puerto Rico"],
      ["VI", "U.S. Virgin Islands"],
      ["AS", "American Samoa"],
    ],
  },
  {
    label: "Military",
    states: [
      ["AA", "AA Military Americas"],
      ["AE", "AE Military Europe"],
      ["AP", "AP Military Pacific"],
    ],
  },
  {
    label: "States",
    states: [
      ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
      ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
      ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
      ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
      ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
      ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
      ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"],
      ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
      ["WI", "Wisconsin"], ["WY", "Wyoming"],
    ],
  },
];
const STATES = new Set(STATE_GROUPS.flatMap((group) => group.states.map(([code]) => code)));
export const MILITARY_STATES = new Set(["AA", "AE", "AP"]);
const ZIP_RULES: Record<string, [RegExp, string]> = {
  GU: [/^969[123]\d/, "Guam ZIP codes run from 96910 to 96932."],
  MP: [/^9695[012]/, "Northern Mariana Islands ZIP codes are 96950, 96951 or 96952."],
  PR: [/^00[679]/, "Puerto Rico ZIP codes start with 006, 007 or 009."],
  VI: [/^008/, "U.S. Virgin Islands ZIP codes start with 008."],
  AS: [/^96799/, "The American Samoa ZIP code is 96799."],
  HI: [/^96[78]/, "Hawaii ZIP codes start with 967 or 968."],
  AK: [/^99[5-9]/, "Alaska ZIP codes start with 995 to 999."],
  AA: [/^340/, "AA military ZIP codes start with 340."],
  AE: [/^09/, "AE military ZIP codes start with 09."],
  AP: [/^96[2-6]/, "AP military ZIP codes start with 962 to 966."],
};

export function cleanAddress(address: ShippingAddress): ShippingAddress {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ");
  return {
    name: clean(address.name),
    line1: clean(address.line1),
    line2: clean(address.line2),
    city: clean(address.city),
    state: clean(address.state).toUpperCase(),
    postal_code: clean(address.postal_code),
    phone: clean(address.phone),
  };
}
// Mirrors the server's rules, so most mistakes are caught before a quote is requested.
export function addressErrors(raw: ShippingAddress): Partial<Record<keyof ShippingAddress, string>> {
  const address = cleanAddress(raw);
  const errors: Partial<Record<keyof ShippingAddress, string>> = {};
  if (!address.name) errors.name = "Enter the name of the person receiving this.";
  if (!address.line1) errors.line1 = "Enter a street address or PO box.";
  if (!address.city) errors.city = "Enter a city.";
  if (!STATES.has(address.state)) errors.state = "Choose a state or territory.";
  else if (MILITARY_STATES.has(address.state) && !["APO", "FPO", "DPO"].includes(address.city.toUpperCase()))
    errors.city = "For a military address, the city is APO, FPO or DPO.";
  if (!/^\d{5}(-\d{4})?$/.test(address.postal_code)) errors.postal_code = "Enter a 5-digit ZIP code.";
  else if (ZIP_RULES[address.state] && !ZIP_RULES[address.state][0].test(address.postal_code))
    errors.postal_code = ZIP_RULES[address.state][1];
  return errors;
}

// sessionStorage only: an address must not outlive this tab.
const KEY = "tyt-shipping-address";
export function readAddress(): ShippingAddress {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!saved || typeof saved !== "object") return EMPTY_ADDRESS;
    return Object.fromEntries(
      (Object.keys(EMPTY_ADDRESS) as (keyof ShippingAddress)[]).map((field) => [field, typeof saved[field] === "string" ? saved[field] : ""])
    ) as unknown as ShippingAddress;
  } catch {
    return EMPTY_ADDRESS;
  }
}
export function saveAddress(address: ShippingAddress) {
  sessionStorage.setItem(KEY, JSON.stringify(address));
}
export function clearAddress() {
  sessionStorage.removeItem(KEY);
}
